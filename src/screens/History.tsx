import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { useMemo, useState } from 'react';
import { addDays, averageSleep, carbTarget, e1rm, estimateEnergy, formatMinutes, roundTo, sevenDayAverage, sumEntries, weeklyRate, weightTrend } from '../core/calc';
import { saveSettings } from '../core/db';
import { EXERCISES, TEMPLATES } from '../core/program';
import { benchProgress } from '../core/progression';
import { dailyIntake, dailyWater, loadHistory, metricsOf, saveMetric, today } from '../core/store';
import type { MetricType, Settings } from '../core/types';
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

/** The lifts you can follow over time, one main lift per muscle group, with short names. */
const TRACKED: Record<string, string> = {
  bench: 'Bench Press',
  squat: 'Squat',
  rdl: 'Romanian Deadlift',
  barbellRow: 'Barbell Row',
  dbShoulderPress: 'Shoulder Press',
  hipThrust: 'Hip Thrust',
  ezCurl: 'Curl',
  cableCrunch: 'Cable Crunch',
};
const LIFTS = Object.keys(TRACKED);
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
  const isBench = lift === 'bench';
  // Bench works toward 225 until changed; other lifts have no goal (a dash) until you set one.
  const goal = isBench ? (settings.benchGoal ?? 225) : settings.liftGoals?.[lift];
  const points = useMemo(() => best[lift] ?? [], [best, lift]);
  const labels = useMemo(() => (points.length ? points.map((b) => short(b.date)) : emptyDays(30)), [points]);
  const series = useMemo<Series[]>(
    () =>
      points.length
        ? [
            { label: 'Estimated max', data: points.map((b) => roundTo(b.e1rm, 1)), color: FITNESS.exercise },
            ...(goal ? [{ label: 'Goal', data: points.map(() => goal), color: 'rgba(255,255,255,0.3)' }] : []),
          ]
        : [],
    [points, goal],
  );
  const logged = LIFTS.filter((id) => best[id]?.length);
  const top = points.length ? Math.max(...points.map((b) => b.e1rm)) : null;
  // Change over the last 30 days: latest against the last session at least 30 days before it
  // (or the first session, if you've been logging this lift for less than a month).
  const change = useMemo(() => {
    const last = points.at(-1);
    if (!last || points.length < 2) return null;
    const cutoff = addDays(last.date, -30);
    const base = [...points].reverse().find((b) => b.date <= cutoff) ?? points[0];
    return Math.round(last.e1rm - base.e1rm);
  }, [points]);

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
                    ['Goal', goal ? fmt(goal) : null, goal ? 'LB' : undefined, () => setEditingGoal(true)],
                  ]
                : [
                    ['Best', top ? fmt(top) : null, top ? 'LB' : undefined],
                    ['Change', change === null ? null : `${change > 0 ? '+' : ''}${change}`, change === null ? undefined : 'LB'],
                    ['Goal', goal ? fmt(goal) : null, goal ? 'LB' : undefined, () => setEditingGoal(true)],
                  ]
            }
          />
          {goal ? <Bar value={top ?? (isBench ? trainingMax : 0)} target={goal} color={FITNESS.exercise} className="mt-4" /> : null}
          <div className="fit-chart">
            <LineChart labels={labels} series={series} unit=" lb" height={150} />
          </div>
        </FitCard>
      </div>
      <NumberPrompt
        opened={editingGoal}
        title={`${TRACKED[lift]} Goal`}
        unit="lb"
        initial={goal ? String(goal) : top ? String(Math.ceil((top * 1.1) / 5) * 5) : undefined}
        min={5}
        max={1500}
        onCancel={() => setEditingGoal(false)}
        onSave={async (n) => {
          const g = Math.round(n);
          await saveSettings(isBench ? { benchGoal: g } : { liftGoals: { ...settings.liftGoals, [lift]: g } });
          setEditingGoal(false);
          toast(`Goal set to ${fmt(g)} lb`);
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

const SIZE_KEY = 'zoro.history.size';

/**
 * Body measurements as one card, like the lifts: pick waist, arm or forearm from the title's
 * menu; latest (tap to log today's), the change over the last 30 days and since you started,
 * then its chart.
 */
function Measurements() {
  const toast = useToast();
  const [type, setType] = useState<MetricType>(() => {
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      return SIZES.some((x) => x.type === saved) ? (saved as MetricType) : 'waist';
    } catch {
      return 'waist';
    }
  });
  const size = SIZES.find((x) => x.type === type)!;
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [logging, setLogging] = useState(false);
  const list = useLiveQuery(() => metricsOf(type, 730, db), [type]) ?? [];
  const latest = list.at(-1);
  const labels = useMemo(() => (list.length ? list.map((m) => short(m.date)) : emptyDays(30)), [list]);
  const series = useMemo<Series[]>(() => (list.length ? [{ label: size.label, data: list.map((m) => m.value), color: FITNESS.body }] : []), [list, size.label]);
  const signed = (n: number | null) => (n === null ? null : `${n > 0 ? '+' : ''}${fmt(n, 2)}`);
  // Change over 30 days: latest against the last measurement at least 30 days before it.
  const month = useMemo(() => {
    if (!latest || list.length < 2) return null;
    const cutoff = addDays(latest.date, -30);
    const base = [...list].reverse().find((m) => m.date <= cutoff) ?? list[0];
    return latest.value - base.value;
  }, [list, latest]);
  const start = list[0]?.value ?? size.start;
  const total = latest && start !== undefined && list.length + (size.start === undefined ? 0 : 1) > 1 ? latest.value - start : null;

  return (
    <>
      <FitCard
        title={
          <button type="button" className="lift-picker" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())} aria-label={`Measurement: ${size.label}. Choose another`}>
            {size.label}
            <Sym name="chevron.up.chevron.down" size={13} />
          </button>
        }
      >
        <StatGrid
          color={FITNESS.body}
          items={[
            ['Latest', latest ? fmt(latest.value, 2) : null, latest ? 'IN' : undefined, () => setLogging(true)],
            ['30 Days', signed(month), month === null ? undefined : 'IN'],
            ['Since Start', signed(total), total === null ? undefined : 'IN'],
          ]}
        />
        <div className="fit-chart">
          <LineChart labels={labels} series={series} unit=" in" height={140} />
        </div>
      </FitCard>
      <Menu
        anchor={menu}
        onClose={() => setMenu(null)}
        items={SIZES.map((x) => ({
          label: x.label,
          icon: x.type === type ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => {
            setType(x.type);
            try {
              localStorage.setItem(SIZE_KEY, x.type);
            } catch {
              /* remembered until the app closes */
            }
          },
        }))}
      />
      <NumberPrompt
        opened={logging}
        title={size.label}
        unit="in"
        initial={latest ? fmt(latest.value, 2) : size.start ? fmt(size.start, 2) : undefined}
        max={80}
        onCancel={() => setLogging(false)}
        onSave={async (n) => {
          await saveMetric(type, n, today(), db);
          setLogging(false);
          toast('Saved');
        }}
      />
    </>
  );
}

