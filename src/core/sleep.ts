import { minutesBetween, toISODate } from './calc';
import type { SleepEntry } from './types';

/**
 * Parse sleep data copied by the iPhone Shortcut. Accepts either JSON
 * ({"start": ISO, "end": ISO, "minutes"?: number}) or a line like
 * "ZORO-SLEEP start=2026-11-24T23:40 end=2026-11-25T07:10 minutes=412".
 * `minutes` is time actually asleep; if missing, it's end minus start.
 */
export function parseSleepImport(text: string): SleepEntry | null {
  const raw = text.trim();
  if (!raw) return null;
  let start: string | undefined;
  let end: string | undefined;
  let minutes: number | undefined;

  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      start = typeof j.start === 'string' ? j.start : undefined;
      end = typeof j.end === 'string' ? j.end : undefined;
      minutes = typeof j.minutes === 'number' ? j.minutes : typeof j.minutes === 'string' ? parseFloat(j.minutes) : undefined;
    } catch {
      return null;
    }
  } else {
    const get = (k: string) => raw.match(new RegExp(`${k}=([^\\s;]+)`))?.[1];
    start = get('start');
    end = get('end');
    const m = get('minutes') ?? get('asleep');
    minutes = m ? parseFloat(m) : undefined;
  }

  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  const span = minutesBetween(s.toISOString(), e.toISOString());
  const asleep = minutes && Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), span) : span;
  if (span > 20 * 60) return null;
  return { date: toISODate(e), bedtime: s.toISOString(), wakeTime: e.toISOString(), minutes: asleep, source: 'shortcut' };
}

/** Manual entry: bedtime and wake time as "HH:MM" on the night ending on `wakeDate`. */
export function sleepFromTimes(wakeDate: string, bed: string, wake: string): SleepEntry | null {
  const [wy, wm, wd] = wakeDate.split('-').map(Number);
  const [bh, bmin] = bed.split(':').map(Number);
  const [wh, wmin] = wake.split(':').map(Number);
  if ([wy, wm, wd, bh, bmin, wh, wmin].some((x) => !Number.isFinite(x))) return null;
  const wakeAt = new Date(wy, wm - 1, wd, wh, wmin);
  const bedAt = new Date(wy, wm - 1, wd, bh, bmin);
  if (bedAt >= wakeAt) bedAt.setDate(bedAt.getDate() - 1);
  const minutes = Math.round((wakeAt.getTime() - bedAt.getTime()) / 60_000);
  if (minutes <= 0 || minutes > 20 * 60) return null;
  return { date: wakeDate, bedtime: bedAt.toISOString(), wakeTime: wakeAt.toISOString(), minutes, source: 'manual' };
}
