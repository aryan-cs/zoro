import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { useMemo, useState } from 'react';
import { addDays, averageSleep, e1rm, estimateEnergy, formatMinutes, roundTo, sevenDayAverage, sumEntries, weeklyRate, weightTrend } from '../core/calc';
import { saveSettings } from '../core/db';
import { EXERCISES, TEMPLATES } from '../core/program';
import { dailyIntake, dailyWater, loadHistory, metricsOf, saveMetric, today } from '../core/store';
import type { MetricType } from '../core/types';
import { LineChart, type Series } from '../ui/LineChart';
import { Cell, db, dim, fmt, fmtLb, Header, NumberPrompt, Row, Section, Seg, useSettings, useToast, EmptyRow } from '../ui/kit';
import { useNav } from '../ui/nav';
import { longDate } from './Today';

type Tab = 'lifts' | 'body' | 'food' | 'sleep';
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/** Three numbers side by side in one card. */
function Stats({ items }: { items: [string, string, string?][] }) {
  return (
    <Cell className="!px-0 !py-0">
      <div className="-mx-4 grid grid-cols-3">
        {items.map(([label, value, sub], i) => (
          <div key={label} className={`px-4 py-2.5 ${i ? 'border-l border-white/10' : ''}`}>
            <div className={`text-[13px] ${dim}`}>{label}</div>
            <div className="tabular text-[20px] font-semibold leading-tight">{value}</div>
            {sub && <div className={`text-[13px] ${dim}`}>{sub}</div>}
          </div>
        ))}
      </div>
    </Cell>
  );
}

const LIFTS = ['bench', 'pausedBench', 'squat', 'rdl', 'inclineBarbell', 'barbellRow', 'hipThrust', 'closeGripBench', 'dbShoulderPress', 'pullup'];

function Lifts() {
  const nav = useNav();
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
      { label: 'Estimated max', data: bench.map((b) => roundTo(b.e1rm, 1)), color: '#0a84ff' },
      { label: 'Goal', data: bench.map(() => 225), color: 'rgba(255,255,255,0.3)' },
    ],
    [bench],
  );
  const logged = LIFTS.filter((id) => best[id]?.length);

  return (
    <>
      <Section title="Bench Estimated Max">
        {bench.length > 1 ? (
          <Cell className="py-3">
            <LineChart labels={labels} series={series} unit=" lb" height={150} />
          </Cell>
        ) : (
          <EmptyRow>Needs 2 Sessions</EmptyRow>
        )}
      </Section>

      <Section title="Workouts">
        {history.length === 0 && <EmptyRow>No Workouts</EmptyRow>}
        {history.slice(0, 15).map((h) => (
          <Row
            key={h.sessionId}
            title={TEMPLATES[h.templateId].name}
            sub={longDate(h.date)}
            right={`${h.sets.length} ${h.sets.length === 1 ? 'set' : 'sets'}`}
            chevron
            onClick={() => nav.push({ name: 'workout', sessionId: h.sessionId })}
          />
        ))}
      </Section>

      {logged.length > 0 && (
        <Section title="Best Sets">
          {logged.map((id) => {
            const list = best[id];
            const latest = list[list.length - 1];
            const top = list.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
            return (
              <Row key={id} title={EXERCISES[id].name} sub={`Last: ${fmtLb(latest.weight)} × ${latest.reps} on ${short(latest.date)}`} right={`${fmt(top.e1rm)} max`} />
            );
          })}
        </Section>
      )}
    </>
  );
}

const SIZES: { type: MetricType; label: string; start?: number }[] = [
  { type: 'waist', label: 'Waist', start: 35.25 },
  { type: 'arm', label: 'Flexed arm', start: 16.25 },
  { type: 'forearm', label: 'Forearm', start: 11.625 },
];

