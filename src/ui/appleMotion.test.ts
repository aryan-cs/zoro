import { describe, expect, it } from 'vitest';
import { MENU_OPEN, menuFrame } from './appleMotion';

// UIKit's measured case: a menu opening up from a 48pt button at (16, 600).
const to = { left: 16, top: 502, right: 266, bottom: 648 };
const from = { left: 28, top: 612, right: 52, bottom: 636 };
const near = { x: 'left', y: 'bottom' } as const;

describe('menuFrame', () => {
  it('starts as a 24pt circle at the button', () => {
    const f = menuFrame([0, 0, 0, 0, 0], from, to, near);
    expect(f.transform).toBe('translate(0.00px, 0.00px) scale(1.0000, 1.0000)');
    expect(f.clipPath).toBe('inset(110.00px 214.00px 12.00px 12.00px round 12.00px)');
  });

  it('moves the menu up where the glass shoots past its top, instead of clipping it off', () => {
    const peak = MENU_OPEN.find((r) => r[0] === 167)!;
    const f = menuFrame(peak, from, to, near);
    // UIKit's glass top is 480pt here, 22pt above the menu's: the menu moves up to show it.
    expect(f.transform).toMatch(/^translate\(0\.00px, -21\.\d+px\)/);
    expect(f.clipPath.startsWith('inset(0.00px')).toBe(true);
  });

  it('ends exactly on the menu', () => {
    const f = menuFrame([600, 1, 1, 1, 1], from, to, near);
    expect(f.transform).toBe('translate(0.00px, 0.00px) scale(1.0000, 1.0000)');
    expect(f.clipPath).toBe('inset(0.00px 0.00px 0.00px 0.00px round 34.00px)');
  });

  it('works for a menu opening down and to the left of its button', () => {
    const down = { left: 136, top: 62, right: 386, bottom: 313 };
    const btn = { left: 352, top: 72, right: 376, bottom: 96 };
    const f = menuFrame([0, 0, 0, 0, 0], btn, down, { x: 'right', y: 'top' });
    expect(f.clipPath).toBe('inset(10.00px 10.00px 217.00px 216.00px round 12.00px)');
  });
});
