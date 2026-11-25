import { describe, expect, it } from 'vitest';
import { EXERCISES, TEMPLATES, templateFor } from './program';
import { benchProgress, planDouble, planWorkout, type HistorySession } from './progression';
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

describe('bench table', () => {
  it('starts at 4×5 @ 150 for a 195 max', () => {
    const plan = planWorkout({ template: TEMPLATES.upperA, settings, today: '2026-11-30', history: [] });
    const bench = plan.exercises[0];
    expect(plan.benchStep).toBe(0);
    expect(bench.sets).toHaveLength(4);
    expect(bench.sets.every((s) => s.weight === 150 && s.reps === 5)).toBe(true);
  });

  it('advances only when every rep is hit', () => {
    const ok = session('2026-11-30', 'upperA', [['bench', 150, 5, 5], ['bench', 150, 5, 5], ['bench', 150, 5, 5], ['bench', 150, 5, 5]], { benchStep: 0 });
    expect(benchProgress(settings, [ok]).step).toBe(1);
    const miss = session('2026-12-07', 'upperA', [['bench', 155, 5, 5], ['bench', 155, 5, 5], ['bench', 155, 4, 5], ['bench', 155, 4, 5]], { benchStep: 1 });
    expect(benchProgress(settings, [ok, miss]).step).toBe(1);
  });

  it('starts a new block from the tested max after step 12', () => {
    // Steps 1–11, each with enough passing sets.
    const history: HistorySession[] = Array.from({ length: 11 }, (_, step) =>
      session(`2026-12-${String(step + 1).padStart(2, '0')}`, 'upperA', Array.from({ length: 6 }, () => ['bench', 150, 5, 5] as [string, number, number, number]), {
        benchStep: step,
      }),
    );
    history.push(session('2027-02-15', 'upperA', [['bench', 210, 1, 1]], { benchStep: 11 }));
    const out = benchProgress(settings, history);
    expect(out.step).toBe(0);
    expect(out.newMax).toBe(210);
  });

  it('goes light during calendar easy weeks without using up a step', () => {
    const plan = planWorkout({ template: TEMPLATES.upperA, settings, today: '2027-01-04', history: [] });
    expect(plan.deload).toBe(true);
    expect(plan.benchStep).toBeUndefined();
    expect(plan.exercises[0].sets[0].weight).toBe(135);
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
