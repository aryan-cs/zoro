import { useLiveQuery } from 'dexie-react-hooks';
import { Block, BlockTitle, Button, List, ListInput, ListItem, Navbar, Page, Segmented, SegmentedButton } from 'konsta/react';
import { useMemo, useState } from 'react';
import { addDays, averageSleep, e1rm, estimateEnergy, formatMinutes, roundTo, sevenDayAverage, weeklyRate, weightTrend } from '../core/calc';
import { saveSettings } from '../core/db';
import { EXERCISES } from '../core/program';
import { parseSleepImport, sleepFromTimes } from '../core/sleep';
import { dailyIntake, loadHistory, metricsOf, saveMetric, saveSleep, today } from '../core/store';
import type { MetricType } from '../core/types';
import { LineChart, type Series } from '../ui/LineChart';
import { db, fmt, fmtLb, NumField, Stat, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

type Seg = 'weight' | 'sleep' | 'lifts' | 'size';
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

function WeightTab() {
  const toast = useToast();
  const settings = useSettings();
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(35, db), []) ?? [];
  const [input, setInput] = useState('');
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const avg7 = sevenDayAverage(weights, today());
  const energy = estimateEnergy(intake, trend, settings.targetRate);

  const recent = trend.filter((t) => t.date >= addDays(today(), -90));
  const labels = useMemo(() => recent.map((t) => short(t.date)), [recent]);
  const series = useMemo<Series[]>(
    () => [
      { label: 'Weigh-in', data: recent.map((t) => t.weight), color: 'rgba(0,122,255,0.45)', dots: true },
      { label: 'Trend', data: recent.map((t) => roundTo(t.trend, 0.1)), color: '#007aff' },
    ],
    [recent],
  );

  const save = async () => {
    const v = parseFloat(input);
    if (!Number.isFinite(v) || v < 80 || v > 400) return toast('Enter your weight in lb.');
    await saveMetric('weight', v, today(), db);
    setInput('');
    toast('Weight saved');
  };

  return (
    <>
      <Block strong inset className="!my-3 flex items-center justify-between gap-3">
        <span className="text-[15px]">Today's weight</span>
        <div className="flex items-center gap-2">
          <NumField value={input} onChange={setInput} placeholder="lb" width="w-20" label="Weight in pounds" />
          <Button small rounded inline onClick={() => void save()}>
            Save
          </Button>
        </div>
      </Block>
      <div className="mx-4 grid grid-cols-3 gap-2">
        <Stat label="Trend" value={last ? fmt(last.trend, 1) : '—'} />
        <Stat label="7-day avg" value={avg7 ? fmt(avg7, 1) : '—'} />
        <Stat
          label="Per week"
          value={rate === null ? '—' : `${rate > 0 ? '+' : ''}${fmt(rate, 2)}`}
          sub={`Goal ${settings.targetRate > 0 ? '+' : ''}${settings.targetRate}`}
        />
      </div>
      {recent.length > 1 && (
        <Block strong inset className="!my-3">
          <LineChart labels={labels} series={series} unit=" lb" />
        </Block>
      )}

      <BlockTitle>Calories</BlockTitle>
      <Block strong inset className="!my-2 space-y-2 text-[15px]">
        {energy ? (
          <>
            <div className="flex justify-between">
              <span>You burn about</span>
              <span className="tabular font-semibold">{fmt(energy.tdee)} kcal/day</span>
            </div>
            <div className="flex justify-between">
              <span>You've averaged</span>
              <span className="tabular">{fmt(energy.avgIntake)} kcal/day</span>
            </div>
            <div className="flex justify-between">
              <span>To hit {settings.targetRate} lb/week</span>
              <span className="tabular font-semibold text-[#007aff]">{fmt(energy.recommended)} kcal</span>
            </div>
            {Math.abs(energy.recommended - settings.kcalTarget) >= 100 && (
              <Button
                rounded
                tonal
                onClick={async () => {
                  await saveSettings({ kcalTarget: energy.recommended });
                  toast(`Target set to ${fmt(energy.recommended)} kcal`);
                }}
              >
                Use {fmt(energy.recommended)} as my target
              </Button>
            )}
            <div className="text-[12px] text-black/45 dark:text-white/50">Based on {energy.daysUsed} days of food logs and your weight trend.</div>
          </>
        ) : (
          <div className="text-black/60 dark:text-white/60">
            Log your food and weigh in most mornings for 2 weeks. Zoro will then estimate what you burn and suggest a calorie target. Until then, stick
            with {fmt(settings.kcalTarget)}.
          </div>
        )}
      </Block>
    </>
  );
}

