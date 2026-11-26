import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ZoroDB } from './db';
import { bestSetsByDay } from './lifts';
import { deleteLiftEntry, exportAll, liftEntries, saveLiftEntry, today } from './store';

describe('best sets by day', () => {
  it('takes the higher estimated max, from a workout or entered by hand', () => {
    const out = bestSetsByDay(
      [
        { date: '2026-11-20', exerciseId: 'bench', weight: 185, reps: 5 },
        { date: '2026-11-20', exerciseId: 'bench', weight: 175, reps: 8 },
        { date: '2026-11-22', exerciseId: 'bench', weight: 200, reps: 3, manual: true },
        { date: '2026-11-21', exerciseId: 'bench', weight: 0, reps: 10 },
        { date: '2026-11-21', exerciseId: 'squat', weight: 225, reps: 5 },
      ],
      ['bench'],
    );
    expect(Object.keys(out)).toEqual(['bench']);
    expect(out.bench.map((p) => p.date)).toEqual(['2026-11-20', '2026-11-22']);
    // 175 × 8 (≈ 221.7) beats 185 × 5 (≈ 215.8).
    expect(out.bench[0]).toMatchObject({ weight: 175, reps: 8 });
    expect(out.bench[0].e1rm).toBeCloseTo(175 * (1 + 8 / 30), 6);
    expect(out.bench[1]).toMatchObject({ weight: 200, reps: 3, manual: true });
    expect(out.bench[1].e1rm).toBeCloseTo(220, 6);
  });
});

describe('lifts entered by hand', () => {
  it('keeps one per lift per day, and backs up', async () => {
    const db = new ZoroDB(`lifts-${Math.random()}`);
    const d = today();
    const id = await saveLiftEntry({ date: d, exerciseId: 'bench', weight: 185, reps: 5 }, db);
    expect(await saveLiftEntry({ date: d, exerciseId: 'bench', weight: 195, reps: 4 }, db)).toBe(id);
    await saveLiftEntry({ date: d, exerciseId: 'squat', weight: 225, reps: 5 }, db);
    const rows = await liftEntries(30, db);
    expect(rows.map((r) => [r.exerciseId, r.weight, r.reps]).sort()).toEqual([
      ['bench', 195, 4],
      ['squat', 225, 5],
    ]);
    expect((await exportAll(db)).tables.lifts).toHaveLength(2);
    await deleteLiftEntry(id, db);
    expect(await liftEntries(30, db)).toHaveLength(1);
  });
});
