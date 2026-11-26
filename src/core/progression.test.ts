import { describe, expect, it } from 'vitest';
import { EXERCISES, TEMPLATES, templateFor } from './program';
import { benchState, planBenchVariation, planBenchVolume, planDouble, planWorkout, type HistorySession } from './progression';
import { DEFAULT_SETTINGS } from './settings';
import type { PrescribedExercise, SetLog, Settings } from './types';

const settings: Settings = { ...DEFAULT_SETTINGS, programStart: '2026-11-30', benchBlockStart: '2026-11-30', benchMax: 195 };

let nextId = 1;
function session(
  date: string,
  templateId: HistorySession['templateId'],
  sets: [string, number, number, number?][],
  extra: Partial<HistorySession> = {},
): HistorySession {
  const sessionId = nextId++;
  const logs: SetLog[] = sets.map(([exerciseId, weight, reps, targetReps], i) => ({
    sessionId,
    date,
    exerciseId,
    setIndex: i,
    weight,
    reps,
    targetReps,
    completedAt: 0,
  }));
  return { sessionId, date, templateId, sets: logs, ...extra };
}

const rx = (over: Partial<PrescribedExercise> = {}): PrescribedExercise => ({
  exerciseId: 'inclineBarbell',
  sets: 3,
  repMin: 8,
  repMax: 12,
  restSec: 90,
  scheme: 'double',
  ...over,
});

describe('double progression', () => {
  it('asks for a starting weight the first time', () => {
    const out = planDouble(rx(), EXERCISES.inclineBarbell, [], 'upperA', settings, false);
    expect(out.sets).toHaveLength(3);
    expect(out.sets[0].weight).toBeNull();
    expect(out.notes[0]).toMatch(/First time/);
  });

  it('keeps the weight and adds a rep per set until the top of the range', () => {
    const h = [session('2026-11-30', 'upperA', [['inclineBarbell', 135, 10], ['inclineBarbell', 135, 9], ['inclineBarbell', 135, 8]])];
    const out = planDouble(rx(), EXERCISES.inclineBarbell, h, 'upperA', settings, false);
    expect(out.sets.map((s) => s.weight)).toEqual([135, 135, 135]);
    expect(out.sets.map((s) => s.reps)).toEqual([11, 10, 9]);
  });

  it('adds weight once every set hits the top of the range', () => {
    const h = [session('2026-11-30', 'upperA', [['inclineBarbell', 135, 12], ['inclineBarbell', 135, 12], ['inclineBarbell', 135, 12]])];
    const out = planDouble(rx(), EXERCISES.inclineBarbell, h, 'upperA', settings, false);
    expect(out.sets.every((s) => s.weight === 140 && s.reps === 8)).toBe(true);
  });

  it('caps dumbbells at the gym max and raises the rep target instead', () => {
    const h = [session('2026-11-30', 'upperB', [['dbShoulderPress', 60, 10], ['dbShoulderPress', 60, 10], ['dbShoulderPress', 60, 10]])];
    const r = rx({ exerciseId: 'dbShoulderPress', repMin: 8, repMax: 10 });
    const out = planDouble(r, EXERCISES.dbShoulderPress, h, 'upperB', { ...settings, dumbbellMax: 60 }, false);
    expect(out.sets.every((s) => s.weight === 60)).toBe(true);
    expect(out.sets[0].reps).toBe(11);
    expect(out.sets[0].repMax).toBe(20);
  });

  it('drops 10% after two tough sessions at the same weight', () => {
    const h = [
      session('2026-12-07', 'upperA', [['inclineBarbell', 155, 6], ['inclineBarbell', 155, 6], ['inclineBarbell', 155, 5]]),
      session('2026-11-30', 'upperA', [['inclineBarbell', 155, 7], ['inclineBarbell', 155, 6], ['inclineBarbell', 155, 6]]),
    ];
    const out = planDouble(rx(), EXERCISES.inclineBarbell, h, 'upperA', settings, false);
    expect(out.sets[0].weight).toBe(140);
  });

  it('halves sets and holds the weight on easy weeks', () => {
    const h = [session('2026-11-30', 'upperA', [['inclineBarbell', 135, 12], ['inclineBarbell', 135, 12], ['inclineBarbell', 135, 12]])];
    const out = planDouble(rx(), EXERCISES.inclineBarbell, h, 'upperA', settings, true);
    expect(out.sets).toHaveLength(2);
    expect(out.sets[0].weight).toBe(135);
  });

  it('adds seconds to timed holds', () => {
    const h = [session('2026-11-30', 'lowerB', [['sidePlank', 0, 35], ['sidePlank', 0, 40]])];
    const r = rx({ exerciseId: 'sidePlank', sets: 2, repMin: 30, repMax: 45 });
    const out = planDouble(r, EXERCISES.sidePlank, h, 'lowerB', settings, false);
    expect(out.sets[0].reps).toBe(45);
  });
});

