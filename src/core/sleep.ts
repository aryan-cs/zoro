import { minutesBetween, toISODate } from './calc';
import type { SleepEntry } from './types';

/**
 * Parse sleep data copied by the iPhone Shortcut. Accepts either JSON
 * ({"start": ISO, "end": ISO, "minutes"?: number}) or a line like
 * "ZORO-SLEEP start=2026-11-24T23:40 end=2026-11-25T07:10 minutes=412".
 * `minutes` is time actually asleep; if missing, it's end minus start.
 */
interface Sample {
  start: Date;
  end: Date;
}

const NOT_ASLEEP = /awake|in\s*bed|inbed/i;

/** Dates from Shortcuts may be ISO 8601 or "Nov 25, 2026 at 7:10 AM". */
function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const d = new Date(s.replace(/\sat\s/, ' '));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Turn raw Health sleep samples into one night: keep the "asleep" stages, merge overlaps
 * (watch + phone can both write), and take the last cluster of sleep (gaps under 3 hours).
 */
export function nightFromSamples(rows: { start?: unknown; end?: unknown; value?: unknown }[]): SleepEntry | null {
  const samples: Sample[] = rows
    .filter((r) => !(typeof r.value === 'string' && NOT_ASLEEP.test(r.value)))
    .map((r) => ({ start: parseDate(r.start), end: parseDate(r.end) }))
    .filter((r): r is Sample => !!r.start && !!r.end && r.end > r.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (!samples.length) return null;

  // Merge overlapping or touching intervals.
  const merged: Sample[] = [];
  for (const s of samples) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      if (s.end > last.end) last.end = s.end;
    } else merged.push({ ...s });
  }

  // Keep the final night: walk back while gaps are under 3 hours.
  const GAP = 3 * 60 * 60_000;
  let i = merged.length - 1;
  while (i > 0 && merged[i].start.getTime() - merged[i - 1].end.getTime() < GAP) i--;
  const night = merged.slice(i);
  const minutes = Math.round(night.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()), 0) / 60_000);
  const bed = night[0].start;
  const wake = night[night.length - 1].end;
  if (minutes <= 0 || minutes > 20 * 60) return null;
  return { date: toISODate(wake), bedtime: bed.toISOString(), wakeTime: wake.toISOString(), minutes, source: 'shortcut' };
}

export function parseSleepImport(text: string): SleepEntry | null {
  let raw = text.trim().replace(/^(ZORO-SLEEP|FITSLEEP1):?\s*/i, '');
  if (!raw) return null;
  // A list of Health samples from the Shortcut.
  if (raw.startsWith('[')) {
    try {
      const rows = JSON.parse(raw) as unknown;
      return Array.isArray(rows) ? nightFromSamples(rows as { start?: unknown; end?: unknown; value?: unknown }[]) : null;
    } catch {
      // Shortcuts sometimes leaves a trailing comma.
      try {
        const rows = JSON.parse(raw.replace(/,\s*\]$/, ']')) as unknown;
        return Array.isArray(rows) ? nightFromSamples(rows as { start?: unknown; end?: unknown; value?: unknown }[]) : null;
      } catch {
        return null;
      }
    }
  }
  raw = text.trim();
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
