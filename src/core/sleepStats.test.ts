import { describe, expect, it } from 'vitest';
import { parseSleepImport } from './sleep';
import { nightStats, sleepAfter, sleepDebt, sleepRoutine, sleepScore } from './sleepStats';
import type { SleepEntry } from './types';

const HEALTH = `ZORO-SLEEP [
  {"start":"2026-11-24T23:30:00-06:00","end":"2026-11-25T02:00:00-06:00","value":"Asleep Core"},
  {"start":"2026-11-25T01:30:00-06:00","end":"2026-11-25T03:00:00-06:00","value":"Asleep Deep"},
  {"start":"2026-11-25T03:00:00-06:00","end":"2026-11-25T03:20:00-06:00","value":"Awake"},
  {"start":"2026-11-25T03:20:00-06:00","end":"2026-11-25T07:00:00-06:00","value":"Asleep REM"},
  {"start":"2026-11-24T23:00:00-06:00","end":"2026-11-25T07:15:00-06:00","value":"In Bed"}
]`;

describe('sleep stages', () => {
  it('keeps the night’s stages from Health, with time in bed around them', () => {
    const e = parseSleepImport(HEALTH)!;
    expect(e.minutes).toBe(430);
    const st = nightStats(e);
    expect(st.latency).toBe(30); // in bed 23:00, asleep 23:30
    expect(st.inBed).toBe(495); // 23:00–07:15
    expect(st.asleep).toBe(430);
    expect(st.awakenings).toBe(1);
    expect(st.stages).toMatchObject({ core: 120, deep: 90, rem: 220 }); // Deep wins where it overlaps Core
    expect(Math.round(st.efficiency! * 100)).toBe(87);
  });

  it('scores duration, quality and routine', () => {
    const e = parseSleepImport(HEALTH)!;
    const s = sleepScore(e, [], 480);
    expect(s.duration).toBe(90);
    expect(s.routine).toBeNull(); // no week of history yet
    expect(s.score).toBeGreaterThan(70);
    expect(s.score).toBeLessThan(100);
  });

  it('adds up debt, finds the usual times and compares habits', () => {
    const nights: SleepEntry[] = ['23:00', '23:30', '00:00', '23:30', '23:00'].map((bed, i) => ({
      date: `2026-11-${20 + i}`,
      bedtime: bed,
      wakeTime: '07:00',
      minutes: 420 + i * 10,
      source: 'manual',
    }));
    expect(sleepDebt(nights, 480, '2026-11-24')).toBe(60 + 50 + 40 + 30 + 20);
    const r = sleepRoutine(nights, '2026-11-24')!;
    expect(r.bed).toBe(23 * 60 + 24);
    expect(r.wake).toBe(7 * 60);
    expect(sleepAfter(nights, () => true)).toBeNull();
  });

});
