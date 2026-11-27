import { e1rm, programWeek, roundTo, type ProgramWeek } from './calc';
import { BENCH_REPEAT_FROM, BENCH_STEPS, DELOAD_WEEKS, EXERCISES, type BenchGroup, type BenchStep } from './program';
import type {
  ExerciseDef,
  ExercisePlan,
  ISODate,
  PrescribedExercise,
  SetLog,
  SetTarget,
  Settings,
  TemplateId,
  WorkoutTemplate,
} from './types';

/** One past workout with its logged sets. */
export interface HistorySession {
  sessionId: number;
  date: ISODate;
  templateId: TemplateId;
  deload?: boolean;
  benchStep?: number;
  /** Left by the old sample week. */
  sample?: boolean;
  finishedAt?: number;
  /** How many sets its plan had, when known. */
  plannedSets?: number;
  sets: SetLog[];
}

export interface WorkoutPlan {
  templateId: TemplateId;
  name: string;
  week: ProgramWeek;
  deload: boolean;
  /** Bench table step this session is (undefined if it shouldn't count toward the table). */
  benchStep?: number;
  /** The bench max the plan's weights come from right now (week 1's estimate, then each test). */
  benchMax?: number;
  exercises: ExercisePlan[];
}

const DUMBBELL_EXTENDED_REPS = 20;
const TIMED_STEP_SEC = 5;

function weightStep(def: ExerciseDef): number {
  return def.kind === 'barbell' ? 5 : def.increment || 5;
}

function topWeight(sets: SetLog[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0);
}

/** Past sessions that included this exercise, newest first. */
function sessionsFor(exerciseId: string, history: HistorySession[]): HistorySession[] {
  return history
    .map((h) => ({ ...h, sets: h.sets.filter((s) => s.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex) }))
    .filter((h) => h.sets.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId - a.sessionId);
}

function lastSummary(sessions: HistorySession[]): ExercisePlan['last'] {
  const s = sessions[0];
  if (!s) return undefined;
  return { date: s.date, sets: s.sets.map((x) => ({ weight: x.weight, reps: x.reps })) };
}

/**
 * Double progression: stay at a weight until every set reaches the top of the rep range,
 * then add the smallest jump and start again at the bottom of the range.
 */
export function planDouble(
  rx: PrescribedExercise,
  def: ExerciseDef,
  allSessions: HistorySession[],
  templateId: TemplateId,
  settings: Settings,
  deload: boolean,
): { sets: SetTarget[]; notes: string[] } {
  const notes: string[] = [];
  const working = allSessions.filter((s) => !s.deload);
  // Prefer history from the same workout so different rep ranges don't mix.
  const sameTemplate = working.filter((s) => s.templateId === templateId);
  const ref = sameTemplate.length ? sameTemplate : working;
  const last = ref[0];
  const step = weightStep(def);
  const setCount = deload ? Math.ceil(rx.sets / 2) : rx.sets;
  const make = (weight: number | null, reps: number[], repMax = rx.repMax): SetTarget[] =>
    Array.from({ length: setCount }, (_, i) => ({ weight, reps: reps[i] ?? reps[reps.length - 1], repMax }));

  if (def.timed) {
    const best = last ? Math.max(...last.sets.map((s) => s.reps)) : 0;
    // Holds go up 5 seconds at a time (to twice the range); walks and other long ones a minute at
    // a time, up to the top of their range; a fixed routine (posture) stays as it is.
    const long = rx.repMin >= 300;
    const stepSec = long ? 60 : TIMED_STEP_SEC;
    const cap = long ? rx.repMax : rx.repMax * 2;
    const target = deload || rx.repMin === rx.repMax ? rx.repMin : best ? Math.min(Math.max(best + stepSec, rx.repMin), cap) : rx.repMin;
    return { sets: make(null, [target], rx.repMax), notes };
  }

  const noLoad = (def.kind === 'bodyweight' && !def.addedLoad) || def.increment === 0;

  if (!last) {
    const start = settings.startWeights[rx.exerciseId] ?? rx.startWeight ?? (def.addedLoad || noLoad ? 0 : null);
    if (start === null) notes.push(`First time: pick a weight you could do about ${rx.repMax + 2} times.`);
    return { sets: make(start, [rx.repMin]), notes };
  }

  const lastWeight = topWeight(last.sets);
  const capped = def.kind === 'dumbbell' && lastWeight >= settings.dumbbellMax;
  const effMax = capped ? DUMBBELL_EXTENDED_REPS : rx.repMax;
  const lastReps = last.sets.filter((s) => s.weight === lastWeight).map((s) => s.reps);

  if (deload) {
    notes.push('Easy week: half the sets, stop well short of failure.');
    return { sets: make(noLoad ? 0 : lastWeight, [rx.repMin]), notes };
  }

  const hitTop = lastReps.length >= rx.sets && lastReps.every((r) => r >= effMax);

  if (hitTop) {
    if (noLoad) {
      notes.push('You hit the top of the range. Make it harder: slower reps, a pause, or a tougher variation.');
      return { sets: make(0, [rx.repMax]), notes };
    }
    let next = lastWeight + step;
    if (def.kind === 'dumbbell' && next > settings.dumbbellMax) {
      next = settings.dumbbellMax;
      notes.push(`Dumbbells max out at ${settings.dumbbellMax} lb: go up to 20 reps, lower over 3 seconds, or pause at the bottom.`);
      const reps = lastReps.map((r) => Math.min(DUMBBELL_EXTENDED_REPS, r + 1));
      return { sets: make(next, reps, DUMBBELL_EXTENDED_REPS), notes };
    }
    if (def.addedLoad) notes.push(`Add ${step} lb (hold a dumbbell between your feet).`);
    else notes.push(`New weight: +${step} lb.`);
    return { sets: make(next, [rx.repMin]), notes };
  }

  // Two tough sessions in a row at the same weight: back off 10%.
  const prev = ref[1];
  const avg = (sets: SetLog[]) => sets.reduce((s, x) => s + x.reps, 0) / sets.length;
  if (
    !noLoad &&
    prev &&
    topWeight(prev.sets) === lastWeight &&
    avg(last.sets) < rx.repMin &&
    avg(prev.sets) < rx.repMin &&
    lastWeight > 0
  ) {
    const lighter = roundTo(lastWeight * 0.9, step);
    notes.push('Two tough sessions in a row at this weight, so it dropped 10%. Build back up from here.');
    return { sets: make(lighter, [rx.repMin]), notes };
  }

  // Same weight, try to beat last time by a rep per set.
  const reps = Array.from({ length: rx.sets }, (_, i) => {
    const r = lastReps[i];
    return r === undefined ? rx.repMin : Math.min(effMax, Math.max(rx.repMin, r + 1));
  });
  if (capped) notes.push(`Dumbbells max out at ${settings.dumbbellMax} lb: aim for up to 20 reps or slow the lowering.`);
  return { sets: make(noLoad ? 0 : lastWeight, reps, effMax), notes };
}

