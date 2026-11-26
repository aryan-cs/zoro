import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZoroDB } from './db';
import { addSampleWeek, removeSampleData } from './store';

let db: ZoroDB;
beforeEach(() => {
  db = new ZoroDB(`sample-${Math.random()}`);
});

describe('sample data', () => {
  it('fills eight weeks of workouts and removes all of it', async () => {
    await addSampleWeek(db);
    const sessions = await db.sessions.toArray();
    expect(sessions.length).toBeGreaterThan(25);
    expect(await db.sets.count()).toBeGreaterThan(400);
    expect((await db.sleep.count())).toBe(30);
    await addSampleWeek(db); // twice doesn't double
    expect((await db.sessions.count())).toBe(sessions.length);
    await removeSampleData(db);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    expect(await db.metrics.count()).toBe(0);
  });
});

describe('sample data stays out of real use', () => {
  it('is left out of backups and of workout planning', async () => {
    const { exportAll, loadHistory } = await import('./store');
    await addSampleWeek(db);
    const backup = await exportAll(db);
    for (const rows of Object.values(backup.tables)) expect((rows as { sample?: boolean }[]).some((r) => r.sample)).toBe(false);
    expect(backup.tables.sets.length).toBe(0);
    expect((await loadHistory(db)).length).toBe(0);
    expect((await loadHistory(db, 400, true)).length).toBeGreaterThan(25);
  });
});

describe('removeWater', () => {
  it('takes ounces back off newest drinks first, never below zero', async () => {
    const { addWater, removeWater, waterFor } = await import('./store');
    await addWater(16, '2026-01-01', db);
    await new Promise((r) => setTimeout(r, 2));
    await addWater(8, '2026-01-01', db);
    await removeWater(12, '2026-01-01', db);
    expect((await waterFor('2026-01-01', db)).reduce((s, e) => s + e.oz, 0)).toBe(12);
    await removeWater(50, '2026-01-01', db);
    expect((await waterFor('2026-01-01', db)).reduce((s, e) => s + e.oz, 0)).toBe(0);
  });
});
