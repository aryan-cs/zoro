import type { BodyMetric, FoodEntry, ISODate, Macros, SleepEntry } from './types';

// ---------- Dates (local time, no time zones) ----------

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** The Monday on or after a date. */
export function nextMonday(s: ISODate): ISODate {
  const wd = parseISODate(s).getDay();
  const delta = (8 - wd) % 7;
  return addDays(s, delta);
}

export interface ProgramWeek {
  /** 1-based week since the program started (0 or less = not started). */
  week: number;
  /** 1–12 within the current 12-week block. */
  blockWeek: number;
  block: number;
  deload: boolean;
}

export function programWeek(programStart: ISODate, today: ISODate, deloadWeeks: number[]): ProgramWeek {
  const days = daysBetween(programStart, today);
  const week = Math.floor(days / 7) + 1;
  if (week < 1) return { week, blockWeek: 0, block: 0, deload: false };
  const blockWeek = ((week - 1) % 12) + 1;
  const block = Math.floor((week - 1) / 12) + 1;
  // Listed weeks are easy; past the last one, every sixth week is.
  const last = Math.max(0, ...deloadWeeks);
  const deload = deloadWeeks.includes(week) || (week > last + 4 && (week - last - 4) % 6 === 0);
  return { week, blockWeek, block, deload };
}

// ---------- Lifting ----------

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function roundTo(x: number, step: number): number {
  if (step <= 0) return x;
  return Math.round(x / step) * step;
}

/** Plates per side for a barbell load, largest first. Returns leftover if it can't be made exactly. */
export function platesPerSide(total: number, bar: number, plates: number[]): { plates: number[]; leftover: number } {
  let side = (total - bar) / 2;
  if (side <= 0) return { plates: [], leftover: Math.max(0, side * 2) };
  const out: number[] = [];
  for (const pl of [...plates].sort((a, b) => b - a)) {
    while (side + 1e-9 >= pl) {
      out.push(pl);
      side -= pl;
    }
  }
  return { plates: out, leftover: Math.round(side * 2 * 100) / 100 };
}

// ---------- Nutrition ----------

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
  };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: m.kcal * factor,
    protein: m.protein * factor,
    carbs: m.carbs * factor,
    fat: m.fat * factor,
    fiber: (m.fiber ?? 0) * factor,
  };
}

export function sumEntries(entries: Pick<FoodEntry, 'macros'>[]): Macros {
  return entries.reduce((acc, e) => addMacros(acc, e.macros), { ...ZERO_MACROS });
}

/** Grams of carbs left after protein and fat targets are met. */
export function carbTarget(kcal: number, protein: number, fat: number): number {
  return Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
}

// ---------- Body weight trend ----------

export interface TrendPoint {
  date: ISODate;
  weight: number;
  trend: number;
}

/**
 * Smoothed weight trend (exponential moving average over daily weigh-ins).
 * Missing days are filled by carrying the trend forward.
 */
export function weightTrend(weights: Pick<BodyMetric, 'date' | 'value'>[], alpha = 0.1): TrendPoint[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let prevDate: ISODate | null = null;
  for (const w of sorted) {
    if (trend === null || prevDate === null) {
      trend = w.value;
    } else {
      const gap = Math.max(1, daysBetween(prevDate, w.date));
      // Apply the smoothing once per elapsed day so gaps don't overweight one reading.
      const a = 1 - Math.pow(1 - alpha, gap);
      trend = trend + a * (w.value - trend);
    }
    prevDate = w.date;
    out.push({ date: w.date, weight: w.value, trend });
  }
  return out;
}

/** Average of readings within the 7 days ending on `end`. */
export function sevenDayAverage(weights: Pick<BodyMetric, 'date' | 'value'>[], end: ISODate): number | null {
  const start = addDays(end, -6);
  const inRange = weights.filter((w) => w.date >= start && w.date <= end);
  if (!inRange.length) return null;
  return inRange.reduce((s, w) => s + w.value, 0) / inRange.length;
}

/** Change in trend weight per week over the last `days` days. */
export function weeklyRate(trend: TrendPoint[], days = 14): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const cutoff = addDays(last.date, -days);
  const first = trend.find((t) => t.date >= cutoff) ?? trend[0];
  const span = daysBetween(first.date, last.date);
  if (span < 7) return null;
  return ((last.trend - first.trend) / span) * 7;
}

export interface EnergyEstimate {
  /** Estimated calories burned per day. */
  tdee: number;
  avgIntake: number;
  daysUsed: number;
  /** Suggested daily calories to hit the target weekly rate. */
  recommended: number;
}

/**
 * Estimate daily energy expenditure from what you ate and how your trend weight moved.
 * Needs at least 14 days with food logged, and weigh-ins at both ends.
 * 1 lb of body weight change ≈ 3,500 kcal.
 */
export function estimateEnergy(
  dailyIntake: { date: ISODate; kcal: number }[],
  trend: TrendPoint[],
  targetRatePerWeek: number,
  windowDays = 21,
): EnergyEstimate | null {
  if (!trend.length) return null;
  const end = trend[trend.length - 1].date;
  const start = addDays(end, -windowDays + 1);
  const intake = dailyIntake.filter((d) => d.date >= start && d.date <= end && d.kcal > 0);
  if (intake.length < 14) return null;
  const inWindow = trend.filter((t) => t.date >= start);
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span < 10) return null;
  const avgIntake = intake.reduce((s, d) => s + d.kcal, 0) / intake.length;
  const lbPerDay = (last.trend - first.trend) / span;
  const tdee = avgIntake - lbPerDay * 3500;
  const recommended = roundTo(tdee + (targetRatePerWeek * 3500) / 7, 50);
  return { tdee: Math.round(tdee), avgIntake: Math.round(avgIntake), daysUsed: intake.length, recommended };
}

// ---------- Sleep ----------

export function minutesBetween(startISO: string, endISO: string): number {
  return Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000);
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function averageSleep(entries: Pick<SleepEntry, 'date' | 'minutes'>[], end: ISODate, days = 7): number | null {
  const start = addDays(end, -days + 1);
  const inRange = entries.filter((e) => e.date >= start && e.date <= end);
  if (!inRange.length) return null;
  return inRange.reduce((s, e) => s + e.minutes, 0) / inRange.length;
}
