import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page } from 'konsta/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, averageSleep, carbTarget, e1rm, estimateEnergy, formatMinutes, roundTo, sevenDayAverage, sumEntries, weeklyRate, weightTrend } from '../core/calc';
import { saveSettings } from '../core/db';
import { EXERCISES, TEMPLATES } from '../core/program';
import { benchState } from '../core/progression';
import { dailyIntake, dailyWater, deleteLiftEntry, liftEntries, loadHistory, metricsOf, saveLiftEntry, saveMetric, today, waterGoalOn } from '../core/store';
import { bestSetsByDay } from '../core/lifts';
import type { LiftEntry, Settings } from '../core/types';
import { hrMin } from '../core/say';
import { clockLabel, insightNote, nightStats, scoreNote, sleepAfter, sleepDebt, sleepRoutine, sleepScore, stageTargets, trendNote } from '../core/sleepStats';
import { Hypnogram, STAGE_COLORS } from '../ui/Hypnogram';
import { LineChart, type Series } from '../ui/LineChart';
import { Bar, db, FITNESS, FitCard, FitStat, fmt, fmtLb, Header, LogBtn, Menu, NumberPrompt, NumField, RING_GRADIENT, RingSummary, Row, Section, Seg, useFitRow, useHoldInfo, useSettings, useToast, EmptyRow } from '../ui/kit';
import { Sym } from '../ui/Sym';
import { Box, Boxes, ShowHidden } from '../ui/boxes';
import { Pager } from '../ui/pager';
import { useNav } from '../ui/nav';
import { longDate } from './Today';

export type HistoryTab = 'lifts' | 'body' | 'food' | 'sleep';
type Tab = HistoryTab;
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const shortDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Stats side by side in a Fitness card: label over a colored SF Rounded value. Empty values are a dash. */
/** How far back History's charts go (the 30D button at the top right): 7, 30 or 90 days. */
type Range = 7 | 30 | 90;
const RangeContext = createContext<Range>(30);
const RANGE_KEY = 'zoro.history.range';
/** The first date inside the chosen range. */
const rangeStart = (days: Range) => addDays(today(), -(days - 1));

/** Date labels for the last `n` days, for a chart with nothing in it yet. */
function emptyDays(n: number) {
  return Array.from({ length: n }, (_, i) => short(addDays(today(), i - n + 1)));
}

/** Up to three stats in a row; one with an edit handler (a target or goal) is tappable. */
function StatGrid({ items, color, info }: { items: [string, string | null, string?, (() => void)?][]; color: string; info?: Record<string, string> }) {
  // Long values (1,986 KCAL) shrink together rather than being cut off.
  const row = useRef<HTMLDivElement>(null);
  useFitRow(row, items.map((i) => `${i[1]}${i[2] ?? ''}`).join('|'));
  return (
    <div ref={row} className="fit-grid3">
      {items.map(([label, value, unit, onEdit]) =>
        onEdit ? (
          <button key={label} type="button" className="fit-stat-edit" onClick={onEdit} aria-label={`${label}: ${value ?? 'none'}${unit ? ` ${unit.toLowerCase()}` : ''}. Edit`}>
            <FitStat label={label} value={value} unit={unit} color={color} small info={info?.[label]} />
          </button>
        ) : (
          <FitStat key={label} label={label} value={value} unit={unit} color={color} small info={info?.[label]} />
        ),
      )}
    </div>
  );
}

