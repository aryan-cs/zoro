import { e1rm, programWeek, roundTo, type ProgramWeek } from './calc';
import { BENCH_STEPS, DELOAD_BLOCK_WEEKS, EXERCISES } from './program';
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
  /** A Settings › Sample Data workout (History shows it; planning never loads it). */
  sample?: boolean;
  sets: SetLog[];
}

export interface WorkoutPlan {
  templateId: TemplateId;
  name: string;
  week: ProgramWeek;
  deload: boolean;
  /** Bench table step this session is (undefined if it shouldn't count toward the table). */
  benchStep?: number;
  /** The test week is done: start a new 12-step block at this max. */
  newBenchMax?: number;
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
    const target = deload ? rx.repMin : best ? Math.min(Math.max(best + TIMED_STEP_SEC, rx.repMin), rx.repMax * 2) : rx.repMin;
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

/** Did a heavy bench session hit every prescribed rep? */
export function benchSessionSucceeded(s: HistorySession): boolean {
  const bench = s.sets.filter((x) => x.exerciseId === 'bench');
  if (!bench.length) return false;
  const step = s.benchStep !== undefined ? BENCH_STEPS[s.benchStep] : undefined;
  const prescribed = step ? step.groups.reduce((n, g) => n + g.sets, 0) : bench.length;
  if (bench.length < prescribed) return false;
  return bench.every((x) => x.targetReps === undefined || x.reps >= x.targetReps);
}

/**
 * Where you are in the 12-step bench table. A step only advances when every rep was hit
 * (or it was an easy week), so a missed week repeats the same weights.
 */
export function benchProgress(settings: Settings, history: HistorySession[]): { step: number; newMax?: number } {
  const inBlock = history
    .filter((h) => h.templateId === 'upperA' && h.benchStep !== undefined && h.date >= settings.benchBlockStart)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId - b.sessionId);
  let step = 0;
  let testSession: HistorySession | undefined;
  for (const s of inBlock) {
    if (s.benchStep !== step) continue;
    const def = BENCH_STEPS[step];
    if (def.test) {
      testSession = s;
      step += 1;
      break;
    }
    if (def.easy || benchSessionSucceeded(s)) step += 1;
  }
  if (step >= BENCH_STEPS.length && testSession) {
    const best = testSession.sets
      .filter((x) => x.exerciseId === 'bench')
      .reduce((m, x) => Math.max(m, e1rm(x.weight, x.reps)), 0);
    return { step: 0, newMax: roundTo(Math.max(best, settings.benchMax), 5) };
  }
  return { step };
}

export function planBenchHeavy(
  step: number,
  max: number,
  deload: boolean,
): { sets: SetTarget[]; notes: string[]; countsAsStep: boolean } {
  const def = BENCH_STEPS[step];
  if (deload && !def.easy && !def.test) {
    const easy = BENCH_STEPS.find((s) => s.easy)!;
    const g = easy.groups[0];
    return {
      sets: Array.from({ length: g.sets }, () => ({ weight: roundTo(max * g.pct, 5), reps: g.reps })),
      notes: ['Easy week for everything, so bench is light too. Your table picks up where it left off next week.'],
      countsAsStep: false,
    };
  }
  const sets: SetTarget[] = def.groups.flatMap((g) =>
    Array.from({ length: g.sets }, () => ({ weight: roundTo(max * g.pct, 5), reps: g.reps, label: g.label })),
  );
  const notes = [`Bench table step ${step + 1} of ${BENCH_STEPS.length}.`];
  if (def.note) notes.push(def.note);
  notes.push('Miss any reps and this step repeats next week.');
  return { sets, notes, countsAsStep: true };
}

export function planWorkout(args: {
  template: WorkoutTemplate;
  settings: Settings;
  today: ISODate;
  history: HistorySession[];
}): WorkoutPlan {
  const { template, settings, today, history } = args;
  const week = programWeek(settings.programStart, today, DELOAD_BLOCK_WEEKS);
  const deload = week.deload;
  let benchStep: number | undefined;
  let newBenchMax: number | undefined;

  const exercises: ExercisePlan[] = template.exercises.map((rx) => {
    const def = EXERCISES[rx.exerciseId];
    const sessions = sessionsFor(rx.exerciseId, history);
    let sets: SetTarget[];
    let notes: string[];
    if (rx.scheme === 'bench-heavy') {
      const prog = benchProgress(settings, history);
      const max = prog.newMax ?? settings.benchMax;
      newBenchMax = prog.newMax;
      const planned = planBenchHeavy(prog.step, max, deload);
      sets = planned.sets;
      notes = planned.notes;
      if (prog.newMax) notes.unshift(`New block! Your tested max is ${prog.newMax} lb, so every weight went up.`);
      benchStep = planned.countsAsStep ? prog.step : undefined;
    } else {
      ({ sets, notes } = planDouble(rx, def, sessions, template.id, settings, deload));
    }
    if (def.cue) notes.push(def.cue);
    return {
      exerciseId: rx.exerciseId,
      name: def.name,
      sets,
      restSec: rx.restSec,
      superset: rx.superset,
      notes,
      last: lastSummary(sessions),
    };
  });

  return { templateId: template.id, name: template.name, week, deload, benchStep, newBenchMax, exercises };
}
