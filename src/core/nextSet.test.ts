import { describe, expect, it } from 'vitest';
import { nextSet } from './nextSet';

const order = ['a:0', 'a:1', 'a:2', 'b:0', 'b:1', 'c:0'];

describe('the next set', () => {
  it('is the first set when nothing is logged', () => {
    expect(nextSet(order, new Set())).toBe('a:0');
  });
  it('follows the one you just logged, even with earlier ones skipped', () => {
    expect(nextSet(order, new Set(['b:0']), 'b:0')).toBe('b:1');
    expect(nextSet(order, new Set(['a:0', 'b:0', 'b:1']), 'b:1')).toBe('c:0');
  });
  it('skips sets already logged further down', () => {
    expect(nextSet(order, new Set(['a:0', 'a:1', 'b:0']), 'a:1')).toBe('a:2');
    expect(nextSet(order, new Set(['a:0', 'a:2', 'b:0']), 'a:0')).toBe('a:1');
    expect(nextSet(order, new Set(['a:1', 'a:2', 'b:0']), 'a:1')).toBe('b:1');
  });
  it('comes back around to the top for skipped ones after the last set', () => {
    expect(nextSet(order, new Set(['b:0', 'b:1', 'c:0']), 'c:0')).toBe('a:0');
    expect(nextSet(order, new Set(['a:0', 'b:0', 'b:1', 'c:0']), 'c:0')).toBe('a:1');
  });
  it('is nothing when every set is logged', () => {
    expect(nextSet(order, new Set(order), 'c:0')).toBeUndefined();
  });
});
