import type { Phase } from './types';

/**
 * Daily targets from a profile, the way a coach would set them. Pure functions, so Settings can
 * show the recommendation live and the rest of the app just reads the saved targets.
 * Reviewed against the research again in late Nov 2026:
 *
 * - Resting energy: Cunningham (500 + 22 × fat-free kg) when body fat is measured; ten Haaf &
 *   Weijs 2014 for 18–35-year-olds who train most days (least biased in active people, O'Neill
 *   2023 meta-analysis); else Mifflin–St Jeor, which reads 10–15% low for them.
 * - Daily burn: rest × the usual 1.2–1.9 activity factor, until 2–3 weeks of food logs and
 *   weigh-ins measure it (intake less the trend's change × 3,500 kcal/lb; Sanghvi 2015), kept
 *   within 25% of the formula.
 * - Goal: ±3,500 kcal per lb of weekly change, spread over the week. Default rates: cut 0.5% of
 *   body weight a week (Garthe 2011, Helms 2014), lean bulk 0.25% (Iraki 2019). Floors 1,500
 *   kcal (men) and 1,200 (women), and 25 kcal per kg of fat-free mass after training (low energy
 *   availability, IOC 2023).
 * - Protein on a cut: 2.7 g per kg of fat-free mass, 3.0 under 12% body fat (Helms 2014; ISSN
 *   2026), so it holds as you lean out; fat-free mass from body fat, or estimated from your waist
 *   (relative fat mass, Woolcott 2018); 2.2 g/kg without either. Otherwise 2.0 g/kg (Morton 2018).
 *   Never over 35% of calories.
 * - Fat: 25% of calories, down to 20% to keep carbs at 130 g (ACSM 2016, Whittaker 2021).
 *   Carbs: the rest.
 * - Fiber: 38 g (men) or 25 g (women), 30 and 21 after 50 (IOM 2005), fixed rather than scaled
 *   to calories, since it keeps you full on a cut (Reynolds 2019).
 * - Water and sleep: see waterFor and sleepFor below.
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
  /** Latest waist measurement (in), to estimate body fat when it isn't measured. */
  waistIn?: number;
  /** Lifting days a week (4 or 5). */
  liftDays?: number;
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  /** Drinks on a rest day, and on a lifting day. */
  waterOz: number;
  waterTrainingOz: number;
  sleepMin: number;
}

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
/** Energy in a pound of body-weight change. */
export const KCAL_PER_LB = 3500;

/** Body fat (fraction) from height and waist: relative fat mass (Woolcott & Bergman 2018). */
export function bodyFatFromWaist(sex: Sex, heightIn: number, waistIn: number): number | undefined {
  if (!heightIn || !waistIn) return undefined;
  const pct = (sex === 'male' ? 64 : 76) - 20 * (heightIn / waistIn);
  return pct > 3 && pct < 60 ? pct / 100 : undefined;
}

const validFat = (f: number | undefined): f is number => !!f && f > 0.03 && f < 0.6;
/** Training age range and activity for ten Haaf's equation (built on 18–35-year-olds who train). */
const trains = (p: Pick<Profile, 'age' | 'activity'>) => p.age >= 18 && p.age <= 35 && ACTIVITY[p.activity].factor >= 1.55;

/**
 * Resting energy (kcal/day). Cunningham from fat-free mass when body fat is measured; ten Haaf
 * & Weijs (2014) for 18–35-year-olds who lift most days, the least biased equation for active
 * people (O'Neill 2023 meta-analysis), where Mifflin reads 10–15% low; Mifflin–St Jeor otherwise.
 */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightIn' | 'weightLb' | 'bodyFat'> & Partial<Pick<Profile, 'activity'>>): number {
  const kg = p.weightLb * KG_PER_LB;
  if (validFat(p.bodyFat)) return 500 + 22 * kg * (1 - p.bodyFat);
  const cm = p.heightIn * CM_PER_IN;
  if (p.activity && trains({ age: p.age, activity: p.activity })) return 11.936 * kg + 587.728 * (cm / 100) - 8.129 * p.age + (p.sex === 'male' ? 191.027 : 0) + 29.279;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** A sensible weekly rate for a phase: lose 0.5% of body weight a week, or gain 0.25%. */
export function defaultRate(phase: Phase, weightLb: number): number {
  const pct = phase === 'cut' ? -0.005 : phase === 'bulk' ? 0.0025 : 0;
  return Math.round(weightLb * pct * 10) / 10; // to the nearest 0.1 lb
}

