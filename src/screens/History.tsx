import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { useMemo, useState } from 'react';
import { addDays, averageSleep, e1rm, estimateEnergy, formatMinutes, roundTo, sevenDayAverage, sumEntries, weeklyRate, weightTrend } from '../core/calc';
import { saveSettings } from '../core/db';
import { EXERCISES, TEMPLATES } from '../core/program';
import { benchProgress } from '../core/progression';
import { dailyIntake, dailyWater, loadHistory, metricsOf, saveMetric, today } from '../core/store';
import type { MetricType } from '../core/types';
import { LineChart, type Series } from '../ui/LineChart';
import { Bar, Btn, db, FITNESS, FitCard, FitStat, fmt, fmtLb, Header, Menu, NumberPrompt, Row, Section, Seg, useSettings, useToast, EmptyRow } from '../ui/kit';
import { Sym } from '../ui/Sym';
import { useNav } from '../ui/nav';
import { longDate } from './Today';

export type HistoryTab = 'lifts' | 'body' | 'food' | 'sleep';
type Tab = HistoryTab;
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const shortDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Stats side by side in a Fitness card: label over a colored SF Rounded value. Empty values are a dash. */
/** Date labels for the last `n` days, for a chart with nothing in it yet. */
function emptyDays(n: number) {
  return Array.from({ length: n }, (_, i) => short(addDays(today(), i - n + 1)));
}

/** Up to three stats in a row; one with an edit handler (a target or goal) is tappable. */
function StatGrid({ items, color }: { items: [string, string | null, string?, (() => void)?][]; color: string }) {
  return (
    <div className="fit-grid3">
      {items.map(([label, value, unit, onEdit]) =>
        onEdit ? (
          <button key={label} type="button" className="fit-stat-edit" onClick={onEdit} aria-label={`${label}: ${value ?? 'none'}${unit ? ` ${unit.toLowerCase()}` : ''}. Edit`}>
            <FitStat label={label} value={value} unit={unit} color={color} small />
          </button>
        ) : (
          <FitStat key={label} label={label} value={value} unit={unit} color={color} small />
        ),
      )}
    </div>
  );
}

const LIFTS = ['bench', 'pausedBench', 'squat', 'rdl', 'inclineBarbell', 'barbellRow', 'hipThrust', 'closeGripBench', 'dbShoulderPress', 'pullup'];

/** The main lifts you can follow over time (estimated max per session), with short names. */
const TRACKED: Record<string, string> = {
  bench: 'Bench Press',
  squat: 'Squat',
  rdl: 'Romanian Deadlift',
  pausedBench: 'Paused Bench',
  inclineBarbell: 'Incline Press',
  closeGripBench: 'Close-Grip Bench',
  barbellRow: 'Barbell Row',
  hipThrust: 'Hip Thrust',
  dbShoulderPress: 'Shoulder Press',
};
const LIFT_KEY = 'zoro.history.lift';

