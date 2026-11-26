import { minutesBetween, toISODate } from './calc';
import type { SleepEntry, SleepStage, StageSpan } from './types';

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

/** What a Health sleep sample's value means ("Asleep Core", "REM", "In Bed", …). */
export function stageOf(value: unknown): SleepStage | 'inbed' {
  if (typeof value !== 'string') return 'asleep';
  if (/awake/i.test(value)) return 'awake';
  if (/in\s*bed|inbed/i.test(value)) return 'inbed';
  if (/\brem\b/i.test(value)) return 'rem';
  if (/deep/i.test(value)) return 'deep';
  if (/core|light/i.test(value)) return 'core';
  return 'asleep';
}

/** When several sources overlap (watch, phone, another app), the more specific stage wins. */
const RANK: Record<SleepStage | 'inbed', number> = { inbed: 0, awake: 1, asleep: 2, core: 3, rem: 4, deep: 5 };

/**
 * The night's stages, minute by minute, from falling asleep (`onset`) to waking: in-bed and
 * awake samples before, during and just after the sleep count as awake, and gaps with no
 * sample at all inside the night count as awake too. Null when the samples only say "asleep".
 */
function stagesFor(rows: { start: Date; end: Date; stage: SleepStage | 'inbed' }[], onset: Date, wake: Date): StageSpan[] | undefined {
  if (!rows.some((r) => r.stage !== 'asleep')) return undefined;
  const MIN = 60_000;
  // Time in bed before falling asleep (up to 3 hours) and after waking (up to an hour) belongs to this night.
  let from = onset.getTime();
  let to = wake.getTime();
  for (const r of rows) {
    if (r.stage !== 'inbed' && r.stage !== 'awake') continue;
    if (r.end.getTime() < onset.getTime() - 60 * MIN || r.start.getTime() > wake.getTime() + 60 * MIN) continue;
    from = Math.min(from, Math.max(r.start.getTime(), onset.getTime() - 180 * MIN));
    to = Math.max(to, Math.min(r.end.getTime(), wake.getTime() + 60 * MIN));
  }
  const n = Math.round((to - from) / MIN);
  if (n <= 0 || n > 24 * 60) return undefined;
  const best: (SleepStage | 'inbed' | null)[] = new Array(n).fill(null);
  for (const r of rows) {
    const a = Math.max(0, Math.round((r.start.getTime() - from) / MIN));
    const b = Math.min(n, Math.round((r.end.getTime() - from) / MIN));
    for (let i = a; i < b; i++) if (best[i] === null || RANK[r.stage] > RANK[best[i]!]) best[i] = r.stage;
  }
  const shift = Math.round((onset.getTime() - from) / MIN);
  const spans: StageSpan[] = [];
  for (let i = 0; i < n; i++) {
    const s = best[i];
    const stage: SleepStage = s === null || s === 'inbed' ? 'awake' : s;
    const last = spans[spans.length - 1];
    if (last && last[2] === stage) last[1] = i + 1 - shift;
    else spans.push([i - shift, i + 1 - shift, stage]);
  }
  // Trailing "awake" after the last bit of sleep is only kept if a sample put it there (not a gap).
  return spans;
}

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
  const all = rows
    .map((r) => ({ start: parseDate(r.start), end: parseDate(r.end), stage: stageOf(r.value) }))
    .filter((r): r is Sample & { stage: SleepStage | 'inbed' } => !!r.start && !!r.end && r.end > r.start);
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
  const entry: SleepEntry = { date: toISODate(wake), bedtime: bed.toISOString(), wakeTime: wake.toISOString(), minutes, source: 'shortcut' };
  const stages = stagesFor(all, bed, wake);
  if (stages) entry.stages = stages;
  return entry;
}

export function parseSleepImport(text: string): SleepEntry | null {
  // The installable shortcut copies three lists: start dates, end dates, values.
  const two = text.trim().match(/^ZORO-SLEEP2\s*\n([\s\S]*)$/i);
  if (two) {
    const [starts = '', ends = '', values = ''] = two[1].split(/\n\s*---\s*\n?/);
    const lines = (block: string) => block.split('\n').map((l) => l.trim()).filter(Boolean);
    const st = lines(starts);
    const en = lines(ends);
    const va = lines(values);
    return nightFromSamples(st.map((start, i) => ({ start, end: en[i], value: va[i] })));
  }
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