/**
 * Recommended sleep, by age: 8 hours asleep from 18 to 64 (the National Sleep Foundation's 7–9,
 * AASM/SRS's 7 or more; more protects muscle on a cut, Nedeltcheva 2010), 9 under 18, 7.5 from 65.
 */
export function sleepFor(age: number): number {
  if (age < 18) return 9 * 60;
  if (age < 65) return 8 * 60;
  return 7.5 * 60;
}

/** Time in bed that gives `sleepMin` asleep at a good 88% efficiency, to the nearest quarter hour. */
export function timeInBedFor(sleepMin: number): number {
  return Math.round(sleepMin / 0.88 / 15) * 15;
}

/**
 * Drinks a day (oz): 90 for men, 70 for women on a rest day (between EFSA's 2.5 L and the IOM's
 * 3.7 L of total water a day, less the 20–30% that food brings; Yamada 2022 measured turnover),
 * plus 20 oz on a lifting day for an hour's sweat (ACSM). Urine pale yellow is the check.
 */
export function waterFor(p: Pick<Profile, 'sex'>): { rest: number; training: number } {
  return { rest: p.sex === 'male' ? 90 : 70, training: 20 };
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Fiber: the Institute of Medicine's adequate intake, fixed (not scaled down with calories on a cut). */
export function fiberFor(sex: Sex, age: number): number {
  if (sex === 'male') return age > 50 ? 30 : 38;
  return age > 50 ? 21 : 25;
}

export function recommend(p: Profile, measuredTdee?: number | null): Targets {
  const rest = bmr(p);
  const formula = rest * ACTIVITY[p.activity].factor;
  // What your logged food and weight trend say you burn, once there's enough of it, kept within
  // a quarter of the formula's so a few half-logged days can't swing it.
  const tdee = measuredTdee ? Math.min(formula * 1.25, Math.max(formula * 0.75, measuredTdee)) : formula;

  const kg = p.weightLb * KG_PER_LB;
  const m = (p.heightIn * CM_PER_IN) / 100;
  const refKg = Math.min(kg, 30 * m * m);
  // Fat-free mass: from a measured body fat, else estimated from your waist.
  const fat = validFat(p.bodyFat) ? p.bodyFat : p.waistIn ? bodyFatFromWaist(p.sex, p.heightIn, p.waistIn) : undefined;
  const ffm = fat !== undefined ? kg * (1 - fat) : null;

  // Floors: 1,500 kcal (men) or 1,200 (women), and enough left after training for 25 kcal per kg
  // of fat-free mass (low energy availability, IOC 2023; lifting ~3.5 kcal/kg an hour).
  const liftKcal = (3.5 * kg * (p.liftDays ?? 4)) / 7;
  const floor = Math.max(p.sex === 'male' ? 1500 : 1200, ffm ? 25 * ffm + liftKcal : 0);
  const kcal = round(Math.max(floor, tdee + (p.ratePerWeek * KCAL_PER_LB) / 7), 10);

  // Protein. On a cut, by fat-free mass so it holds as you lean out: 2.7 g/kg, 3.0 below 12% body
  // fat (Helms 2014; ISSN 2026: 2.5–4.2 g/kg fat-free); else 2.2 g/kg. Otherwise 2.0 g/kg (Morton
  // 2018). By weight capped at a BMI of 30, and never over 35% of calories.
  const per = p.phase === 'cut' ? (ffm ? ffm * (fat !== undefined && fat < 0.12 ? 3.0 : 2.7) : refKg * 2.2) : refKg * 2.0;
  const protein = Math.round(Math.min(per, (kcal * 0.35) / 4));
  // Fat 25% of calories, down to 20% (ACSM 2016) if carbs would fall under 130 g (IOM).
  let fatG = (kcal * 0.25) / 9;
  if ((kcal - protein * 4 - fatG * 9) / 4 < 130) fatG = Math.max((kcal * 0.2) / 9, (kcal - protein * 4 - 130 * 4) / 9);
  const fatTarget = Math.round(fatG);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fatTarget * 9) / 4));

  const drinks = waterFor(p);
  return {
    bmr: Math.round(rest),
    tdee: Math.round(tdee),
    kcal,
    protein,
    fat: fatTarget,
    carbs,
    fiber: fiberFor(p.sex, p.age),
    waterOz: drinks.rest,
    waterTrainingOz: drinks.training,
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