describe('bench plan', () => {
  const sets = (n: number, w: number, r: number, t = r) => Array.from({ length: n }, () => ['bench', w, r, t] as [string, number, number, number]);

  it('opens with an as-many-as-you-can set at 165 for a 195 max, then 3×5 at 145', () => {
    const plan = planWorkout({ template: TEMPLATES.upperA, settings, today: '2026-11-30', history: [] });
    const bench = plan.exercises.find((e) => e.exerciseId === 'bench')!;
    expect(plan.benchStep).toBe(0);
    expect(bench.sets.map((x) => [x.weight, x.reps])).toEqual([[165, 8], [145, 5], [145, 5], [145, 5]]);
    expect(bench.sets[0].label).toBe('As many as you can');
  });

  it('sets the max from week 1’s first set, counting the rep left in reserve', () => {
    const wk1 = session('2026-11-30', 'upperA', [['bench', 165, 10, 8], ...sets(3, 145, 5)], { benchStep: 0 });
    const st = benchState(settings, [wk1]);
    expect(st).toEqual({ step: 1, max: 225 }); // 165 × (1 + 11/30) = 225.5
    const plan = planWorkout({ template: TEMPLATES.upperA, settings, today: '2026-12-07', history: [wk1] });
    expect(plan.exercises.find((e) => e.exerciseId === 'bench')!.sets[0]).toMatchObject({ weight: 180, reps: 3, label: 'Top set' });
  });

  it('moves on with at most one set short, and repeats the week with two', () => {
    const wk1 = session('2026-11-30', 'upperA', [['bench', 165, 8, 8], ...sets(3, 145, 5)], { benchStep: 0 });
    const ok = session('2026-12-07', 'upperA', [...sets(1, 155, 3), ...sets(3, 145, 5), ['bench', 145, 4, 5]], { benchStep: 1 });
    expect(benchState(settings, [wk1, ok]).step).toBe(2);
    const rough = session('2026-12-07', 'upperA', [...sets(1, 155, 3), ...sets(2, 145, 5), ['bench', 145, 4, 5], ['bench', 145, 3, 5]], { benchStep: 1 });
    expect(benchState(settings, [wk1, rough]).step).toBe(1);
  });

  it('raises the max to the test day’s best and carries on into block 2', () => {
    const history: HistorySession[] = [session('2026-11-30', 'upperA', [['bench', 165, 8, 8], ...sets(3, 145, 5)], { benchStep: 0 })];
    for (let step = 1; step <= 10; step++) history.push(session(`2026-12-${String(step + 1).padStart(2, '0')}`, 'upperA', sets(6, 150, 5), { benchStep: step }));
    history.push(session('2027-02-15', 'upperA', [['bench', 200, 1, 1], ['bench', 212.5, 1, 1]], { benchStep: 11 }));
    expect(benchState(settings, history)).toEqual({ step: 12, max: 215 });
  });

  it('keeps the volume and variation days on the same week as the heavy day', () => {
    const wk1 = session('2026-11-30', 'upperA', [['bench', 165, 8, 8], ...sets(3, 145, 5)], { benchStep: 0 });
    expect(planBenchVolume(0, 195, false).sets.map((x) => [x.weight, x.reps])).toEqual([[125, 8], [125, 8], [125, 8], [125, 8]]);
    expect(planBenchVariation(0, 195, false)?.exerciseId).toBe('pausedBench');
    // The easy week has no variation day.
    expect(planBenchVariation(5, 195, false)).toBeNull();
    expect(benchState(settings, [wk1]).step).toBe(1);
  });

  it('goes light in a program easy week without using up a bench week', () => {
    const wk1 = session('2026-11-30', 'upperA', [['bench', 165, 8, 8], ...sets(3, 145, 5)], { benchStep: 0 });
    const plan = planWorkout({ template: TEMPLATES.upperA, settings, today: '2027-01-04', history: [wk1] });
    expect(plan.deload).toBe(true);
    expect(plan.benchStep).toBeUndefined();
    expect(plan.exercises.find((e) => e.exerciseId === 'bench')!.sets).toHaveLength(3);
  });
});

describe('4-day split', () => {
  it('moves arm work onto the upper days', () => {
    const a = templateFor('upperA', 4).exercises.map((e) => e.exerciseId);
    const b = templateFor('upperB', 4).exercises.map((e) => e.exerciseId);
    expect(a).toContain('preacherCurl');
    expect(b[1]).toBe('closeGripBench');
  });
});

describe('workoutDayPercent', () => {
  it('counts exercises started and averages the day', async () => {
    const { workoutDayPercent, templateFor } = await import('./program');
    const n = templateFor('upperA', 5).exercises.length;
    const ex = templateFor('upperA', 5).exercises.map((e) => e.exerciseId);
    // Three exercises started of upperA's n.
    const third = workoutDayPercent(['upperA'], [{ id: 1, templateId: 'upperA' }], ex.slice(0, 3).map((exerciseId) => ({ sessionId: 1, exerciseId })), 5);
    expect(third).toBe(Math.round((3 / n) * 100));
    // One finished and one halfway: 75%.
    const m = templateFor('pmAbs', 5).exercises.length;
    const half = templateFor('pmAbs', 5).exercises.slice(0, Math.max(1, m / 2)).map((e) => ({ sessionId: 2, exerciseId: e.exerciseId }));
    const day = workoutDayPercent(['upperA', 'pmAbs'], [{ id: 1, templateId: 'upperA', finishedAt: 1 }, { id: 2, templateId: 'pmAbs' }], half, 5);
    expect(day).toBe(Math.round(((1 + Math.min(1, half.length / m)) / 2) * 100));
    expect(workoutDayPercent([], [], [], 5)).toBeNull();
    expect(workoutDayPercent(['upperA'], [], [], 5)).toBe(0);
  });
});
