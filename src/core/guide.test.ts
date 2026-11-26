import { describe, expect, it } from 'vitest';
import { GUIDE, VIDEO } from './guide';
import { EXERCISES } from './program';

// The photos in public/exercises/, found the way Vite finds files (no Node types needed).
const PHOTOS = new Set(Object.keys(import.meta.glob('/public/exercises/*.webp')));

describe('exercise guide', () => {
  it('covers every exercise with photos on disk and one to three tips', () => {
    for (const id of Object.keys(EXERCISES)) {
      const g = GUIDE[id];
      expect(g, id).toBeDefined();
      expect(g.tips.length, id).toBeGreaterThanOrEqual(1);
      expect(g.tips.length, id).toBeLessThanOrEqual(3);
      for (const f of g.still ? [0] : [0, 1]) expect(PHOTOS.has(`/public/exercises/${g.photo}-${f}.webp`), `${id} ${f}`).toBe(true);
    }
  });
  it('only has animations for real exercises', () => {
    for (const id of Object.keys(VIDEO)) expect(EXERCISES[id], id).toBeDefined();
  });
});