function Body() {
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const avg7 = sevenDayAverage(weights, today());
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

        <Measurements />
      </div>



    </>
  );
}

type NutrientId = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'water';
/** What the Food card can follow, with units and colors (the same as Today's bars). */
const NUTRIENTS: Record<NutrientId, { label: string; unit: string; color: string }> = {
  kcal: { label: 'Calories', unit: 'kcal', color: FITNESS.move },
  protein: { label: 'Protein', unit: 'g', color: FITNESS.exercise },
  carbs: { label: 'Carbs', unit: 'g', color: FITNESS.carbs },
  fat: { label: 'Fat', unit: 'g', color: FITNESS.steps },
  fiber: { label: 'Fiber', unit: 'g', color: '#30d158' },
  water: { label: 'Water', unit: 'oz', color: FITNESS.distance },
};
const NUTRIENT_KEY = 'zoro.history.nutrient';

/**
 * Food over time as one card, like the lifts: pick calories, protein, carbs, fat, fiber or water
 * from the title's menu. Today, the 7-day average and the target (tap to change; carbs follow
 * from the others), a month's chart against the target, and the days below in the same unit.
 * Calories also show your estimated burn and offer the target it suggests.
 */
function Food() {
  const settings = useSettings();
  const toast = useToast();
  const [id, setId] = useState<NutrientId>(() => {
    try {
      const saved = localStorage.getItem(NUTRIENT_KEY);
      return saved && saved in NUTRIENTS ? (saved as NutrientId) : 'kcal';
    } catch {
      return 'kcal';
    }
  });
  const n = NUTRIENTS[id];
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [editing, setEditing] = useState(false);
  const since = addDays(today(), -29);
  const entries = useLiveQuery(() => db.entries.where('date').aboveOrEqual(since).toArray(), [since]) ?? [];
  const water = useLiveQuery(() => dailyWater(30, db), []) ?? [];
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(35, db), []) ?? [];
  const energy = estimateEnergy(intake, weightTrend(weights), settings.targetRate);

  // Each of the last 30 days: the nutrient's total, or null if nothing was logged that day.
  const days = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const date = addDays(today(), i - 29);
        if (id === 'water') {
          const oz = water.find((w) => w.date === date)?.oz;
          return { date, value: oz ? oz : null };
        }
        const list = entries.filter((e) => e.date === date);
        if (!list.length) return { date, value: null };
        const t = sumEntries(list);
        return { date, value: id === 'fiber' ? list.reduce((s, e) => s + (e.macros.fiber ?? 0), 0) : t[id] };
      }),
    [entries, water, id],
  );
  const target =
    id === 'kcal'
      ? settings.kcalTarget
      : id === 'protein'
        ? settings.proteinTarget
        : id === 'carbs'
          ? carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget)
          : id === 'fat'
            ? settings.fatTarget
            : id === 'water'
              ? settings.waterTargetOz
              : settings.fiberTarget;
  const todayValue = days.at(-1)?.value ?? null;
  // The 7 days before today, counting only days you logged.
  const week = days.slice(-8, -1).filter((d) => d.value !== null);
  const avg = week.length ? week.reduce((s, d) => s + (d.value ?? 0), 0) / week.length : null;
  const labels = useMemo(() => days.map((d) => short(d.date)), [days]);
  const series = useMemo<Series[]>(
    () =>
      days.some((d) => d.value !== null)
        ? [
            { label: n.label, data: days.map((d) => (d.value === null ? null : Math.round(d.value))), color: n.color },
            ...(target ? [{ label: 'Target', data: days.map(() => target), color: 'rgba(255,255,255,0.3)' }] : []),
          ]
        : [],
    [days, n, target],
  );
  const UNIT = n.unit.toUpperCase();
  const editable = id !== 'carbs';
  const save = async (v: number) => {
    const r = Math.round(v);
    const patch: Partial<Settings> =
      id === 'kcal' ? { kcalTarget: r } : id === 'protein' ? { proteinTarget: r } : id === 'fat' ? { fatTarget: r } : id === 'water' ? { waterTargetOz: r } : { fiberTarget: r };
    await saveSettings(patch);
    setEditing(false);
    toast(`Target set to ${fmt(r)} ${n.unit}`);
  };

  return (
    <>
      <div className="fit-stack">
        <FitCard
          title={
            <button type="button" className="lift-picker" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())} aria-label={`Showing ${n.label}. Choose another`}>
              {n.label}
              <Sym name="chevron.up.chevron.down" size={13} />
            </button>
          }
        >
          <StatGrid
            color={n.color}
            items={[
              id === 'kcal'
                ? ['Burn', energy ? fmt(energy.tdee) : null, energy ? UNIT : undefined]
                : ['Today', todayValue === null ? null : fmt(todayValue), todayValue === null ? undefined : UNIT],
              ['7-Day Avg', avg === null ? null : fmt(avg), avg === null ? undefined : UNIT],
              ['Target', target ? fmt(target) : null, target ? UNIT : undefined, editable ? () => setEditing(true) : undefined],
            ]}
          />
          <div className="fit-chart">
            <LineChart labels={labels} series={series} unit={` ${n.unit}`} height={140} />
          </div>
          {id === 'kcal' && energy && Math.abs(energy.recommended - settings.kcalTarget) >= 100 && (
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
      <Menu
        anchor={menu}
        onClose={() => setMenu(null)}
        items={(Object.keys(NUTRIENTS) as NutrientId[]).map((k) => ({
          label: NUTRIENTS[k].label,
          icon: k === id ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => {
            setId(k);
            try {
              localStorage.setItem(NUTRIENT_KEY, k);
            } catch {
              /* remembered until the app closes */
            }
          },
        }))}
      />
      <NumberPrompt
        opened={editing}
        title={`${n.label} Target`}
        unit={n.unit}
        initial={target ? String(target) : undefined}
        min={1}
        max={id === 'kcal' ? 6000 : 1000}
        onCancel={() => setEditing(false)}
        onSave={(v) => void save(v)}
      />
      <Section title="By Day">
        {[...days]
          .reverse()
          .filter((d) => d.value !== null)
          .slice(0, 14)
          .map((d) => (
            <Row key={d.date} title={longDate(d.date)} right={`${fmt(d.value ?? 0)} ${n.unit}`} />
          ))}
        {!days.some((d) => d.value !== null) && <EmptyRow>No {n.label} Logged</EmptyRow>}
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
