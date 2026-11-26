import { describe, expect, it } from 'vitest';
import { HERO, planHero } from './heroMotion';

// Legend lines as Food and Today draw them (label over value, about 40pt tall), at every iPhone
// width (the hero is the screen less 64pt of margins and card padding).
const LEGENDS = {
  food: [165, 95, 110, 90],
  today: [150, 112, 122, 80],
  wide: [180, 170, 160, 150],
};
const WIDTHS = [311, 326, 329, 338, 366, 376];

describe('ring hero motion', () => {
  for (const [name, ws] of Object.entries(LEGENDS)) {
    for (const width of WIDTHS) {
      it(`never overlaps (${name}, ${width}pt)`, () => {
        const hs = ws.map(() => 40);
        const plan = planHero({ width, ws, hs });
        for (let k = 0; k <= 1000; k++) {
          const p = k / 1000;
          const { ring, items } = plan.frame(p);
          const cx = ring.x + ring.size / 2;
          const cy = ring.y + ring.size / 2;
          items.forEach((a, i) => {
            const ra = { l: a.x, t: a.y, r: a.x + ws[i], b: a.y + hs[i] };
            // Clear of the rings (a circle), by a few points.
            const nx = Math.min(Math.max(cx, ra.l), ra.r);
            const ny = Math.min(Math.max(cy, ra.t), ra.b);
            expect(Math.hypot(cx - nx, cy - ny), `line ${i} vs rings at p=${p}`).toBeGreaterThan(ring.size / 2 + 4);
            // Inside the hero's backdrop.
            expect(ra.b, `line ${i} vs backdrop at p=${p}`).toBeLessThanOrEqual(plan.frame(p).height + 0.01);
            // Nearly clear of the content below (which starts about 28pt under the big hero and rises
            // a point per point scrolled): at most its top few points go under the hero's soft edge.
            expect(ra.b, `line ${i} vs content at p=${p}`).toBeLessThanOrEqual(plan.bigH - p * plan.span + 32);
            // Clear of every other line.
            items.forEach((b, j) => {
              if (j <= i) return;
              const rb = { l: b.x, t: b.y, r: b.x + ws[j], b: b.y + hs[j] };
              const overlap = ra.l < rb.r - 1 && rb.l < ra.r - 1 && ra.t < rb.b - 1 && rb.t < ra.b - 1;
              expect(overlap, `lines ${i} and ${j} at p=${p}`).toBe(false);
            });
          });
        }
      });
    }
  }

  it('starts big and ends as the card', () => {
    const ws = LEGENDS.food;
    const hs = ws.map(() => 40);
    const plan = planHero({ width: 338, ws, hs });
    const big = plan.frame(0);
    expect(big.ring).toEqual({ x: 0, y: HERO.PAD, size: 338 });
    expect(big.items[0].y).toBe(big.items[1].y); // two by two
    expect(big.items[0].y).toBeGreaterThan(HERO.PAD + 338);
    const small = plan.frame(1);
    expect(small.ring.size).toBe(HERO.SMALL);
    expect(small.items.every((it) => it.x === HERO.SMALL + HERO.BESIDE)).toBe(true); // one column
    expect(small.items.map((it) => it.y)).toEqual([10, 53, 96, 139]);
    expect(plan.smallH).toBe(HERO.PAD + 169);
  });
});
