import { describe, expect, it } from 'vitest';
import { EXERCISES, TEMPLATES, templateFor } from './program';
import { planWorkout } from './progression';
import { DEFAULT_SETTINGS } from './settings';
import type { TemplateId } from './types';
import { estimateMinutes, rounds } from './workoutTime';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'upperB', 'lowerB'];
const settings = { ...DEFAULT_SETTINGS, programStart: '2026-11-30', benchBlockStart: '2026-11-30', daysPerWeek: 4 as const };
const plan = (id: TemplateId) => planWorkout({ template: templateFor(id, 4), settings, today: '2026-12-14', history: [] });
const minutes = (id: TemplateId) => estimateMinutes(plan(id).exercises.map((e) => ({ exerciseId: e.exerciseId, reps: e.sets.map((s) => s.reps), restSec: e.restSec, superset: e.superset })));

describe('how long a workout takes', () => {
  it('matches a real session: 16 sets of Bench, Back, and Shoulders took 63 minutes', () => {
    const real = estimateMinutes([
      { exerciseId: 'bench', reps: [8, 8, 8, 8], restSec: 180 },
      { exerciseId: 'kneelingPulldown', reps: [8, 8, 8], restSec: 90 },
      { exerciseId: 'dips', reps: [6, 6, 6], restSec: 120 },
      { exerciseId: 'cableRow', reps: [8, 8, 8], restSec: 120 },
      { exerciseId: 'preacherCurl', reps: [8, 8, 8], restSec: 90 },
    ]);
    expect(Math.abs(real - 63)).toBeLessThanOrEqual(5);
  });

  it('keeps every training day within about an hour, warm-ups included', () => {
    for (const id of MAIN) expect(minutes(id), id).toBeLessThanOrEqual(60);
    expect(minutes('arms')).toBeLessThanOrEqual(40);
  });

  it('does supersets in rounds: a set of each, then the rest', () => {
    const steps = rounds(plan('upperB').exercises, (e) => e.sets.length).slice(0, 4);
    expect(steps.map((s) => [s.ex.exerciseId, s.i, s.restAfter])).toEqual([
      ['bench', 0, 0],
      ['cableRow', 0, 150],
      ['bench', 1, 0],
      ['cableRow', 1, 150],
    ]);
    expect(plan('upperB').exercises.find((e) => e.exerciseId === 'cableRow')?.notes[0]).toBe('Alternate with Bench Press: a set of each, then rest.');
  });
});

describe('the week', () => {
  it('never pairs a muscle with itself', () => {
    // Wrist curls and reverse wrist curls are opposite sides of the forearm (flexors, extensors).
    const side = (id: string) => (id === 'wristCurl' ? 'forearm flexors' : id === 'reverseWristCurl' ? 'forearm extensors' : EXERCISES[id].muscles[0]);
    for (const t of Object.values(TEMPLATES)) {
      const byLabel = new Map<string, string[]>();
      for (const e of t.exercises) if (e.superset) byLabel.set(e.superset, [...(byLabel.get(e.superset) ?? []), side(e.exerciseId)]);
      for (const muscles of byLabel.values()) expect(new Set(muscles).size, t.id).toBe(muscles.length);
    }
  });

  it('gives each goal muscle its weekly sets (Mon, Tue, Thu, Fri; direct sets)', () => {
    const weekly: Record<string, number> = {};
    for (const id of MAIN) for (const e of plan(id).exercises) for (const m of EXERCISES[e.exerciseId].muscles.slice(0, 1)) weekly[m] = (weekly[m] ?? 0) + e.sets.length;
    expect(weekly.chest).toBeGreaterThanOrEqual(9);
    expect(weekly.chest).toBeLessThanOrEqual(13);
    expect(weekly.biceps).toBeGreaterThanOrEqual(9);
    expect(weekly.triceps).toBeGreaterThanOrEqual(9);
    expect(weekly.forearms).toBeGreaterThanOrEqual(6);
    expect(weekly.back).toBeGreaterThanOrEqual(8);
    expect(weekly['side delts']).toBe(6);
    expect(weekly.quads).toBeGreaterThanOrEqual(5);
    expect(weekly.hamstrings).toBeGreaterThanOrEqual(5);
    expect(weekly.abs).toBeGreaterThanOrEqual(3);
  });
});