/**
 * Did a heavy bench day go to plan? Every prescribed set logged, and no more than one set short
 * of its reps (missing reps on two or more sets repeats the week).
 */
export function benchSessionSucceeded(s: HistorySession, def: BenchStep | undefined = s.benchStep !== undefined ? BENCH_STEPS[s.benchStep] : undefined): boolean {
  const bench = s.sets.filter((x) => x.exerciseId === 'bench');
  if (!bench.length) return false;
  const prescribed = def ? def.heavy.reduce((n, g) => n + g.sets, 0) : bench.length;
  if (bench.length < prescribed) return false;
  const short = bench.filter((x) => x.targetReps !== undefined && x.reps < x.targetReps).length;
  return short <= 1;
}

/**
 * Where the bench plan stands: the week (step) the next heavy day is, and the max its weights
 * come from. Week 1's first set (as many reps as you can, one left) sets the max; each test day
 * raises it to the best set. A week only moves on when it went to plan, so a rough week repeats.
 * After the last week the plan carries on from block 2 with the new max.
 */
export function benchState(settings: Settings, history: HistorySession[]): { step: number; max: number } {
  const heavyDays = history
    .filter((h) => h.templateId === 'upperA' && h.benchStep !== undefined && h.date >= settings.benchBlockStart)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId - b.sessionId);
  let step = 0;
  let max = settings.benchMax;
  for (const s of heavyDays) {
    if (s.benchStep !== step) continue;
    const def = BENCH_STEPS[step];
    const bench = s.sets.filter((x) => x.exerciseId === 'bench').sort((a, b) => a.setIndex - b.setIndex);
    if (def.calibrate) {
      const first = bench[0];
      if (!first) continue;
      // Reps done plus the one left in reserve (Epley), within reason of the starting max.
      const est = first.weight * (1 + (first.reps + 1) / 30);
      max = Math.floor(Math.min(settings.benchMax * 1.2, Math.max(settings.benchMax * 0.8, est)) / 5) * 5;
      step += 1;
    } else if (def.test) {
      const best = bench.reduce((m, x) => Math.max(m, e1rm(x.weight, x.reps)), 0);
      max = roundTo(Math.max(best, max), 5);
      step += 1;
    } else if (def.easy || benchSessionSucceeded(s, def)) step += 1;
    if (step >= BENCH_STEPS.length) step = BENCH_REPEAT_FROM;
  }
  return { step, max };
}

const loadSets = (groups: BenchGroup[], max: number, scale = 1): SetTarget[] =>
  groups.flatMap((g) => Array.from({ length: Math.max(1, Math.round(g.sets * scale)) }, () => ({ weight: roundTo(max * g.pct, 5), reps: g.reps, label: g.label })));