/** What each stat means, in plain words, for touch and hold. */
const LIFT_INFO: Record<string, string> = {
  'Training Max': 'The weight your bench sessions are worked out from, a little under your true one-rep max. It goes up as you complete the program.',
  Best: 'Your heaviest set recently, as an estimated one-rep max: the most you could lift once, worked out from the weight and reps you did.',
  Change: 'How much your best has gone up or down over the last 30 days.',
  Goal: 'The weight you’re working toward for this lift. Tap it to change it.',
};
const SIZE_INFO: Record<string, string> = {
  Latest: 'Your most recent measurement. Tap it to log today’s.',
  '30 Days': 'How much it changed over the last 30 days.',
  'Since Start': 'How much it’s changed since your first measurement.',
};
const WEIGHT_INFO: Record<string, string> = {
  Trend: 'Your weight with day-to-day ups and downs (water, salt, food in your stomach) smoothed out. It’s the best guide to where your weight is really heading.',
  '7-Day Avg': 'The average of your weigh-ins over the last seven days.',
  'Per Week': 'How fast your trend weight is changing, in pounds a week.',
};
const FOOD_INFO: Record<string, string> = {
  Burn: 'Roughly how many calories you burn in a day, worked out from what you’ve eaten and how your weight has changed.',
  Today: 'How much you’ve had so far today.',
  '7-Day Avg': 'Your daily average over the last seven days.',
  Target: 'What you’re aiming for each day. Tap it to change it.',
};

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
  const history = useLiveQuery(() => loadHistory(db, 365), []) ?? [];
  // Sets entered by hand (the card's + button) count the same as sets from workouts.
  const manual = useLiveQuery(() => liftEntries(365, db), []) ?? [];
  const best = useMemo(
    () => bestSetsByDay([...history.flatMap((h) => h.sets), ...manual.map((m) => ({ ...m, manual: true }))], LIFTS),
    [history, manual],
  );
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
  const [entering, setEntering] = useState(false);
  const todays = manual.find((m) => m.exerciseId === lift && m.date === today());
  const settings = useSettings();
  const toast = useToast();
  const isBench = lift === 'bench';
  // Bench works toward 225 until changed; other lifts have no goal (a dash) until you set one.
  const goal = isBench ? (settings.benchGoal ?? 225) : settings.liftGoals?.[lift];
  const range = useContext(RangeContext);
  const points = useMemo(() => (best[lift] ?? []).filter((b) => b.date >= rangeStart(range)), [best, lift, range]);
  const labels = useMemo(() => (points.length ? points.map((b) => short(b.date)) : emptyDays(range)), [points, range]);
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
  const trainingMax = benchState(settings, history.filter((h) => !h.sample)).max;
  return (
    <>
      <div className="fit-stack">
        <Boxes page="history-lifts">
        <Box id="lift">
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
          trailing={<LogBtn logged={!!todays} what={`Today’s ${TRACKED[lift]}`} onClick={() => setEntering(true)} />}
        >
          <StatGrid
            color={FITNESS.exercise}
            info={LIFT_INFO}
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
        </Box>
        </Boxes>
      </div>
      <LiftEntryPrompt
        opened={entering}
        title={TRACKED[lift]}
        entry={todays}
        onCancel={() => setEntering(false)}
        onDelete={async () => {
          setEntering(false);
          if (todays?.id !== undefined) await deleteLiftEntry(todays.id);
          toast('Removed');
        }}
        onSave={async (weight, reps) => {
          setEntering(false);
          await saveLiftEntry({ date: today(), exerciseId: lift, weight, reps });
          toast(`Estimated max: ${fmt(Math.round(e1rm(weight, reps)))} lb`);
        }}
      />
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
      <ShowHidden page="history-lifts" />
    </>
  );
}

/**
 * Enter a set you did outside a workout (a test, a gym visit off the plan): its weight and reps,
 * with the one-rep max they work out to shown as you type (Epley, as for every set). An alert
 * with two fields, like a set's own edit; today's entry opens again to change or remove.
 */