function SizeRow({ type, label, start }: { type: MetricType; label: string; start?: number }) {
  const toast = useToast();
  const list = useLiveQuery(() => metricsOf(type, 730, db), [type]) ?? [];
  const [editing, setEditing] = useState(false);
  const latest = list[list.length - 1];
  const base = list[0]?.value ?? start;
  const change = latest && base !== undefined ? latest.value - base : null;
  return (
    <>
      <Row
        title={label}
        sub={latest ? `${short(latest.date)}${change ? ` · ${change > 0 ? '+' : ''}${fmt(change, 2)}" since start` : ''}` : start ? `Start ${fmt(start, 2)}"` : 'Not measured'}
        right={latest ? `${fmt(latest.value, 2)}"` : 'Add'}
        chevron
        onClick={() => setEditing(true)}
      />
      <NumberPrompt
        opened={editing}
        title={label === 'Flexed arm' ? 'Flexed Arm' : label}
        unit="in"
        initial={latest ? fmt(latest.value, 2) : start ? fmt(start, 2) : undefined}
        max={80}
        onCancel={() => setEditing(false)}
        onSave={async (n) => {
          await saveMetric(type, n, today(), db);
          setEditing(false);
          toast('Saved');
        }}
      />
    </>
  );
}

function Body() {
  const toast = useToast();
  const settings = useSettings();
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(35, db), []) ?? [];
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const avg7 = sevenDayAverage(weights, today());
  const energy = estimateEnergy(intake, trend, settings.targetRate);

  const recent = trend.filter((t) => t.date >= addDays(today(), -90));
  const labels = useMemo(() => recent.map((t) => short(t.date)), [recent]);
  const series = useMemo<Series[]>(
    () => [
      { label: 'Weigh-in', data: recent.map((t) => t.weight), color: 'rgba(10,132,255,0.45)', dots: true },
      { label: 'Trend', data: recent.map((t) => roundTo(t.trend, 0.1)), color: '#0a84ff' },
    ],
    [recent],
  );

  return (
    <>
      <Section title="Weight">
        <Stats
          items={[
            ['Trend', last ? fmt(last.trend, 1) : '—'],
            ['7-day avg', avg7 ? fmt(avg7, 1) : '—'],
            ['Per week', rate === null ? '—' : `${rate > 0 ? '+' : ''}${fmt(rate, 2)}`, `goal ${settings.targetRate > 0 ? '+' : ''}${settings.targetRate}`],
          ]}
        />
        {recent.length > 1 && (
          <Cell className="py-3">
            <LineChart labels={labels} series={series} unit=" lb" height={150} />
          </Cell>
        )}
      </Section>

      <Section title="Daily Calories">
        {energy ? (
          <>
            <Row title="Burn per Day" right={`${fmt(energy.tdee)} kcal`} />
            <Row title="Average Intake" right={`${fmt(energy.avgIntake)} kcal`} />
            <Row title={`For ${settings.targetRate} lb/week`} right={<span className="font-semibold text-accent">{fmt(energy.recommended)} kcal</span>} />
            {Math.abs(energy.recommended - settings.kcalTarget) >= 100 && (
              <Row
                accent
                title={`Set Target to ${fmt(energy.recommended)}`}
                onClick={async () => {
                  await saveSettings({ kcalTarget: energy.recommended });
                  toast(`Target set to ${fmt(energy.recommended)} kcal`);
                }}
              />
            )}
          </>
        ) : (
          <EmptyRow>Needs 2 Weeks of Logs</EmptyRow>
        )}
      </Section>

      <Section title="Measurements">
        {SIZES.map((s) => (
          <SizeRow key={s.type} {...s} />
        ))}
      </Section>
    </>
  );
}

