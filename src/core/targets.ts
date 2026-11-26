import type { Phase } from './types';

/**
 * Daily targets from a profile, the way a coach would set them. Pure functions, so Settings can
 * show the recommendation live and the rest of the app just reads the saved targets.
 *
 * Energy: Mifflin–St Jeor resting rate × an activity factor, then the goal's daily surplus or
 * deficit from the weekly rate (about 3,500 kcal per pound of body weight). Protein by body
 * weight (higher on a cut, to keep muscle), fat as a share of calories with a floor, carbs the
 * rest, fiber 14 g per 1,000 kcal, water from body weight plus training, sleep by age.
 */

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';

/** Activity levels, with how each is described in Settings. */
export const ACTIVITY: Record<Activity, { label: string; detail: string; factor: number }> = {
  sedentary: { label: 'Sedentary', detail: 'Desk job, little exercise', factor: 1.2 },
  light: { label: 'Light', detail: 'Exercise 1–3 days a week', factor: 1.375 },
  moderate: { label: 'Moderate', detail: 'Exercise 3–5 days a week', factor: 1.55 },
  active: { label: 'Active', detail: 'Hard training 6–7 days a week', factor: 1.725 },
  very: { label: 'Very Active', detail: 'Hard training and a physical job', factor: 1.9 },
};

export interface Profile {
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
  activity: Activity;
  phase: Phase;
  /** Change in lb per week (negative to lose). */
  ratePerWeek: number;
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  waterOz: number;
  sleepMin: number;
}

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
/** Energy in a pound of body-weight change. */
export const KCAL_PER_LB = 3500;

/** Resting energy (kcal/day), Mifflin–St Jeor. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightIn' | 'weightLb'>): number {
  const kg = p.weightLb * KG_PER_LB;
  const cm = p.heightIn * CM_PER_IN;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** A sensible weekly rate for a phase, as a share of body weight per week. */
export function defaultRate(phase: Phase, weightLb: number): number {
  const pct = phase === 'cut' ? -0.0075 : phase === 'bulk' ? 0.0025 : 0;
  return Math.round(weightLb * pct * 4) / 4; // to the nearest quarter pound
}

/** Recommended sleep, by age (the middle of the advised range). */
export function sleepFor(age: number): number {
  if (age < 18) return 9 * 60;
  if (age < 65) return 8 * 60;
  return 7.5 * 60;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function recommend(p: Profile): Targets {
  const rest = bmr(p);
  const tdee = rest * ACTIVITY[p.activity].factor;
  const floor = p.sex === 'male' ? 1500 : 1200;
  const kcal = Math.max(floor, tdee + (p.ratePerWeek * KCAL_PER_LB) / 7);
  const perLb = p.phase === 'cut' ? 1 : p.phase === 'bulk' ? 0.8 : 0.9;
  const protein = p.weightLb * perLb;
  const fat = Math.max((kcal * 0.25) / 9, p.weightLb * 0.3);
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(rest),
    tdee: Math.round(tdee),
    kcal: round(kcal, 10),
    protein: round(protein, 5),
    fat: round(fat, 5),
    carbs: round(carbs, 5),
    fiber: round((kcal / 1000) * 14, 1),
    waterOz: round(p.weightLb * 0.5 + 16, 8),
    sleepMin: sleepFor(p.age),
  };
}

/** Whole years from a birth date to `today`. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** About how many weeks from `weightLb` to `goalLb` at `ratePerWeek` (null if it never gets there). */
export function weeksToGoal(weightLb: number, goalLb: number, ratePerWeek: number): number | null {
  const gap = goalLb - weightLb;
  if (!ratePerWeek || Math.sign(gap) !== Math.sign(ratePerWeek)) return null;
  return Math.ceil(gap / ratePerWeek);
}
