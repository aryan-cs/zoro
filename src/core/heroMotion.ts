/**
 * The ring hero's motion (RingHero in ui/kit.tsx): one set of rings and one set of legend lines,
 * moved and resized as the page scrolls, never faded or swapped.
 *
 * Big (top of the page): the rings fill the width, the legend two by two under them.
 * Small (scrolled): the card as it's always been, rings on the left, the legend in a column beside.
 *
 * From big to small, by scroll progress p (0 to 1):
 *  1. The rings shrink into the top left (fast, by p = A).
 *  2. Meanwhile the legend, riding just under the rings, unfolds from two by two into a column:
 *     first the rows spread apart (by p = B), each line getting its own height, then the lines
 *     slide sideways into one column (by p = C). Lines never share a height while they slide, so
 *     they can't run into each other, and they stay under the rings, so they can't cross them.
 *  3. The column rises into place beside the small rings (C to 1).
 *
 * The page keeps the big layout's height (plus a little slack) and the hero stays pinned while it
 * shrinks, so the content below rises one point per point scrolled; the timing keeps every line
 * above it the whole way.
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
  /** Extra room under the big legend, so the legend can unfold before the content below arrives. */
  SLACK: 24,
  /** By this much scroll the rings are small. */
  A: 0.25,
  /** By this much the legend's rows have spread apart. */
  B: 0.2,
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
}

export interface HeroPlan {
  /** The page room the hero takes (the big layout plus slack). */
  bigH: number;
  /** The small layout's height. */
  smallH: number;
  /** Scroll from big to small. */
  span: number;
  /** When the column starts to rise. */
  C: number;
  frame: (p: number) => HeroFrame;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function planHero({ width: W, ws, hs }: HeroInput): HeroPlan {
  const { PAD, SMALL, BESIDE, UNDER, ROWGAP, LINE, SLACK, A, B } = HERO;
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
  const colBottom = n ? Math.max(...colDy.map((d, i) => d + hs[i])) : 0;
  const ringSmallBottom = ringY1 + SMALL;
  // The column has to start rising before the content below (rising at one point per point
  // scrolled) reaches its bottom.
  const C = Math.min(0.5, Math.max(Math.max(A, B) + 0.08, (bigH - ringSmallBottom - colBottom) / span - 0.02));

  const frame = (pRaw: number): HeroFrame => {
    const p = clamp(pRaw);
    const r = clamp(p / A);
    const size = W + (SMALL - W) * r;
    const ringY = PAD + (ringY1 - PAD) * r;
    const ringBottom = ringY + size;
    const spread = smooth(clamp(p / B));
    const slide = smooth(clamp((p - B) / (C - B)));
    const rise = clamp((p - C) / (1 - C));
    return {
      ring: { x: 0, y: ringY, size },
      items: hs.map((_, i) => {
        const dy = gridDy[i] + (colDy[i] - gridDy[i]) * spread;
        const x0 = xs[i % 2];
        const under = ringBottom + dy;
        const final = colTop + off[i];
        return { x: x0 + (colX - x0) * slide, y: under + (final - under) * rise };
      }),
    };
  };

  return { bigH, smallH, span, C, frame };
}