function Food() {
  const settings = useSettings();
  const since = addDays(today(), -13);
  const entries = useLiveQuery(() => db.entries.where('date').aboveOrEqual(since).toArray(), [since]) ?? [];
  const water = useLiveQuery(() => dailyWater(14, db), []) ?? [];
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today(), -i);
      const t = sumEntries(entries.filter((e) => e.date === d));
      out.push({ date: d, ...t, oz: water.find((w) => w.date === d)?.oz ?? 0 });
    }
    return out;
  }, [entries, water]);
  const logged = days.filter((d) => d.kcal > 0);
  const week = logged.filter((d) => d.date > addDays(today(), -7) && d.date !== today());
  const avg = (k: 'kcal' | 'protein' | 'oz', list = week) => (list.length ? list.reduce((s, d) => s + d[k], 0) / list.length : 0);
  const pastWater = days.slice(1, 8).filter((d) => d.oz > 0);
  const chartDays = [...logged].reverse();
  const series = useMemo<Series[]>(
    () => [
      { label: 'Calories', data: chartDays.map((d) => Math.round(d.kcal)), color: '#ff9f0a' },
      { label: 'Target', data: chartDays.map(() => settings.kcalTarget), color: 'rgba(255,255,255,0.3)' },
    ],
    [chartDays, settings.kcalTarget],
  );

  return (
    <>
      <Section title="7-Day Averages">
        <Stats
          items={[
            ['Calories', week.length ? fmt(avg('kcal')) : '—', `goal ${fmt(settings.kcalTarget)}`],
            ['Protein', week.length ? `${fmt(avg('protein'))} g` : '—', `goal ${settings.proteinTarget} g`],
            ['Water', pastWater.length ? `${fmt(avg('oz', pastWater))} oz` : '—', `goal ${settings.waterTargetOz} oz`],
          ]}
        />
        {chartDays.length > 1 && (
          <Cell className="py-3">
            <LineChart labels={chartDays.map((d) => short(d.date))} series={series} unit=" kcal" height={140} />
          </Cell>
        )}
      </Section>
      <Section title="By Day">
        {days
          .filter((d) => d.kcal > 0 || d.oz > 0)
          .map((d) => (
            <Row key={d.date} title={longDate(d.date)} sub={`${fmt(d.protein)} g protein · ${fmt(d.oz)} oz water`} right={`${fmt(d.kcal)} kcal`} />
          ))}
        {!logged.length && !water.length && <EmptyRow>No Food Logs</EmptyRow>}
      </Section>
    </>
  );
}

function Sleep() {
  const settings = useSettings();
  const entries = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(addDays(today(), -60)).sortBy('date'), []) ?? [];
  const lastNight = entries.find((e) => e.date === today());
  const avg = averageSleep(entries, today());
  const recent = entries.filter((e) => e.date >= addDays(today(), -30));
  const labels = useMemo(() => recent.map((e) => short(e.date)), [recent]);
  const series = useMemo<Series[]>(() => [{ label: 'Sleep', data: recent.map((e) => roundTo(e.minutes / 60, 0.1)), color: '#bf5af2' }], [recent]);

  return (
    <>
      <Section title="Sleep">
        <Stats
          items={[
            ['Last night', lastNight ? formatMinutes(lastNight.minutes) : '—'],
            ['7-night avg', avg ? formatMinutes(avg) : '—'],
            ['Goal', formatMinutes(settings.sleepTargetMin)],
          ]}
        />
        {recent.length > 1 && (
          <Cell className="py-3">
            <LineChart labels={labels} series={series} unit=" h" height={140} />
          </Cell>
        )}
      </Section>
      <Section title="Nights">
        {[...entries]
          .reverse()
          .slice(0, 14)
          .map((e) => (
            <Row
              key={e.date}
              title={longDate(e.date)}
              sub={e.bedtime && e.wakeTime ? `${new Date(e.bedtime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(e.wakeTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined}
              right={formatMinutes(e.minutes)}
            />
          ))}
        {!entries.length && <EmptyRow>No Sleep Logs</EmptyRow>}
      </Section>
    </>
  );
}

export function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('lifts');
  return (
    <Page className="tab-safe">
      <Header title="History">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            ['lifts', 'Lifts'],
            ['body', 'Body'],
            ['food', 'Food'],
            ['sleep', 'Sleep'],
          ]}
        />
      </Header>
      {tab === 'lifts' && <Lifts />}
      {tab === 'body' && <Body />}
      {tab === 'food' && <Food />}
      {tab === 'sleep' && <Sleep />}
    </Page>
  );
}