function SleepTab() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const entries = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(addDays(today(), -60)).sortBy('date'), []) ?? [];
  const [bed, setBed] = useState('23:30');
  const [wake, setWake] = useState('07:00');
  const [paste, setPaste] = useState('');
  const lastNight = entries.find((e) => e.date === today());
  const avg = averageSleep(entries, today());

  const recent = entries.filter((e) => e.date >= addDays(today(), -30));
  const labels = useMemo(() => recent.map((e) => short(e.date)), [recent]);
  const series = useMemo<Series[]>(() => [{ label: 'Sleep', data: recent.map((e) => roundTo(e.minutes / 60, 0.1)), color: '#5856d6' }], [recent]);

  const importText = async (text: string) => {
    const s = parseSleepImport(text);
    if (!s) return toast("That doesn't look like sleep data from the Shortcut.");
    await saveSleep(s, db);
    setPaste('');
    toast(`Saved ${formatMinutes(s.minutes)} for ${short(s.date)}`);
  };
  const saveManual = async () => {
    const s = sleepFromTimes(today(), bed, wake);
    if (!s) return toast('Check the times.');
    await saveSleep(s, db);
    toast(`Saved ${formatMinutes(s.minutes)}`);
  };

  return (
    <>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <Stat label="Last night" value={lastNight ? formatMinutes(lastNight.minutes) : '—'} />
        <Stat label="7-night average" value={avg ? formatMinutes(avg) : '—'} sub={`Goal ${formatMinutes(settings.sleepTargetMin)}`} />
      </div>

      <BlockTitle>From Apple Health</BlockTitle>
      <Block strong inset className="!my-2 space-y-3">
        <a href="shortcuts://run-shortcut?name=Zoro%20Sleep" className="block rounded-xl bg-[#5856d6]/12 py-3 text-center text-[16px] font-medium text-[#5856d6]">
          Run the Zoro Sleep shortcut
        </a>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text) {
              e.preventDefault();
              void importText(text);
            }
          }}
          rows={2}
          placeholder="Then tap here and paste"
          className="w-full rounded-xl bg-black/5 p-3 outline-none dark:bg-white/10"
        />
        {paste.trim() && (
          <Button rounded onClick={() => void importText(paste)}>
            Import
          </Button>
        )}
        <button type="button" className="text-[14px] text-[#007aff]" onClick={() => nav.push({ name: 'sleepSetup' })}>
          How to set up the shortcut
        </button>
      </Block>

      <BlockTitle>Enter by hand (last night)</BlockTitle>
      <List strong inset className="!my-2">
        <ListInput label="Fell asleep" type="time" value={bed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBed(e.target.value)} />
        <ListInput label="Woke up" type="time" value={wake} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWake(e.target.value)} />
      </List>
      <Block className="!my-2">
        <Button rounded tonal onClick={() => void saveManual()}>
          Save
        </Button>
      </Block>

      {recent.length > 1 && (
        <Block strong inset className="!my-3">
          <LineChart labels={labels} series={series} unit=" h" />
        </Block>
      )}
    </>
  );
}

const LIFTS = ['bench', 'pausedBench', 'squat', 'rdl', 'inclineBarbell', 'barbellRow', 'hipThrust', 'closeGripBench', 'dbShoulderPress', 'pullup'];