function Lifts() {
  const nav = useNav();
  const history = useLiveQuery(() => loadHistory(db, 365, true), []) ?? [];
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
  // The lift being followed, picked from the card's title menu and remembered.
  const [lift, setLift] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LIFT_KEY);
      return saved && saved in TRACKED ? saved : 'bench';
    } catch {
      return 'bench';
    }
  });
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const settings = useSettings();
  const toast = useToast();
  const goal = settings.benchGoal ?? 225;
  const points = useMemo(() => best[lift] ?? [], [best, lift]);
  const isBench = lift === 'bench';
  const labels = useMemo(() => (points.length ? points.map((b) => short(b.date)) : emptyDays(30)), [points]);
  const series = useMemo<Series[]>(
    () =>
      points.length
        ? [
            { label: 'Estimated max', data: points.map((b) => roundTo(b.e1rm, 1)), color: FITNESS.exercise },
            ...(isBench ? [{ label: 'Goal', data: points.map(() => goal), color: 'rgba(255,255,255,0.3)' }] : []),
          ]
        : [],
    [points, isBench, goal],
  );
  const logged = LIFTS.filter((id) => best[id]?.length);
  const top = points.length ? Math.max(...points.map((b) => b.e1rm)) : null;
  const latest = points.at(-1)?.e1rm ?? null;
  const change = points.length > 1 ? Math.round(points.at(-1)!.e1rm - points[0].e1rm) : null;

  // The max your bench weights come from (it steps up as you finish 12-step blocks).
  const trainingMax = benchProgress(settings, history.filter((h) => !h.sample)).newMax ?? settings.benchMax;
  return (
    <>
      <div className="fit-stack">
        <FitCard
          title={
            <button
              type="button"
              className="lift-picker"
              onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
              aria-label={`Lift: ${TRACKED[lift]}. Choose another`}
            >
              {TRACKED[lift]}
              <Sym name="chevron.up.chevron.down" size={13} />
            </button>
          }
        >
          <StatGrid
            color={FITNESS.exercise}
            items={
              isBench
                ? [
                    ['Training Max', fmt(trainingMax), 'LB'],
                    ['Best', top ? fmt(top) : null, top ? 'LB' : undefined],
                    ['Goal', fmt(goal), 'LB', () => setEditingGoal(true)],
                  ]
                : [
                    ['Best', top ? fmt(top) : null, top ? 'LB' : undefined],
                    ['Latest', latest ? fmt(latest) : null, latest ? 'LB' : undefined],
                    ['Change', change === null ? null : `${change > 0 ? '+' : ''}${change}`, change === null ? undefined : 'LB'],
                  ]
            }
          />
          {isBench && <Bar value={top ?? trainingMax} target={goal} color={FITNESS.exercise} className="mt-4" />}
          <div className="fit-chart">
            <LineChart labels={labels} series={series} unit=" lb" height={150} />
          </div>
        </FitCard>
      </div>
      <NumberPrompt
        opened={editingGoal}
        title="Bench Goal"
        unit="lb"
        initial={String(goal)}
        min={45}
        max={1000}
        onCancel={() => setEditingGoal(false)}
        onSave={async (n) => {
          await saveSettings({ benchGoal: Math.round(n) });
          setEditingGoal(false);
          toast(`Goal set to ${fmt(Math.round(n))} lb`);
        }}
      />
      <Menu
        anchor={menu}
        onClose={() => setMenu(null)}
        items={Object.entries(TRACKED).map(([id, name]) => ({
          label: name,
          icon: id === lift ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => {
            setLift(id);
            try {
              localStorage.setItem(LIFT_KEY, id);
            } catch {
              /* remembered until the app closes */
            }
          },
        }))}
      />

      <Section title="Workouts">
        {history.length === 0 && <EmptyRow>No Workouts</EmptyRow>}
        {history.slice(0, 15).map((h) => (
          <Row
            key={h.sessionId}
            title={TEMPLATES[h.templateId].name}
            right={shortDay(h.date)}
            chevron
            onClick={() => nav.push({ name: 'workout', sessionId: h.sessionId })}
          />
        ))}
      </Section>

      {logged.length > 0 && (
        <Section title="Best Sets">
          {logged.map((id) => {
            const top = best[id].reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
            return <Row key={id} title={EXERCISES[id].name} right={`${fmtLb(top.weight)} × ${top.reps}`} />;
          })}
        </Section>
      )}
    </>
  );
}