function LiftEntryPrompt(props: {
  opened: boolean;
  title: string;
  entry?: LiftEntry;
  onCancel: () => void;
  onSave: (weight: number, reps: number) => void;
  onDelete: () => void;
}) {
  const [w, setW] = useState('');
  const [r, setR] = useState('');
  useEffect(() => {
    if (!props.opened) return;
    setW(props.entry ? String(props.entry.weight) : '');
    setR(props.entry ? String(props.entry.reps) : '');
  }, [props.opened]); // eslint-disable-line react-hooks/exhaustive-deps
  const wn = parseFloat(w);
  const rn = Math.round(parseFloat(r));
  const valid = Number.isFinite(wn) && wn > 0 && wn <= 2000 && Number.isFinite(rn) && rn >= 1 && rn <= 100;
  const max = valid ? Math.round(e1rm(wn, rn)) : null;
  // At the app's root: inside History's sliding pages a fixed alert is placed relative to them.
  return createPortal(
    <Dialog
      opened={props.opened}
      onBackdropClick={props.onCancel}
      title={props.title}
      content={
        <div className="set-edit">
          <label>
            <span>Weight</span>
            <NumField value={w} onChange={setW} label="Weight" width="w-24" placeholder="lb" />
            <span className="set-edit-unit">lb</span>
          </label>
          <label>
            <span>Reps</span>
            <NumField value={r} onChange={setR} label="Reps" width="w-24" />
            <span className="set-edit-unit" />
          </label>
          <div className="lift-entry-max" aria-live="polite">
            <span>Estimated 1RM</span>
            <strong>{max === null ? '—' : fmt(max)}</strong>
            <span className="set-edit-unit">{max === null ? '' : 'lb'}</span>
          </div>
          {props.entry && (
            <button type="button" className="lift-entry-delete" onClick={props.onDelete}>
              Delete Entry
            </button>
          )}
        </div>
      }
      buttons={
        <>
          <DialogButton onClick={props.onCancel}>Cancel</DialogButton>
          <DialogButton strong disabled={!valid} onClick={() => valid && props.onSave(wn, rn)}>
            Save
          </DialogButton>
        </>
      }
    />,
    document.querySelector('.k-app') ?? document.body,
  );
}

const SIZES: { type: 'waist' | 'arm' | 'forearm' | 'bodyfat'; label: string; unit: string; start?: number }[] = [
  { type: 'waist', label: 'Waist', unit: 'in', start: 35.25 },
  { type: 'arm', label: 'Flexed Arm', unit: 'in', start: 16.25 },
  { type: 'forearm', label: 'Forearm', unit: 'in', start: 11.625 },
  { type: 'bodyfat', label: 'Body Fat', unit: '%' },
];

const SIZE_KEY = 'zoro.history.size';

/**
 * Body measurements as one card, like the lifts: pick waist, arm or forearm from the title's
 * menu; latest (tap to log today's), the change over the last 30 days and since you started,
 * then its chart.
 */
