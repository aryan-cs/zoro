import { describe, expect, it } from 'vitest';
// @ts-ignore: the app's types leave out Node's; vitest runs this in Node.
import { readFileSync } from 'node:fs';
import { BOUNCY, SMOOTH, SNAPPY, SPRING_TOKENS, project, rubberBand, settleTime, springAt, springCss, springEasing } from './motion';

describe('springs', () => {
  it('start at 0 and come to rest at 1', () => {
    for (const s of [SMOOTH, SNAPPY, BOUNCY]) {
      expect(springAt(s, 0)).toBeCloseTo(0, 9);
      expect(springAt(s, settleTime(s))).toBeCloseTo(1, 2);
      expect(springAt(s, 5)).toBeCloseTo(1, 6);
    }
  });

  it('never pass the end with no bounce, from rest', () => {
    for (let t = 0; t < 2; t += 0.001) expect(springAt(SMOOTH, t)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('bounce past the end by about what SwiftUI says', () => {
    let peak = 0;
    for (let t = 0; t < 2; t += 0.001) peak = Math.max(peak, springAt(BOUNCY, t));
    expect(peak).toBeGreaterThan(1.03);
    expect(peak).toBeLessThan(1.06);
  });

  it('start at the speed they are given', () => {
    const h = 1e-5;
    for (const v0 of [-3, 0, 4, 12]) expect((springAt(SNAPPY, h, v0) - springAt(SNAPPY, 0, v0)) / h).toBeCloseTo(v0, 2);
  });

  it('trace themselves closely as CSS linear() curves', () => {
    for (const [s, v0] of [[SMOOTH, 0], [BOUNCY, 0], [SNAPPY, 6]] as const) {
      const { ms, easing } = springEasing(s, v0);
      const stops = easing
        .slice('linear('.length, -1)
        .split(', ')
        .map((p, i, all) => {
          const [y, x] = p.split(' ');
          return { y: Number(y), x: x ? parseFloat(x) / 100 : i / (all.length - 1) };
        });
      expect(stops[0]).toEqual({ y: 0, x: 0 });
      expect(stops[stops.length - 1].y).toBe(1);
      for (let k = 0; k <= 200; k++) {
        const x = k / 200;
        const j = Math.max(1, stops.findIndex((p) => p.x >= x));
        const a = stops[j - 1];
        const b = stops[j];
        const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
        expect(Math.abs(y - (x === 1 ? 1 : springAt(s, (x * ms) / 1000, v0)))).toBeLessThan(0.004);
      }
    }
  });
});

describe('gestures', () => {
  it('project a flick as UIScrollView coasts', () => {
    expect(project(1)).toBeCloseTo(499, 6);
    expect(project(-0.5)).toBeCloseTo(-249.5, 6);
    expect(project(1, 0.99)).toBeCloseTo(99, 6);
  });

  it('rubber-band less and less, never past the limit', () => {
    let last = 0;
    for (let x = 10; x < 5000; x += 10) {
      const r = rubberBand(x, 300);
      expect(r).toBeGreaterThan(last);
      expect(r).toBeLessThan(300);
      expect(r).toBeLessThan(x);
      last = r;
    }
    expect(rubberBand(-100, 300)).toBeCloseTo(-rubberBand(100, 300), 9);
  });
});

describe('CSS tokens', () => {
  it('match the springs they name', () => {
    const css: string = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    for (const [name, s] of Object.entries(SPRING_TOKENS)) {
      const line = css.match(new RegExp(`--spring-${name}: ([^;]+);`));
      expect(line?.[1], `--spring-${name}`).toBe(springCss(s));
    }
  });
});
