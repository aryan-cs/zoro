import { describe, expect, it } from 'vitest';
import { effortTip, GUIDE, VIDEO } from './guide';
import { EXERCISES } from './program';

// The photos in public/exercises/, found the way Vite finds files (no Node types needed).
const PHOTOS = new Set(Object.keys(import.meta.glob('/public/exercises/*.webp')));

describe('exercise guide', () => {
  it('covers every exercise with photos on disk and one to three tips', () => {
    for (const id of Object.keys(EXERCISES)) {
      const g = GUIDE[id];
      expect(g, id).toBeDefined();
      const lines = g.tips.length + (g.effort ? 1 : 0);
      expect(lines, id).toBeGreaterThanOrEqual(1);
      expect(lines, id).toBeLessThanOrEqual(3);
      for (const f of g.still ? [0] : [0, 1]) expect(PHOTOS.has(`/public/exercises/${g.photo}-${f}.webp`), `${id} ${f}`).toBe(true);
    }
  });
  it('only has animations for real exercises', () => {
    for (const id of Object.keys(VIDEO)) expect(EXERCISES[id], id).toBeDefined();
  });
  it('says to take only the last set to failure when that is the plan', () => {
    expect(effortTip(GUIDE.pushdown, true)).toBe('Take this set to failure.');
    expect(effortTip(GUIDE.pushdown, false)).toMatch(/short of failure/);
    expect(effortTip(GUIDE.calfRaise, false)).toBe('Take this set to failure.');
    expect(effortTip(GUIDE.bench, true)).toMatch(/^Stop a rep or two short/);
    expect(effortTip(GUIDE.plank, true)).toBeUndefined();
  });
});
