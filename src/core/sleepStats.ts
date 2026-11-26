import { addDays } from './calc';
import type { ISODate, SleepEntry, SleepStage } from './types';

/**
 * What a night of sleep says, modeled on Sleep Cycle: a 0–100 score from three pillars
 * (Duration against your goal, Quality from the stages, Routine from how steady your bedtime
 * is), plus efficiency, time to fall asleep, awakenings, sleep debt and bedtime regularity.
 * Stage figures need Apple Health data (a watch); nights logged by hand score on duration and
 * routine alone.
 */

export interface NightStats {
  /** Minutes asleep. */
  asleep: number;
  /** Minutes in bed, from lying down to getting up (bed to wake without stages). */
  inBed: number;
  /** Share of time in bed spent asleep (null without stages). */
  efficiency: number | null;
  /** Minutes from lying down to falling asleep (null without in-bed data). */
  latency: number | null;
  /** Times you woke for two minutes or more during the night (null without stages). */
  awakenings: number | null;
  /** Minutes in each stage (null without stages). */
  stages: Record<SleepStage, number> | null;
}

/** Minutes after midnight for "HH:MM" or an ISO time (local). */
export function clockOf(t: string | undefined): number | null {
  if (!t) return null;
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

/** Clock minutes on a line that runs noon to noon, so 11 PM and 1 AM sit side by side. */
const night = (m: number) => (m + 720) % 1440;
const clock = (n: number) => (Math.round(n) + 720) % 1440;

export function nightStats(e: SleepEntry): NightStats {
  const spans = e.stages;
  if (!spans?.length) {
    const bed = clockOf(e.bedtime);
    const wake = clockOf(e.wakeTime);
    const span = bed !== null && wake !== null ? (wake - bed + 1440) % 1440 || 1440 : e.minutes;
    return { asleep: e.minutes, inBed: Math.max(span, e.minutes), efficiency: null, latency: null, awakenings: null, stages: null };
  }
  const stages: Record<SleepStage, number> = { awake: 0, rem: 0, core: 0, deep: 0, asleep: 0 };
  for (const [a, b, s] of spans) stages[s] += b - a;
  const first = spans[0][0];
  const lastSleep = Math.max(...spans.filter((s) => s[2] !== 'awake').map((s) => s[1]));
  const inBed = spans[spans.length - 1][1] - first;
  const asleep = inBed - stages.awake;
  const awakenings = spans.filter(([a, b, s]) => s === 'awake' && a >= 0 && b < lastSleep && b - a >= 2).length;
  return { asleep, inBed, efficiency: inBed ? asleep / inBed : null, latency: Math.max(0, -first), awakenings, stages };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface SleepScore {
  score: number;
  /** Each pillar 0–100, or null when there's nothing to judge it by. */
  duration: number;
  quality: number | null;
  routine: number | null;
}

/** Bed and wake on the noon-to-noon line, for nights where both are known. */
function times(e: SleepEntry): { bed: number; wake: number } | null {
  const bed = clockOf(e.bedtime);
  const wake = clockOf(e.wakeTime);
  return bed === null || wake === null ? null : { bed: night(bed), wake: night(wake) };
}

/**
 * Score a night: Duration (half) is time asleep against your goal; Quality (30%) blends
 * efficiency (95%+ is full marks, 70% none), deep + REM share (35%+ is full marks), how fast
 * you fell asleep (15 minutes or less is full marks, an hour none) and how you felt waking;
 * Routine (20%) is how close bed and wake times were to your usual over the week before
 * (90 minutes off is none). Missing pillars drop out and the rest are reweighted.
 */
export function sleepScore(e: SleepEntry, before: SleepEntry[], goalMin: number): SleepScore {
  const st = nightStats(e);
  const duration = clamp01(st.asleep / Math.max(1, goalMin));

  const parts: number[] = [];
  if (st.efficiency !== null) parts.push(clamp01((st.efficiency - 0.7) / 0.25));
  if (st.stages && st.asleep > 0) parts.push(clamp01((st.stages.deep + st.stages.rem) / st.asleep / 0.35));
  if (st.latency !== null && st.latency > 0) parts.push(clamp01(1 - (st.latency - 15) / 45));
  if (e.quality) parts.push(e.quality / 5);
  const quality = parts.length ? mean(parts) : null;

  let routine: number | null = null;
  const t = times(e);
  const prior = before
    .filter((p) => p.date < e.date && p.date >= addDays(e.date, -7))
    .map(times)
    .filter((x): x is { bed: number; wake: number } => !!x);
  if (t && prior.length >= 3) {
    const off = (Math.abs(t.bed - median(prior.map((p) => p.bed))) + Math.abs(t.wake - median(prior.map((p) => p.wake)))) / 2;
    routine = clamp01(1 - off / 90);
  }

  const pillars: [number | null, number][] = [
    [duration, 0.5],
    [quality, 0.3],
    [routine, 0.2],
  ];
  const known = pillars.filter((p): p is [number, number] => p[0] !== null);
  const weight = known.reduce((w, [, k]) => w + k, 0);
  const score = Math.round((known.reduce((s, [v, k]) => s + v * k, 0) / weight) * 100);
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
  return { score, duration: Math.round(duration * 100), quality: pct(quality), routine: pct(routine) };
}

/** Nights in the `days` up to and including `end`. */
const within = (entries: SleepEntry[], end: ISODate, days: number) => entries.filter((e) => e.date <= end && e.date > addDays(end, -days));

/** How far short of your goal the last `days` nights fell, added up (minutes; unlogged nights don't count). */
export function sleepDebt(entries: SleepEntry[], goalMin: number, end: ISODate, days = 14): number {
  return within(entries, end, days).reduce((debt, e) => debt + Math.max(0, goalMin - e.minutes), 0);
}

export interface Routine {
  /** Average bedtime and wake-up (minutes after midnight). */
  bed: number;
  wake: number;
  /** How much bedtime varies night to night (standard deviation, minutes). */
  spread: number;
}

/** Your usual bed and wake times over the last `days` nights, and how much bedtime moves (needs 4 nights). */
export function sleepRoutine(entries: SleepEntry[], end: ISODate, days = 14): Routine | null {
  const ts = within(entries, end, days)
    .map(times)
    .filter((x): x is { bed: number; wake: number } => !!x);
  if (ts.length < 4) return null;
  const bed = mean(ts.map((t) => t.bed));
  const spread = Math.sqrt(mean(ts.map((t) => (t.bed - bed) ** 2)));
  return { bed: clock(bed), wake: clock(mean(ts.map((t) => t.wake))), spread: Math.round(spread) };
}

/**
 * How a habit the day before goes with that night's sleep: average minutes asleep after days
 * with it minus after days without. Null until there are three nights of each.
 */
export function sleepAfter(entries: SleepEntry[], had: (day: ISODate) => boolean): number | null {
  const yes: number[] = [];
  const no: number[] = [];
  for (const e of entries) (had(addDays(e.date, -1)) ? yes : no).push(e.minutes);
  if (yes.length < 3 || no.length < 3) return null;
  return Math.round(mean(yes) - mean(no));
}

/** 23:40 → "11:40 PM" */
export function clockLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