const SIZES: { type: MetricType; label: string; start?: number }[] = [
  { type: 'waist', label: 'Waist', start: 35.25 },
  { type: 'arm', label: 'Flexed Arm', start: 16.25 },
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
        right={latest ? `${fmt(latest.value, 2)}"${change ? ` (${change > 0 ? '+' : ''}${fmt(change, 2)})` : ''}` : '—'}
        chevron
        onClick={() => setEditing(true)}
      />
      <NumberPrompt
        opened={editing}
        title={label}
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
  const [editing, setEditing] = useState<'kcal' | null>(null);
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(35, db), []) ?? [];
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const avg7 = sevenDayAverage(weights, today());
  const energy = estimateEnergy(intake, trend, settings.targetRate);
  const calDays = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(today(), i - 29)), []);
  const calLabels = useMemo(() => calDays.map(short), [calDays]);
  const calSeries = useMemo<Series[]>(
    () =>
      intake.length
        ? [
            { label: 'Intake', data: calDays.map((d) => { const k = intake.find((x) => x.date === d)?.kcal; return k ? Math.round(k) : null; }), color: FITNESS.move },
            { label: 'Target', data: calDays.map(() => settings.kcalTarget), color: 'rgba(255,255,255,0.3)' },
          ]
        : [],
    [calDays, intake, settings.kcalTarget],
  );

  const recent = trend.filter((t) => t.date >= addDays(today(), -90));
  const labels = useMemo(() => (recent.length ? recent.map((t) => short(t.date)) : emptyDays(30)), [recent]);
  const series = useMemo<Series[]>(
    () => [
      { label: 'Weigh-in', data: recent.map((t) => t.weight), color: 'rgba(255,159,10,0.45)', dots: true },
      { label: 'Trend', data: recent.map((t) => roundTo(t.trend, 0.1)), color: FITNESS.body },
    ],
    [recent],
  );

  return (
    <>
      <div className="fit-stack">
        <FitCard title="Weight">
          <StatGrid
            color={FITNESS.body}
            items={[
              ['Trend', last ? fmt(last.trend, 1) : null, last ? 'LB' : undefined],
              ['7-Day Avg', avg7 ? fmt(avg7, 1) : null, avg7 ? 'LB' : undefined],
              ['Per Week', rate === null ? null : `${rate > 0 ? '+' : ''}${fmt(rate, 2)}`, rate === null ? undefined : 'LB'],
            ]}
          />
          <div className="fit-chart">
            <LineChart labels={labels} series={series} unit=" lb" height={150} />
          </div>
        </FitCard>

        <FitCard title="Daily Calories">
          <StatGrid
            color={FITNESS.move}
            items={[
              ['Burn', energy ? fmt(energy.tdee) : null, energy ? 'KCAL' : undefined],
              ['Intake', energy ? fmt(energy.avgIntake) : null, energy ? 'KCAL' : undefined],
              ['Target', fmt(settings.kcalTarget), 'KCAL', () => setEditing('kcal')],
            ]}
          />
          <div className="fit-chart">
            <LineChart labels={calLabels} series={calSeries} unit=" kcal" height={140} />
          </div>
          {energy && Math.abs(energy.recommended - settings.kcalTarget) >= 100 && (
            <Btn
              size="md"
              className="mt-4 w-full"
              onClick={async () => {
                await saveSettings({ kcalTarget: energy.recommended });
                toast(`Target set to ${fmt(energy.recommended)} kcal`);
              }}
            >
              Use {fmt(energy.recommended)} kcal
            </Btn>
          )}
        </FitCard>
      </div>

      <NumberPrompt
        opened={editing === 'kcal'}
        title="Daily Calories"
        unit="kcal"
        initial={String(settings.kcalTarget)}
        min={800}
        max={6000}
        onCancel={() => setEditing(null)}
        onSave={async (n) => {
          await saveSettings({ kcalTarget: Math.round(n) });
          setEditing(null);
          toast(`Target set to ${fmt(Math.round(n))} kcal`);
        }}
      />

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
      { label: 'Calories', data: chartDays.map((d) => Math.round(d.kcal)), color: FITNESS.move },
      { label: 'Target', data: chartDays.map(() => settings.kcalTarget), color: 'rgba(255,255,255,0.3)' },
    ],
    [chartDays, settings.kcalTarget],
  );

  return (
    <>
      <div className="fit-stack">
        <FitCard title="7-Day Averages">
          <div className="fit-grid3">
            <FitStat label="Calories" value={week.length ? fmt(avg('kcal')) : null} unit={week.length ? 'KCAL' : undefined} color={FITNESS.move} small />
            <FitStat label="Protein" value={week.length ? fmt(avg('protein')) : null} unit={week.length ? 'G' : undefined} color={FITNESS.exercise} small />
            <FitStat label="Water" value={pastWater.length ? fmt(avg('oz', pastWater)) : null} unit={pastWater.length ? 'OZ' : undefined} color={FITNESS.distance} small />
          </div>
          <div className="fit-chart">
            <LineChart labels={chartDays.length ? chartDays.map((d) => short(d.date)) : emptyDays(14)} series={chartDays.length ? series : []} unit=" kcal" height={140} />
          </div>
        </FitCard>
      </div>
      <Section title="By Day">
        {days
          .filter((d) => d.kcal > 0 || d.oz > 0)
          .map((d) => (
            <Row key={d.date} title={longDate(d.date)} right={`${fmt(d.kcal)} kcal`} />
          ))}
        {!logged.length && !water.length && <EmptyRow>No Food Logs</EmptyRow>}
      </Section>
    </>
  );
}

function Sleep() {
  const settings = useSettings();
  const toast = useToast();
  const [editingGoal, setEditingGoal] = useState(false);
  const entries = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(addDays(today(), -60)).sortBy('date'), []) ?? [];
  const lastNight = entries.find((e) => e.date === today());
  const avg = averageSleep(entries, today());
  const recent = entries.filter((e) => e.date >= addDays(today(), -30));
  const labels = useMemo(() => (recent.length ? recent.map((e) => short(e.date)) : emptyDays(30)), [recent]);
  const series = useMemo<Series[]>(() => [{ label: 'Sleep', data: recent.map((e) => roundTo(e.minutes / 60, 0.1)), color: FITNESS.sleep }], [recent]);

  return (
    <>
      <div className="fit-stack">
        <FitCard title="Sleep">
          <StatGrid
            color={FITNESS.sleep}
            items={[
              ['Last Night', lastNight ? formatMinutes(lastNight.minutes) : null],
              ['7-Night Avg', avg ? formatMinutes(avg) : null],
              ['Goal', formatMinutes(settings.sleepTargetMin), undefined, () => setEditingGoal(true)],
            ]}
          />
          <div className="fit-chart">
            <LineChart labels={labels} series={series} unit=" h" height={140} />
          </div>
        </FitCard>
      </div>
      <NumberPrompt
        opened={editingGoal}
        title="Sleep Goal"
        unit="hr"
        initial={String(roundTo(settings.sleepTargetMin / 60, 0.25))}
        min={3}
        max={14}
        onCancel={() => setEditingGoal(false)}
        onSave={async (n) => {
          const min = Math.round((n * 60) / 5) * 5;
          await saveSettings({ sleepTargetMin: min });
          setEditingGoal(false);
          toast(`Goal set to ${formatMinutes(min)}`);
        }}
      />
      <Section title="Nights">
        {[...entries]
          .reverse()
          .slice(0, 14)
          .map((e) => (
            <Row key={e.date} title={longDate(e.date)} right={formatMinutes(e.minutes)} />
          ))}
        {!entries.length && <EmptyRow>No Sleep Logs</EmptyRow>}
      </Section>
    </>
  );
}

export function HistoryScreen({ initial }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'lifts');
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
