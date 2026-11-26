import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { activitySteps, KM_PER_MILE, runCadence, walkStepsPerMile } from './activity';
import { ZoroDB, saveSettings } from './db';
import { addActivity, addExerciseToSession, addExtraExercise, buildPlan, deleteActivity, removeExtraExercise, saveMetric, stepsOn } from './store';
import { workoutDayPercent } from './program';

const me = { heightIn: 70, sex: 'male' as const };

describe('steps from an activity', () => {
  it('walks a mile in about 2,200 steps at 5′10″', () => {
    expect(walkStepsPerMile(me)).toBeCloseTo(63360 / (70 * 0.415), 6);
    expect(activitySteps({ kind: 'walk', miles: 1 }, me)).toBe(2181);
    // Shorter people take more steps.
    expect(activitySteps({ kind: 'walk', miles: 1 }, { heightIn: 62, sex: 'female' })).toBeGreaterThan(2400);
  });

  it('takes kilometres (as miles) and a time alone at 3 mph', () => {
    expect(activitySteps({ kind: 'walk', miles: 5 / KM_PER_MILE }, me)).toBe(Math.round((5 / KM_PER_MILE) * walkStepsPerMile(me)));
    // 20 minutes at 3 mph is a mile.
    expect(activitySteps({ kind: 'walk', minutes: 20 }, me)).toBe(2181);
  });

  it('runs by cadence at the pace a distance and time give', () => {
    // 3.1 miles in 30 minutes is 6.2 mph: about 164 steps a minute.
    expect(runCadence(6.2)).toBeCloseTo(164.1, 6);
    expect(activitySteps({ kind: 'run', miles: 3.1, minutes: 30 }, me)).toBe(Math.round(164.1 * 30));
    // A mile run is fewer steps than a mile walked.
    expect(activitySteps({ kind: 'run', miles: 1 }, me)).toBeLessThan(activitySteps({ kind: 'walk', miles: 1 }, me));
    expect(activitySteps({ kind: 'run', minutes: 10 }, me)).toBe(1650);
  });

  it('climbs 16 steps a floor, or about 70 a minute', () => {
    expect(activitySteps({ kind: 'stairs', floors: 50 }, me)).toBe(800);
    expect(activitySteps({ kind: 'stairs', minutes: 20 }, me)).toBe(1400);
    expect(activitySteps({ kind: 'stairs', floors: 50, minutes: 20 }, me)).toBe(800);
  });

  it('is nothing with nothing to go on', () => {
    expect(activitySteps({ kind: 'walk' }, me)).toBe(0);
    expect(activitySteps({ kind: 'run', miles: 0, minutes: -3 }, me)).toBe(0);
  });
});

describe('steps added to a day', () => {
  it('adds to Apple Health’s count, which still syncs over its own', async () => {
    const db = new ZoroDB(`act-${Math.random()}`);
    await saveSettings({ heightIn: 70, sex: 'male' }, db);
    await saveMetric('steps', 5000, '2026-11-26', db);
    const id = await addActivity({ date: '2026-11-26', kind: 'walk', miles: 1 }, db);
    expect(await stepsOn('2026-11-26', db)).toMatchObject({ health: 5000, added: 2181, total: 7181 });
    // A later Health sync replaces its own number, not what you added.
    await saveMetric('steps', 6000, '2026-11-26', db);
    expect((await stepsOn('2026-11-26', db)).total).toBe(8181);
    await deleteActivity(id, db);
    expect((await stepsOn('2026-11-26', db)).total).toBe(6000);
  });
});

describe('extra exercises', () => {
  it('collects a day’s added exercises in one Extra Exercises workout, planned like the program', async () => {
    const db = new ZoroDB(`extra-${Math.random()}`);
    const a = await addExtraExercise('2026-11-26', 'hammerCurl', db);
    const b = await addExtraExercise('2026-11-26', 'facePull', db);
    expect(b).toBe(a);
    const s = await db.sessions.get(a);
    expect(s).toMatchObject({ templateId: 'extra', extras: ['hammerCurl', 'facePull'] });
    const plan = await buildPlan('extra', '2026-11-26', db, a, s!.extras);
    expect(plan.exercises.map((e) => e.exerciseId)).toEqual(['hammerCurl', 'facePull']);
    expect(plan.exercises[0].sets.length).toBeGreaterThan(0);
    await removeExtraExercise(a, 'hammerCurl', db);
    expect((await db.sessions.get(a))?.extras).toEqual(['facePull']);
  });

  it('can go on the end of any workout, and never counts toward the day’s workout ring', async () => {
    const db = new ZoroDB(`extra2-${Math.random()}`);
    const plan = await buildPlan('upperA', '2026-11-23', db);
    await addExerciseToSession(1, 'x', db); // no such session: nothing happens
    const n = plan.exercises.length;
    const withMore = await buildPlan('upperA', '2026-11-23', db, undefined, ['wristCurl']);
    expect(withMore.exercises.length).toBe(n + 1);
    expect(withMore.exercises.at(-1)?.exerciseId).toBe('wristCurl');
    expect(workoutDayPercent([], [{ id: 1, templateId: 'extra' }], [{ sessionId: 1, exerciseId: 'wristCurl' }], 5)).toBeNull();
  });
});