/** The heavy day: the week's top set (or single) and back-off sets. */
export function planBenchHeavy(step: number, max: number, deload: boolean): { sets: SetTarget[]; notes: string[]; countsAsStep: boolean } {
  const def = BENCH_STEPS[step];
  if (deload && !def.easy && !def.test && !def.calibrate) {
    return {
      sets: loadSets([{ sets: 3, reps: 3, pct: 145 / 195 }], max),
      notes: ['Easy week for everything, so bench is light too. The plan picks up where it left off next week.'],
      countsAsStep: false,
    };
  }
  const notes = [`Bench week ${step + 1} of ${BENCH_STEPS.length}.`];
  if (def.note) notes.push(def.note);
  // Singles are worked up to, never past your max until a test day (RPE caps, Helms 2018): one
  // planned above it would have you leave a rep in the tank on a weight you've never lifted.
  const sets = loadSets(def.heavy, max).map((x) => (x.reps === 1 && /single/i.test(x.label ?? '') && !def.test ? { ...x, weight: Math.min(x.weight ?? 0, Math.floor(max / 5) * 5) } : x));
  if (!def.test && sets.some((x) => x.reps === 1 && /single/i.test(x.label ?? ''))) notes.push('Work up to the single in small jumps. If it moves slowly, stop there and log that weight.');
  if (!def.easy && !def.test && !def.calibrate) notes.push('Miss reps on two or more sets and this week repeats.');
  return { sets, notes, countsAsStep: true };
}

/** The volume day: more reps at a moderate weight, the same week as the last heavy day. */
export function planBenchVolume(step: number, max: number, deload: boolean): { sets: SetTarget[]; notes: string[] } {
  const def = BENCH_STEPS[step];
  const groups = def.volume ?? [{ sets: 3, reps: 5, pct: 0.65 }];
  const light = deload && !def.easy;
  return { sets: loadSets(groups, max, light ? 0.5 : 1), notes: light ? ['Easy week: half the sets.'] : [] };
}

/** The variation day (paused or close-grip), or nothing in an easy week. */
export function planBenchVariation(step: number, max: number, deload: boolean): { exerciseId: string; sets: SetTarget[]; notes: string[] } | null {
  const def = BENCH_STEPS[step];
  if (!def.variation || deload) return null;
  const notes = def.variation.exerciseId === 'pausedBench' ? ['Pause two seconds on your chest, dead still, then press.'] : ['Hands about shoulder-width, elbows tucked.'];
  return { exerciseId: def.variation.exerciseId, sets: loadSets(def.variation.groups, max), notes };
}

/** The bench week the volume and variation days follow: this week's heavy day if it's done, else the next one. */
function benchWeekFor(today: ISODate, history: HistorySession[], state: { step: number }): number {
  const monday = (() => {
    const d = new Date(`${today}T12:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const heavy = history
    .filter((h) => h.templateId === 'upperA' && h.benchStep !== undefined && h.date >= monday && h.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return heavy?.benchStep ?? state.step;
}

export function planWorkout(args: {
  template: WorkoutTemplate;
  settings: Settings;
  today: ISODate;
  history: HistorySession[];
}): WorkoutPlan {
  const { template, settings, today, history } = args;
  const week = programWeek(settings.programStart, today, DELOAD_WEEKS);
  const deload = week.deload;
  let benchStep: number | undefined;
  const bench = benchState(settings, history);
  // Week 1 eases in: one set fewer on everything but bench.
  const easeIn = week.week === 1 && !deload;

  const exercises: ExercisePlan[] = [];
  for (const rx of template.exercises) {
    let exerciseId = rx.exerciseId;
    let sets: SetTarget[];
    let notes: string[];
    if (rx.scheme === 'bench-heavy') {
      const planned = planBenchHeavy(bench.step, bench.max, deload);
      ({ sets, notes } = planned);
      benchStep = planned.countsAsStep ? bench.step : undefined;
    } else if (rx.scheme === 'bench-volume') {
      ({ sets, notes } = planBenchVolume(benchWeekFor(today, history, bench), bench.max, deload));
    } else if (rx.scheme === 'bench-variation') {
      const planned = planBenchVariation(benchWeekFor(today, history, bench), bench.max, deload);
      if (!planned) continue; // an easy week: no variation day
      ({ exerciseId, sets, notes } = planned);
    } else {
      const def = EXERCISES[exerciseId];
      const r = easeIn ? { ...rx, sets: Math.max(2, rx.sets - 1) } : rx;
      ({ sets, notes } = planDouble(r, def, sessionsFor(exerciseId, history), template.id, settings, deload));
      if (easeIn && rx.sets > 2) notes.push('Week 1: one set fewer while you ease in.');
    }
    const def = EXERCISES[exerciseId];
    if (def.cue) notes.push(def.cue);
    const sessions = sessionsFor(exerciseId, history);
    exercises.push({ exerciseId, name: def.name, sets, restSec: rx.restSec, superset: rx.superset, notes, last: lastSummary(sessions) });
  }

  // Paired exercises say what they alternate with.
  for (const ex of exercises) {
    if (!ex.superset) continue;
    const others = exercises.filter((o) => o !== ex && o.superset === ex.superset).map((o) => o.name);
    if (others.length) ex.notes.unshift(`Alternate with ${others.join(' and ')}: a set of each, then rest.`);
  }
  return { templateId: template.id, name: template.name, week, deload, benchStep, benchMax: bench.max, exercises };
}
