import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getSettings, ZoroDB } from './db';
import { workoutFor } from './program';
import { swapWorkout } from './store';

describe('swapping a day’s workout', () => {
  it('does another workout (or rests) that day only, and swapping back clears it', async () => {
    const db = new ZoroDB(`swap-${Math.random()}`);
    // Thursday 26 November 2026 is the volume bench day; Friday is legs.
    expect(workoutFor('2026-11-26', await getSettings(db))).toBe('upperB');
    await swapWorkout('2026-11-26', 'lowerA', db);
    let s = await getSettings(db);
    expect(workoutFor('2026-11-26', s)).toBe('lowerA');
    expect(workoutFor('2026-11-27', s)).toBe('lowerB');
    // A rest day can take a workout, and a workout day can rest.
    await swapWorkout('2026-11-25', 'arms', db);
    await swapWorkout('2026-11-27', 'rest', db);
    s = await getSettings(db);
    expect(workoutFor('2026-11-25', s)).toBe('arms');
    expect(workoutFor('2026-11-27', s)).toBeNull();
    // Picking the program's own workout again takes the swap away.
    await swapWorkout('2026-11-26', 'upperB', db);
    s = await getSettings(db);
    expect(s.workoutSwaps).toEqual({ '2026-11-25': 'arms', '2026-11-27': 'rest' });
    expect(workoutFor('2026-11-26', s)).toBe('upperB');
  });
});