function Measurements() {
  const toast = useToast();
  const [type, setType] = useState<(typeof SIZES)[number]['type']>(() => {
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      return SIZES.some((x) => x.type === saved) ? (saved as (typeof SIZES)[number]['type']) : 'waist';
    } catch {
      return 'waist';
    }
  });
  const size = SIZES.find((x) => x.type === type)!;
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [logging, setLogging] = useState(false);
  const list = useLiveQuery(() => metricsOf(type, 730, db), [type]) ?? [];
  const latest = list.at(-1);
  const range = useContext(RangeContext);
  const shown = useMemo(() => list.filter((m) => m.date >= rangeStart(range)), [list, range]);
  const labels = useMemo(() => (shown.length ? shown.map((m) => short(m.date)) : emptyDays(range)), [shown, range]);
  // Your goal for this measurement (Settings › Goal), as a dashed line.
  const goal = useSettings().goalValues?.[size.type];
  const series = useMemo<Series[]>(
    () =>
      shown.length
        ? [
            { label: size.label, data: shown.map((m) => m.value), color: FITNESS.body },
            ...(goal !== undefined ? [{ label: 'Goal', data: shown.map(() => goal), color: 'rgba(235,235,245,0.45)' }] : []),
          ]
        : [],
    [shown, size.label, goal],
  );
  const U = size.unit.toUpperCase();
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
        trailing={<LogBtn logged={latest?.date === today()} what={`Today’s ${size.label}`} onClick={() => setLogging(true)} />}
      >
        <StatGrid
          color={FITNESS.body}
          info={SIZE_INFO}
          items={[
            ['Latest', latest ? fmt(latest.value, 2) : null, latest ? U : undefined, () => setLogging(true)],
            ['30 Days', signed(month), month === null ? undefined : U],
            ['Since Start', signed(total), total === null ? undefined : U],
          ]}
        />
        <div className="fit-chart">
          <LineChart labels={labels} series={series} unit={size.unit === '%' ? '%' : ` ${size.unit}`} height={140} />
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
        unit={size.unit}
        initial={latest ? fmt(latest.value, 2) : size.start ? fmt(size.start, 2) : undefined}
        max={size.unit === '%' ? 60 : 80}
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
  const toast = useToast();
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const [weighing, setWeighing] = useState(false);
  const latestWeight = weights.at(-1);
  const weighedToday = latestWeight?.date === today();
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const avg7 = sevenDayAverage(weights, today());
  const range = useContext(RangeContext);
  const recent = trend.filter((t) => t.date >= rangeStart(range));
  const labels = useMemo(() => (recent.length ? recent.map((t) => short(t.date)) : emptyDays(range)), [recent, range]);
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
        <Boxes page="history-body">
        <Box id="weight">
        <FitCard title="Weight" trailing={<LogBtn logged={weighedToday} what="Today’s Weight" onClick={() => setWeighing(true)} />}>
          <StatGrid
            color={FITNESS.body}
            info={WEIGHT_INFO}
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

        </Box>
        <Box id="measurements">
          <Measurements />
        </Box>
        </Boxes>
      </div>



      <ShowHidden page="history-body" />
      <NumberPrompt
        opened={weighing}
        title="Morning Weight"
        unit="lb"
        initial={latestWeight ? fmt(latestWeight.value, 1) : undefined}
        min={80}
        max={400}
        onCancel={() => setWeighing(false)}
        onSave={async (v) => {
          await saveMetric('weight', v, today(), db);
          setWeighing(false);
          toast('Weight saved');
        }}
      />
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
  const range = useContext(RangeContext);
  const since = rangeStart(range);
  const entries = useLiveQuery(() => db.entries.where('date').aboveOrEqual(since).toArray(), [since]) ?? [];
  const water = useLiveQuery(() => dailyWater(range, db), [range]) ?? [];
  const weights = useLiveQuery(() => metricsOf('weight', 365, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(35, db), []) ?? [];
  const energy = estimateEnergy(intake, weightTrend(weights), settings.targetRate);

  // Each day in the range: the nutrient's total, or null if nothing was logged that day.
  const days = useMemo(
    () =>
      Array.from({ length: range }, (_, i) => {
        const date = addDays(today(), i - (range - 1));
        if (id === 'water') {
          const oz = water.find((w) => w.date === date)?.oz;
          return { date, value: oz ? oz : null };
        }
        const list = entries.filter((e) => e.date === date);
        if (!list.length) return { date, value: null };
        const t = sumEntries(list);
        return { date, value: id === 'fiber' ? list.reduce((s, e) => s + (e.macros.fiber ?? 0), 0) : t[id] };
      }),
    [entries, water, id, range],
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
        <Boxes page="history-food">
        <Box id="nutrient">
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
            info={FOOD_INFO}
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
        </FitCard>
        </Box>
        </Boxes>
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
      <ShowHidden page="history-food" />
    </>
  );
}

/** A night in the Nights list: tap to see it above, touch and hold for what its numbers mean. */
function NightRow(props: { title: string; right: string; onClick: () => void }) {
  const [score, asleep] = props.right.split(' · ');
  const hold = useHoldInfo(props.title, `${score} is the night’s sleep score, out of 100. ${asleep} is how long you were actually asleep. Tap the night to see it in detail.`);
  return <Row title={props.title} right={props.right} onClick={props.onClick} hold={hold} />;
}

/** The sleep stages, explained for touch and hold on their rings. */
const STAGE_INFO = {
  rem: 'Dreaming sleep, when your brain sorts memories and feelings. Most of it comes in the second half of the night. The ring fills at about a fifth of your sleep goal.',
  core: 'Light sleep, which makes up most of the night. Your body settles and your brain files away what you learned. The ring fills at about half your sleep goal.',
  deep: 'Your most restful sleep, mostly early in the night. It’s when your body repairs muscle and recovers from training. The ring fills at about a sixth of your sleep goal.',
};

/** 18 → "18m", 412 → "6h 52m" */
const dur = (m: number) => (m < 60 ? `${Math.round(m)}m` : formatMinutes(m));

/**
 * Sleep, after Sleep Cycle: the month's trend, then one night in detail (score, stages from
 * Apple Health, efficiency, time to fall asleep, how you felt), then the longer view (sleep debt,
 * your usual times and how steady they are) and how your days go with your nights.
 */
