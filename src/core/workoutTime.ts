import { EXERCISES } from './program';

/**
 * How a workout is done and how long it takes.
 *
 * Exercises that share a superset label and sit next to each other in the plan are done in rounds:
 * a set of each, one after the other, then the rest. Everything else is one exercise at a time,
 * resting between its sets. `rounds` gives that order; `estimateMinutes` times it.
 *
 * The time model, calibrated on a real session (16 sets of Bench, Back, and Shoulders took 63
 * minutes from the first set to the last, about 4 minutes a set with 2–3 minute rests):
 * - a set: about 3.5 s a rep (both sides for one-side moves; holds are their seconds) plus 20 s
 *   to get set up;
 * - between the two halves of a superset: 20 s to move across;
 * - the prescribed rest after a set (after the round, in a superset);
 * - 90 s to set up the next exercise;
 * - warming up: 5 minutes before the first barbell lift of the day, 2 before a later one;
 * - plus 10% for everything the model misses (loading plates, a sip of water, a busy gym).
 */

export interface TimedExercise {
  exerciseId: string;
  /** Reps (or seconds, for holds) of each set. */
  reps: number[];
  restSec: number;
  superset?: string;
}

/** Each step in order: which exercise, which set, and the rest after it (0 for none). */
export function rounds<T extends { exerciseId: string; superset?: string; restSec: number }>(exercises: T[], setsOf: (e: T) => number): { ex: T; i: number; restAfter: number }[] {
  const groups: T[][] = [];
  for (const ex of exercises) {
    const last = groups.at(-1);
    if (ex.superset && last && last[0].superset === ex.superset) last.push(ex);
    else groups.push([ex]);
  }
  const out: { ex: T; i: number; restAfter: number }[] = [];
  for (const g of groups) {
    const n = Math.max(...g.map(setsOf));
    const rest = Math.max(...g.map((e) => e.restSec));
    for (let i = 0; i < n; i++) {
      const inRound = g.filter((e) => i < setsOf(e));
      inRound.forEach((ex, k) => out.push({ ex, i, restAfter: k === inRound.length - 1 ? rest : 0 }));
    }
  }
  // No rest after the very last set.
  if (out.length) out[out.length - 1].restAfter = 0;
  return out;
}

const SETUP = 20;
const ACROSS = 20;
const NEXT_EXERCISE = 90;
const SLACK = 1.1;

/** Minutes a workout takes, warm-ups included (see the model above). */
export function estimateMinutes(exercises: TimedExercise[]): number {
  const steps = rounds(exercises, (e) => e.reps.length);
  let s = 0;
  let barbells = 0;
  const seen = new Set<string>();
  steps.forEach((st, k) => {
    const def = EXERCISES[st.ex.exerciseId];
    const sides = def?.perSide ? 2 : 1;
    const reps = st.ex.reps[st.i];
    s += (def?.timed ? reps : reps * 3.5) * sides + SETUP;
    if (!seen.has(st.ex.exerciseId)) {
      seen.add(st.ex.exerciseId);
      if (k > 0) s += steps[k - 1].ex.superset && steps[k - 1].ex.superset === st.ex.superset ? ACROSS : NEXT_EXERCISE;
      if (def?.kind === 'barbell' && ['chest', 'quads', 'hamstrings', 'back'].includes(def.muscles[0])) s += barbells++ ? 120 : 300;
    } else if (k > 0 && steps[k - 1].ex !== st.ex && steps[k - 1].restAfter === 0) s += ACROSS;
    s += st.restAfter;
  });
  return Math.round((s * SLACK) / 60);
}
