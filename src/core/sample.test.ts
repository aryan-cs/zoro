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
