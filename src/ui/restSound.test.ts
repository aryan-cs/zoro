import { describe, expect, it } from 'vitest';
// @ts-ignore: the app's types leave out Node's; vitest runs this in Node.
import { readFileSync } from 'node:fs';
import { CLIP_URL, LENGTH, NOTES } from './restSound';

describe('the rest sound', () => {
  it("is the PACER test's start tone and beat, shipped with the app", () => {
    expect(CLIP_URL.endsWith('sounds/pacer-start.mp3')).toBe(true);
    const mp3: Uint8Array = readFileSync(new URL('../../public/sounds/pacer-start.mp3', import.meta.url));
    expect(mp3.length).toBeGreaterThan(10_000);
    expect(mp3.length).toBeLessThan(100_000);
  });
  it('falls back to a bo-de-boop: two short beeps and a longer one, under a second', () => {
    expect(NOTES).toHaveLength(3);
    expect(NOTES[2][1]).toBeGreaterThan(NOTES[0][1] * 2);
    for (let i = 1; i < NOTES.length; i++) expect(NOTES[i][0]).toBeGreaterThan(NOTES[i - 1][0] + NOTES[i - 1][1]);
    expect(LENGTH).toBeLessThan(1);
  });
});
