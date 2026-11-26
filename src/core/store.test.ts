import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZoroDB, saveSettings, setDB } from './db';
import {
  buildPlan,
  dayTotals,
  exportAll,
  finishSession,
  importAll,
  logFood,
  mergeBackup,
  logSet,
  saveMetric,
  saveSleep,
  startSession,
  today,
} from './store';
import type { FoodItem } from './types';

let db: ZoroDB;
beforeEach(async () => {
  db = new ZoroDB(`test-${Math.random()}`);
  setDB(db);
  await saveSettings({ programStart: today(), benchBlockStart: today() }, db);
});

const yogurt: FoodItem = {
  barcode: '123',
  name: 'Greek yogurt',
  per100g: { kcal: 59, protein: 10, carbs: 4, fat: 0.4 },
  serving: { label: '170 g', grams: 170, macros: { kcal: 100, protein: 17, carbs: 6, fat: 0.7 } },
  source: 'off',
  updatedAt: 0,
};

describe('store', () => {
  it('logs food and totals the day', async () => {
    await logFood({ food: yogurt, quantity: 2, unit: 'serving', meal: 'breakfast' }, db);
    await logFood({ food: yogurt, quantity: 100, unit: 'g', meal: 'snack' }, db);
    const t = await dayTotals(today(), db);
    expect(t.kcal).toBe(259);
    expect(t.protein).toBe(44);
    expect(await db.foods.count()).toBe(1); // same barcode is stored once
  });

  it('progresses a lift from logged sets', async () => {
    const plan = await buildPlan('upperB', today(), db);
    const row = () => plan.exercises.find((e) => e.exerciseId === 'cableRow')!;
    expect(row().sets[0].weight).toBeNull(); // first time: pick a weight
    const sid = await startSession(plan, today(), db);
    for (let i = 0; i < row().sets.length; i++) await logSet({ sessionId: sid, date: today(), exerciseId: 'cableRow', setIndex: i, weight: 100, reps: 12, targetReps: 8 }, db);
    await finishSession(sid, db);
    const next = await buildPlan('upperB', today(), db);
    expect(next.exercises.find((e) => e.exerciseId === 'cableRow')!.sets[0].weight).toBe(105);
  });

  it('re-logging a set updates it instead of duplicating', async () => {
    const plan = await buildPlan('upperA', today(), db);
    const sid = await startSession(plan, today(), db);
    await logSet({ sessionId: sid, date: today(), exerciseId: 'bench', setIndex: 0, weight: 150, reps: 4 }, db);
    await logSet({ sessionId: sid, date: today(), exerciseId: 'bench', setIndex: 0, weight: 150, reps: 5 }, db);
    expect(await db.sets.count()).toBe(1);
  });

  it('keeps one sleep entry and one weigh-in per day', async () => {
    await saveSleep({ date: today(), minutes: 400, source: 'manual' }, db);
    await saveSleep({ date: today(), minutes: 430, source: 'shortcut' }, db);
    await saveMetric('weight', 195, today(), db);
    await saveMetric('weight', 194.6, today(), db);
    expect(await db.sleep.count()).toBe(1);
    expect((await db.metrics.toArray())[0].value).toBe(194.6);
  });

  it('round-trips a backup', async () => {
    await logFood({ food: yogurt, quantity: 1, unit: 'serving', meal: 'lunch' }, db);
    await saveMetric('waist', 35.25, today(), db);
    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    const other = new ZoroDB(`restore-${Math.random()}`);
    await importAll(backup, other);
    expect(await other.entries.count()).toBe(1);
    expect((await other.metrics.toArray())[0].value).toBe(35.25);
    await expect(importAll({ nope: true }, other)).rejects.toThrow(/not a Zoro backup/);
  });

  it('merges a set-up copy without losing what the phone logged', async () => {
    // The phone: a weigh-in today, a food, and settings it changed itself.
    await saveSettings({ sex: 'male', phase: 'cut', daysPerWeek: 5 }, db);
    await saveMetric('weight', 194, today(), db);
    await logFood({ food: yogurt, quantity: 1, unit: 'serving', meal: 'lunch' }, db);
    const setup = {
      app: 'zoro',
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        settings: [{ key: 'settings', birthDate: '2006-03-05', heightIn: 73, daysPerWeek: 4, goalMetric: 'arm' }],
        metrics: [
          { id: 1, date: today(), type: 'weight', value: 195 },
          { id: 2, date: today(), type: 'arm', value: 16.25 },
        ],
        entries: [],
      },
    };
    await mergeBackup(setup, db);
    const s = await db.settings.get('settings');
    expect(s).toMatchObject({ sex: 'male', phase: 'cut', birthDate: '2006-03-05', heightIn: 73, daysPerWeek: 4, goalMetric: 'arm' });
    const metrics = await db.metrics.toArray();
    expect(metrics.find((m) => m.type === 'weight')?.value).toBe(194);
    expect(metrics.find((m) => m.type === 'arm')?.value).toBe(16.25);
    expect(await db.entries.count()).toBe(1);
  });
});