function Sleep() {
  const nav = useNav();
  const settings = useSettings();
  const toast = useToast();
  const [editingGoal, setEditingGoal] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const entries = useLiveQuery(() => db.sleep.where('date').aboveOrEqual(addDays(today(), -95)).sortBy('date'), []) ?? [];
  const range = useContext(RangeContext);
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(addDays(today(), -61)).toArray(), []) ?? [];
  const water = useLiveQuery(() => dailyWater(61, db), []) ?? [];
  const intake = useLiveQuery(() => dailyIntake(61, db), []) ?? [];
  const goal = settings.sleepTargetMin;
  const lastNight = entries.find((e) => e.date === today());
  const avg = averageSleep(entries, today());
  const recent = entries.filter((e) => e.date >= rangeStart(range));
  const labels = useMemo(() => (recent.length ? recent.map((e) => short(e.date)) : emptyDays(range)), [recent, range]);
  const series = useMemo<Series[]>(() => [{ label: 'Sleep', data: recent.map((e) => roundTo(e.minutes / 60, 0.1)), color: FITNESS.sleep }], [recent]);

  const night = (picked ? entries.find((e) => e.date === picked) : undefined) ?? entries.at(-1);
  const stats = night ? nightStats(night) : null;
  const score = night ? sleepScore(night, entries, goal) : null;
  const week = entries.filter((e) => e.date > addDays(today(), -7));
  const weekScore = week.length ? Math.round(week.reduce((n, e) => n + sleepScore(e, entries, goal).score, 0) / week.length) : null;
  const debt = sleepDebt(entries, goal, today());
  const routine = sleepRoutine(entries, today());

  // How the day before goes with the night: training, hitting the water goal, eating over target.
  const trained = new Set(sessions.map((x) => x.date));
  const watered = new Set(water.filter((w) => w.oz >= waterGoalOn(w.date, settings)).map((w) => w.date));
  const over = new Set(intake.filter((d) => d.kcal > settings.kcalTarget).map((d) => d.date));
  const insights = [
    { short: 'Workouts', phrase: 'after days you train', minutes: sleepAfter(entries, (d) => trained.has(d)) },
    { short: 'Water Goal', phrase: 'after days you hit your water goal', minutes: sleepAfter(entries, (d) => watered.has(d)) },
    { short: 'Over Target', phrase: 'after days you eat over your target', minutes: sleepAfter(entries, (d) => over.has(d)) },
  ];
  // What each sleep stat means, in plain words, for touch and hold.
  const g = hrMin(goal);
  const after = (what: string) => `How much longer (or shorter) you sleep after days you ${what}, compared with days you don’t.`;
  const info: Record<string, string> = {
    'Last Night': 'How long you were actually asleep last night, not counting time lying awake.',
    '7-Night Avg': 'Your average sleep over the last seven nights you logged. A pattern matters more than one short night.',
    Goal: `How much sleep you’re aiming for each night, now ${g}. Most adults do best with 7 to 9 hours. Tap it to change it.`,
    Score: `A rating of the night out of 100. Half of it is how long you slept against your ${g} goal, 30% is how well you slept, and 20% is how close you kept to your usual bedtime and wake-up.`,
    Asleep: 'Time actually asleep, from falling asleep to waking up, minus any time you were awake in between.',
    Efficiency: 'How much of your time in bed you spent asleep. 85% or more is good.',
    Duration: `How close you came to your ${g} goal, out of 100. Sleeping your whole goal scores 100.`,
    Quality: 'How well you slept, out of 100: little time awake, enough deep and REM sleep, falling asleep quickly, and how rested you felt.',
    Routine: 'How close your bedtime and wake-up were to your usual times over the past week, out of 100. Being an hour and a half off scores 0.',
    'Time in Bed': 'From getting into bed to getting up, including the time it took to fall asleep and any time awake.',
    'Fell Asleep': 'How long it took you to fall asleep after getting into bed. Under 20 minutes is typical.',
    Awakenings: 'Times you woke for two minutes or more in the night. A few are normal, and you won’t remember most of them.',
    'Avg Score': 'Your average sleep score over the last seven nights.',
    'Sleep Debt': `How much less sleep than your ${g} goal you got over the last two weeks, added up. A little extra sleep over the next few nights pays it down.`,
    'Varies By': 'How much your bedtime changes from night to night. Within half an hour is steady, and steady bedtimes tend to mean better sleep.',
    Bedtime: 'When you usually fall asleep, averaged over the last two weeks.',
    'Wake-Up': 'When you usually wake up, averaged over the last two weeks.',
    Workouts: after('train'),
    'Water Goal': after('hit your water goal'),
    'Over Target': after('eat more than your calorie target'),
  };
  const signedText = (m: number | null) => (m === null ? null : `${m >= 0 ? '+' : '−'}${dur(Math.abs(m))}`);

  return (
    <>
      <div className="fit-stack">
        <Boxes page="history-sleep">
        <Box id="sleep">
        <FitCard title="Sleep" trailing={<LogBtn logged={!!lastNight} what="Last Night’s Sleep" onClick={() => nav.push({ name: 'logSleep' })} />}>
          <StatGrid
            color={FITNESS.sleep}
            info={info}
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

        </Box>
        {night && stats && score && (
          <Box id="night">
          <FitCard title={night.date === today() ? 'Last Night' : longDate(night.date)}>
            <StatGrid
              color={FITNESS.sleep}
            info={info}
              items={[
                ['Asleep', formatMinutes(stats.asleep)],
                ['Time in Bed', formatMinutes(stats.inBed)],
                ['Efficiency', stats.efficiency === null ? null : `${Math.round(stats.efficiency * 100)}%`],
              ]}
            />
            {night.stages?.length ? (
              <>
                <div className="fit-chart">
                  <Hypnogram spans={night.stages} onset={night.bedtime} />
                </div>
                <RingSummary
                  rows={(['rem', 'core', 'deep'] as const).map((st) => ({
                    label: st === 'rem' ? 'REM' : st === 'core' ? 'Core' : 'Deep',
                    value: stats.stages![st] + (st === 'core' ? stats.stages!.asleep : 0),
                    target: stageTargets(goal)[st],
                    unit: 'MIN',
                    color: STAGE_COLORS[st],
                    gradient: RING_GRADIENT[st],
                    glyph: st === 'rem' ? 'eye.fill' : st === 'core' ? 'moon.fill' : 'moon.zzz.fill',
                    info: STAGE_INFO[st],
                  }))}
                />
              </>
            ) : (
              <p className="sleep-no-stages">Wear your Apple Watch to bed to see your sleep stages here.</p>
            )}
          </FitCard>
          </Box>
        )}

        {night && stats && score && (
          <Box id="score">
            {/* The night's score, once: the number, its three parts, and the one that cost the most. */}
            <FitCard title="Score">
              <FitStat value={String(score.score)} unit="/ 100" color={FITNESS.sleep} info={info.Score} infoTitle="Score" />
              <div className="mt-3" />
              <StatGrid
                color={FITNESS.sleep}
            info={info}
                items={[
                  ['Duration', String(score.duration)],
                  ['Quality', score.quality === null ? null : String(score.quality)],
                  ['Routine', score.routine === null ? null : String(score.routine)],
                ]}
              />
              <p className="fit-card-note">{scoreNote(night, entries, goal)}</p>
            </FitCard>

          </Box>
        )}
        {night && stats && score && (
          <Box id="in-bed">
            {/* The night itself: getting to sleep, waking in it, and how you felt after. */}
            <FitCard title="In Bed">
              <StatGrid
                color={FITNESS.sleep}
            info={info}
                items={[
                  ['Fell Asleep', stats.latency === null ? null : dur(stats.latency)],
                ]}
              />
              <div className="fit-card-row">
                <span>Woke Up</span>
                <Seg<number>
                  className="is-compact w-52"
                  value={night.quality ?? 0}
                  onChange={(q) => night.id !== undefined && void db.sleep.update(night.id, { quality: q as 1 | 3 | 5 })}
                  options={[
                    [1, 'Tired'],
                    [3, 'OK'],
                    [5, 'Rested'],
                  ]}
                />
              </div>
            </FitCard>
          </Box>
        )}

        {/* The last two weeks: how well, how much you're short, and how steady your times are. */}
        <Box id="two-weeks">
        <FitCard title="Last Two Weeks">
          <StatGrid
            color={FITNESS.sleep}
            info={info}
            items={[
              ['Avg Score', weekScore === null ? null : String(weekScore)],
              ['Sleep Debt', entries.length ? dur(debt) : null],
              ['Varies By', routine ? `±${dur(routine.spread)}` : null],
            ]}
          />
          <div className="fit-grid3 mt-3">
            <FitStat label="Bedtime" value={routine ? clockLabel(routine.bed) : null} color={FITNESS.sleep} small info={info.Bedtime} />
            <FitStat label="Wake-Up" value={routine ? clockLabel(routine.wake) : null} color={FITNESS.sleep} small info={info['Wake-Up']} />
          </div>
          {trendNote(entries, goal, today()) && <p className="fit-card-note">{trendNote(entries, goal, today())}</p>}
        </FitCard>

        </Box>
        {/* How your days go with your nights: extra sleep after each habit, against days without. */}
        <Box id="sleep-after">
        <FitCard title="Sleep After">
          <StatGrid color={FITNESS.sleep} info={info} items={insights.map((i) => [i.short, signedText(i.minutes)] as [string, string | null])} />
          <p className="fit-card-note">{insightNote(insights)}</p>
        </FitCard>
        </Box>
        </Boxes>
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
      <Section title="Nights" footer={entries.length ? 'Tap a night to see it in detail above.' : undefined}>
        {[...entries]
          .reverse()
          .slice(0, 14)
          .map((e) => (
            <NightRow
              key={e.date}
              title={longDate(e.date)}
              right={`${sleepScore(e, entries, goal).score} · ${formatMinutes(e.minutes)}`}
              onClick={() => {
                setPicked(e.date);
                document.querySelector('.k-page[aria-hidden="false"], .k-page')?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}
        {!entries.length && <EmptyRow>No Sleep Logs</EmptyRow>}
      </Section>
      <ShowHidden page="history-sleep" />
    </>
  );
}

const TABS: Tab[] = ['lifts', 'body', 'food', 'sleep'];

export function HistoryScreen({ initial }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'lifts');
  const pageRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>(() => {
    try {
      const saved = Number(localStorage.getItem(RANGE_KEY));
      return saved === 7 || saved === 90 ? saved : 30;
    } catch {
      return 30;
    }
  });
  const [rangeMenu, setRangeMenu] = useState<DOMRect | null>(null);
  return (
    <Page className="tab-safe">
      <Header
        title="History"
        right={
          <button type="button" className="ios-navbtn is-text ios-glass range-pill" aria-label={`Showing the last ${range} days. Change`} onClick={(e) => setRangeMenu(e.currentTarget.getBoundingClientRect())}>
            {range}D
            <Sym name="chevron.up.chevron.down" size={11} />
          </button>
        }
      >
        <Seg
          value={tab}
          onChange={(t) => {
            // Each section starts at its top: the page scrolls back up as the sections slide.
            pageRef.current?.closest('.k-page')?.scrollTo({ top: 0, behavior: 'smooth' });
            setTab(t);
          }}
          options={[
            ['lifts', 'Lifts'],
            ['body', 'Body'],
            ['food', 'Food'],
            ['sleep', 'Sleep'],
          ]}
        />
      </Header>
      <div ref={pageRef} />
      <RangeContext.Provider value={range}>
        <Pager index={TABS.indexOf(tab)} pages={[<Lifts key="l" />, <Body key="b" />, <Food key="f" />, <Sleep key="s" />]} />
      </RangeContext.Provider>
      <Menu
        anchor={rangeMenu}
        onClose={() => setRangeMenu(null)}
        items={([7, 30, 90] as Range[]).map((d) => ({
          label: `Last ${d} Days`,
          icon: d === range ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => {
            setRange(d);
            try {
              localStorage.setItem(RANGE_KEY, String(d));
            } catch {
              /* remembered until the app closes */
            }
          },
        }))}
      />
    </Page>
  );
}