function LiftsTab() {
  const history = useLiveQuery(() => loadHistory(db, 365), []) ?? [];
  const best = useMemo(() => {
    const out: Record<string, { date: string; e1rm: number; weight: number; reps: number }[]> = {};
    for (const h of [...history].reverse()) {
      for (const id of LIFTS) {
        const sets = h.sets.filter((s) => s.exerciseId === id && s.weight > 0);
        if (!sets.length) continue;
        const top = sets.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a));
        (out[id] ??= []).push({ date: h.date, e1rm: e1rm(top.weight, top.reps), weight: top.weight, reps: top.reps });
      }
    }
    return out;
  }, [history]);
  const bench = [...(best.bench ?? []), ...(best.pausedBench ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const labels = useMemo(() => bench.map((b) => short(b.date)), [bench]);
  const series = useMemo<Series[]>(
    () => [
      { label: 'Estimated max', data: bench.map((b) => roundTo(b.e1rm, 1)), color: '#007aff' },
      { label: 'Goal', data: bench.map(() => 225), color: 'rgba(52,199,89,0.6)' },
    ],
    [bench],
  );

  return (
    <>
      <BlockTitle>Bench estimated max</BlockTitle>
      {bench.length > 1 ? (
        <Block strong inset className="!my-2">
          <LineChart labels={labels} series={series} unit=" lb" />
        </Block>
      ) : (
        <Block className="!my-2 text-[14px] text-black/50 dark:text-white/55">Log a couple of bench sessions to see your trend.</Block>
      )}
      <BlockTitle>Best recent sets</BlockTitle>
      <List strong inset dividers className="!my-2">
        {LIFTS.map((id) => {
          const list = best[id];
          const latest = list?.[list.length - 1];
          const top = list?.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
          return (
            <ListItem
              key={id}
              title={EXERCISES[id].name}
              subtitle={latest ? `Last: ${fmtLb(latest.weight)} × ${latest.reps} on ${short(latest.date)}` : 'Not logged yet'}
              after={top ? <span className="tabular">{fmt(top.e1rm)} max</span> : undefined}
            />
          );
        })}
      </List>
    </>
  );
}

const SIZES: { type: MetricType; label: string; start?: number }[] = [
  { type: 'waist', label: 'Waist (belly button)', start: 35.25 },
  { type: 'arm', label: 'Flexed arm', start: 16.25 },
  { type: 'forearm', label: 'Forearm', start: 11.625 },
];

function SizeRow({ type, label, start }: { type: MetricType; label: string; start?: number }) {
  const toast = useToast();
  const list = useLiveQuery(() => metricsOf(type, 730, db), [type]) ?? [];
  const [v, setV] = useState('');
  const latest = list[list.length - 1];
  const base = list[0]?.value ?? start;
  const change = latest && base !== undefined ? latest.value - base : null;
  return (
    <ListItem
      title={label}
      subtitle={
        latest
          ? `${fmt(latest.value, 2)}" on ${short(latest.date)}${change !== null && change !== 0 ? ` · ${change > 0 ? '+' : ''}${fmt(change, 2)}" since start` : ''}`
          : start
            ? `Start: ${fmt(start, 2)}"`
            : 'Not measured yet'
      }
      after={
        <div className="flex items-center gap-2">
          <NumField value={v} onChange={setV} placeholder="in" width="w-16" label={label} />
          <Button
            small
            rounded
            inline
            onClick={async () => {
              const n = parseFloat(v);
              if (!Number.isFinite(n) || n <= 0) return;
              await saveMetric(type, n, today(), db);
              setV('');
              toast('Saved');
            }}
          >
            Save
          </Button>
        </div>
      }
    />
  );
}

function SizeTab() {
  return (
    <>
      <List strong inset dividers className="!my-3">
        {SIZES.map((s) => (
          <SizeRow key={s.type} {...s} />
        ))}
      </List>
      <Block className="!my-2 text-[13px] text-black/50 dark:text-white/55">
        Measure every 4 weeks, in the morning, same spot each time. Targets by June: waist 31–32", arm ~16" lean, forearm 12–12½".
      </Block>
    </>
  );
}

export function BodyScreen() {
  const [seg, setSeg] = useState<Seg>('weight');
  const segs: [Seg, string][] = [
    ['weight', 'Weight'],
    ['sleep', 'Sleep'],
    ['lifts', 'Lifts'],
    ['size', 'Size'],
  ];
  return (
    <Page className="tab-safe">
      <Navbar
        large
        transparent
        centerTitle
        title="Body"
        subnavbar={
          <Segmented strong>
            {segs.map(([id, label]) => (
              <SegmentedButton key={id} active={seg === id} onClick={() => setSeg(id)}>
                {label}
              </SegmentedButton>
            ))}
          </Segmented>
        }
      />
      {seg === 'weight' && <WeightTab />}
      {seg === 'sleep' && <SleepTab />}
      {seg === 'lifts' && <LiftsTab />}
      {seg === 'size' && <SizeTab />}
    </Page>
  );
}
