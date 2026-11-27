/**
 * The ring hero's motion (RingHero in ui/kit.tsx): one set of rings and one set of legend lines,
 * moved and resized as the page scrolls, never faded or swapped.
 *
 * Big (top of the page): the rings fill the width, the legend two by two under them.
 * Small (scrolled): the card as it's always been, rings on the left, the legend in a column beside.
 *
 * The rings shrink across the first half of the scroll on a gentle ease-in-out; meanwhile the legend's
 * rows spread apart, its lines slide into one column, and the column rises beside the rings, each
 * on its own overlapping eased stretch, so it reads as one motion. The stretches were found by
 * searching for the slowest rings and most overlap that never let a line touch the rings or
 * another line, at every iPhone width (heroMotion.test.ts checks it).
 *
 * The content below scrolls at the finger's speed. The hero, pinned while it collapses, keeps just
 * ahead of it: at most the content's top few points slip under the hero's soft bottom edge.
 */

export const HERO = {
  /** Above the rings, as in the card. */
  PAD: 10,
  /** The small rings' size (.ring-card.is-multi). */
  SMALL: 140,
  /** Small rings to the legend beside them. */
  BESIDE: 20,
  /** Rings to the legend under them. */
  UNDER: 18,
  /** Between the two rows of the big legend. */
  ROWGAP: 12,
  /** Between lines of the small legend. */
  LINE: 3,
  /** Extra room under the big legend, so the legend can unfold before the content below arrives.
   * Small enough that, at rest, the stats sit as far above the card below as below the rings. */
  SLACK: 9,
  /** Each part's stretch of the scroll (0 to 1), eased. The rings take the first half, gently: */
  RINGS: [0, 0.5],
  SPREAD: [0, 0.4],
  SLIDE: [0.2, 0.8],
  RISE: [0.4, 1],
};

export interface HeroInput {
  /** The hero's width. */
  width: number;
  /** Each legend line's width and height. */
  ws: number[];
  hs: number[];
}

export interface HeroFrame {
  ring: { x: number; y: number; size: number };
  items: { x: number; y: number }[];
  /** How far down the hero reaches (its backdrop's height). */
  height: number;
}

export interface HeroPlan {
  /** The page room the hero takes (the big layout plus slack). */
  bigH: number;
  /** The small layout's height. */
  smallH: number;
  /** Scroll from big to small. */
  span: number;
  frame: (p: number) => HeroFrame;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Smootherstep: eases in and out with no jolt at either end. */
const ease = (t: number) => t * t * t * (t * (6 * t - 15) + 10);
const along = (p: number, [a, b]: number[]) => ease(clamp((p - a) / (b - a)));
/** Smoothstep: a gentler ease in and out, for the rings. */
const gentle = (t: number) => t * t * (3 - 2 * t);

export function planHero({ width: W, ws, hs }: HeroInput): HeroPlan {
  const { PAD, SMALL, BESIDE, UNDER, ROWGAP, LINE, SLACK, RINGS, SPREAD, SLIDE, RISE } = HERO;
  const n = hs.length;
  // Small: rings and column centered on each other.
  const off: number[] = [];
  let o = 0;
  for (const h of hs) {
    off.push(o);
    o += h + LINE;
  }
  const legendH = n ? o - LINE : 0;
  const rowH = Math.max(SMALL, legendH);
  const ringY1 = PAD + (rowH - SMALL) / 2;
  const colTop = PAD + (rowH - legendH) / 2;
  const smallH = PAD + rowH;
  const colX = SMALL + BESIDE;
  // Big: two by two under the rings, the two columns spread evenly across the width.
  const left = Math.max(0, ...ws.filter((_, i) => i % 2 === 0));
  const right = Math.max(0, ...ws.filter((_, i) => i % 2 === 1));
  const free = W - left - right;
  const xs = free > 24 ? [free / 4, left + (free * 3) / 4] : [0, left + 12];
  const gridDy: number[] = [];
  let t = UNDER;
  for (let r = 0; r * 2 < n; r++) {
    const row = [r * 2, r * 2 + 1].filter((i) => i < n);
    for (const i of row) gridDy[i] = t;
    t += Math.max(...row.map((i) => hs[i])) + ROWGAP;
  }
  const gridH = n ? t - ROWGAP : UNDER;
  const bigH = PAD + W + gridH + SLACK;
  const span = Math.max(1, bigH - smallH);
  // The unfolded column, under the rings.
  const colDy = off.map((v) => UNDER + v);
  const frame = (pRaw: number): HeroFrame => {
    const p = clamp(pRaw);
    const r = gentle(clamp((p - RINGS[0]) / (RINGS[1] - RINGS[0])));
    const size = W + (SMALL - W) * r;
    const ringY = PAD + (ringY1 - PAD) * r;
    const ringBottom = ringY + size;
    const spread = along(p, SPREAD);
    const slide = along(p, SLIDE);
    const rise = along(p, RISE);
    const items = hs.map((_, i) => {
      const dy = gridDy[i] + (colDy[i] - gridDy[i]) * spread;
      const x0 = xs[i % 2];
      const under = ringBottom + dy;
      const final = colTop + off[i];
      return { x: x0 + (colX - x0) * slide, y: under + (final - under) * rise };
    });
    const height = Math.max(ringBottom, ...items.map((it, i) => it.y + hs[i]));
    return { ring: { x: 0, y: ringY, size }, items, height };
  };

  return { bigH, smallH, span, frame };
}
