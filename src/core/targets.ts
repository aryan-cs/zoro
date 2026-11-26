import type { Phase } from './types';

/**
 * Daily targets from a profile, the way a coach would set them. Pure functions, so Settings can
 * show the recommendation live and the rest of the app just reads the saved targets.
 * Constants from a literature review (Nov 2026):
 *
 * - Resting energy: Mifflin–St Jeor (1990), or Cunningham (1980, 500 + 22 × fat-free kg) when
 *   body fat is known; Mifflin reads about 10% low for muscular people.
 * - Daily burn: rest × the usual 1.2–1.9 activity factor.
 * - Goal: ±7,700 kcal per kg (3,500 per lb) of weekly change, spread over the week. Default
 *   rates: cut 0.5% of body weight a week (Helms 2014, Garthe 2011), lean bulk 0.25% (Iraki
 *   2019). Floors 1,500 kcal (men) and 1,200 (women).
 * - Protein: 2.0 g/kg (2.2 on a cut; 2.6 per fat-free kg when body fat is known), on weight
 *   capped at a BMI of 30 (Morton 2018, Helms 2014).
 * - Fat: 25% of calories, at least 0.5 g/kg (ACSM 2016, Iraki 2019). Carbs: the rest.
 * - Fiber: 14 g per 1,000 kcal (IOM 2005).
 * - Water: drinks of 100 oz (men) or 75 oz (women) a day (IOM 2004, less the ~20% in food), plus
 *   about 20 oz for an hour of training when you train most days (ACSM).
 * - Sleep: 9 h under 18, 8 h to 64, 7.5 h from 65 (National Sleep Foundation 2015).
 */

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';

/** Activity levels, with how each is described in Settings. */
export const ACTIVITY: Record<Activity, { label: string; detail: string; factor: number }> = {
  sedentary: { label: 'Sedentary', detail: 'You sit most of the day, walk under 5,000 steps and don’t train.', factor: 1.2 },
  light: { label: 'Light', detail: 'You sit most of the day and train 1–3 days a week or walk 5,000–7,500 steps.', factor: 1.375 },
  moderate: { label: 'Moderate', detail: 'You lift 3–5 days a week and walk 7,500–10,000 steps a day.', factor: 1.55 },
  active: { label: 'Active', detail: 'You lift most days and are on your feet a lot, or walk over 10,000 steps.', factor: 1.725 },
  very: { label: 'Very Active', detail: 'You have a physical job and train every day, or train twice a day.', factor: 1.9 },
};

export interface Profile {
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
  /** Body fat as a fraction (0.15), if measured. */
  bodyFat?: number;
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

/** Resting energy (kcal/day): Cunningham from fat-free mass when body fat is known, else Mifflin–St Jeor. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightIn' | 'weightLb' | 'bodyFat'>): number {
  const kg = p.weightLb * KG_PER_LB;
  if (p.bodyFat && p.bodyFat > 0.03 && p.bodyFat < 0.6) return 500 + 22 * kg * (1 - p.bodyFat);
  const cm = p.heightIn * CM_PER_IN;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** A sensible weekly rate for a phase: lose 0.5% of body weight a week, or gain 0.25%. */
export function defaultRate(phase: Phase, weightLb: number): number {
  const pct = phase === 'cut' ? -0.005 : phase === 'bulk' ? 0.0025 : 0;
  return Math.round(weightLb * pct * 10) / 10; // to the nearest 0.1 lb
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
  const kcal = round(Math.max(floor, tdee + (p.ratePerWeek * KCAL_PER_LB) / 7), 10);

  // Protein and the fat floor go by weight, capped at what a BMI of 30 would weigh.
  const kg = p.weightLb * KG_PER_LB;
  const m = (p.heightIn * CM_PER_IN) / 100;
  const refKg = Math.min(kg, 30 * m * m);
  const lean = p.bodyFat && p.bodyFat > 0.03 && p.bodyFat < 0.6 ? kg * (1 - p.bodyFat) : null;
  const protein = Math.round(p.phase === 'cut' ? (lean ? lean * 2.6 : refKg * 2.2) : refKg * 2.0);
  const fat = Math.round(Math.max((kcal * 0.25) / 9, refKg * 0.5));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  // Drinks: IOM's total water less what food brings, plus an hour of training most days.
  const base = p.sex === 'male' ? 100 : 75;
  const training = ACTIVITY[p.activity].factor >= 1.55 ? 20 : ACTIVITY[p.activity].factor > 1.2 ? 10 : 0;
  return {
    bmr: Math.round(rest),
    tdee: Math.round(tdee),
    kcal,
    protein,
    fat,
    carbs,
    fiber: Math.round((kcal / 1000) * 14),
    waterOz: round(base + training, 5),
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
