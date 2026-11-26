import { describe, expect, it } from 'vitest';
import { stampTime } from './healthSync';

describe('Health upload names', () => {
  it('reads when a file was written, in local time', () => {
    expect(stampTime('20261126-090205.txt')).toBe(new Date(2026, 10, 26, 9, 2, 5).getTime());
    expect(stampTime('notes.txt')).toBeNull();
  });
});
