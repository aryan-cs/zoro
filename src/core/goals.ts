import { addDays } from './calc';
import type { BodyMetric, Settings } from './types';

/**
 * What a phase works toward. A cut usually ends at a weight, waist or body fat; a bulk more
 * often at a size (arm, forearm) or a ceiling on waist or body fat than at a scale weight.
 */
export type GoalMetric = 'weight' | 'waist' | 'arm' | 'forearm' | 'bodyfat';

export const GOAL_METRICS: Record<GoalMetric, { label: string; unit: string; digits: number; min: number; max: number }> = {
  weight: { label: 'Weight', unit: 'lb', digits: 0, min: 60, max: 600 },
  waist: { label: 'Waist', unit: 'in', digits: 2, min: 15, max: 80 },
  arm: { label: 'Flexed Arm', unit: 'in', digits: 2, min: 6, max: 30 },
  forearm: { label: 'Forearm', unit: 'in', digits: 2, min: 6, max: 25 },
  bodyfat: { label: 'Body Fat', unit: '%', digits: 1, min: 3, max: 60 },
};

export const goalMetric = (s: Settings): GoalMetric => s.goalMetric ?? 'weight';

/** The goal for a measurement (weight is kept in `goalWeight`). */
export function goalOf(s: Settings, m: GoalMetric = goalMetric(s)): number | undefined {
  return m === 'weight' ? s.goalWeight : s.goalValues?.[m];
}

/** The settings change that sets a goal. */
export function setGoal(s: Settings, m: GoalMetric, value: number): Partial<Settings> {
  return m === 'weight' ? { goalWeight: value } : { goalValues: { ...s.goalValues, [m]: value } };
}

/**
 * Where a measurement stands against its goal: the latest value, how far to go, and about how
 * many weeks at the pace of the last month or so (null when it isn't heading toward the goal or
 * there's too little history).
 */
export function progressTo(list: BodyMetric[], goal: number): { current: number; toGo: number; weeks: number | null } | null {
  const latest = list.at(-1);
  if (!latest) return null;
  const toGo = goal - latest.value;
  const base = [...list].reverse().find((m) => m.date <= addDays(latest.date, -21));
  if (!base) return { current: latest.value, toGo, weeks: null };
  const days = (Date.parse(latest.date) - Date.parse(base.date)) / 86_400_000;
  const perWeek = ((latest.value - base.value) / days) * 7;
  const weeks = perWeek && Math.sign(perWeek) === Math.sign(toGo) ? Math.ceil(toGo / perWeek) : null;
  return { current: latest.value, toGo, weeks: weeks && weeks < 520 ? weeks : null };
}
