import { describe, expect, it } from 'vitest';
import { LENGTH, NOTES } from './restSound';

describe('the rest sound', () => {
  it('is a bo-de-boop: two short beeps and a longer one, under a second', () => {
    expect(NOTES).toHaveLength(3);
    expect(NOTES[2][1]).toBeGreaterThan(NOTES[0][1] * 2);
    for (let i = 1; i < NOTES.length; i++) expect(NOTES[i][0]).toBeGreaterThan(NOTES[i - 1][0] + NOTES[i - 1][1]);
    expect(LENGTH).toBeLessThan(1);
  });
});
