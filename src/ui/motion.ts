/**
 * Apple's motion, for CSS transitions and the Web Animations API.
 *
 * iOS moves things on springs, named by a duration and a bounce as in SwiftUI
 * (`.smooth` is 0.5 s with no bounce, `.snappy` bounces 0.15, `.bouncy` 0.3): a mass of 1 on a
 * spring of stiffness (2π / duration)² with damping 4π (1 − bounce) / duration. A spring has no
 * fixed length; it runs until it's at rest, and it can start already moving, so a thing let go
 * mid-flick carries on at the finger's speed instead of starting over from still.
 *
 * Gestures follow the finger one to one while it's down. On release, where the thing goes is
 * decided by where it would coast to (UIScrollView's deceleration, 0.998 per ms), and past an edge
 * it gives less and less (UIScrollView's rubber band). No timers decide anything.
 *
 * The CSS tokens in index.css (--spring-*) are these same curves, written out by
 * `springEasing` (motion.test.ts checks they match).
 */

export interface Spring {
  /** Seconds; the time it takes to look done (the spring's period, for no bounce). */
  duration: number;
  /** 0 for none (critically damped), up to 1; as SwiftUI's. */
  bounce?: number;
}

export const SMOOTH: Spring = { duration: 0.5, bounce: 0 };
export const SNAPPY: Spring = { duration: 0.5, bounce: 0.15 };
export const BOUNCY: Spring = { duration: 0.5, bounce: 0.3 };

/**
 * How far along a spring is (0 at the start, 1 at rest) `t` seconds in, having started at
 * velocity `v0` (whole distances per second, toward the end).
 */
export function springAt({ duration, bounce = 0 }: Spring, t: number, v0 = 0): number {
  const w = (2 * Math.PI) / duration;
  const z = 1 - Math.min(1, Math.max(0, bounce));
  // Distance from rest: 1 at the start, moving toward it at v0.
  const x0 = 1;
  const dx0 = -v0;
  if (z >= 1) return 1 - (x0 + (dx0 + w * x0) * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (x0 * Math.cos(wd * t) + ((dx0 + z * w * x0) / wd) * Math.sin(wd * t));
}

/** Seconds until the spring stays within `eps` (of the whole distance) of rest. */
export function settleTime(s: Spring, v0 = 0, eps = 0.001): number {
  const dt = 1 / 600;
  let last = 0;
  for (let t = 0; t < 6; t += dt) if (Math.abs(1 - springAt(s, t, v0)) >= eps) last = t;
  return last + dt;
}

/** Fewest points that keep a sampled curve within `tol` of itself (Ramer–Douglas–Peucker). */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    // Vertical distance from the chord: what a linear() curve gets wrong at that moment.
    const d = Math.abs(py - (ay + ((by - ay) * (px - ax)) / (bx - ax || 1)));
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

const round = (v: number, d: number) => {
  const r = Number(v.toFixed(d));
  return Object.is(r, -0) ? 0 : r;
};

/**
 * A spring as a CSS timing: how long it runs (ms) and a linear() easing that traces it, starting at
 * `v0` (whole distances per second). For a transition, an animation, or el.animate().
 */
export function springEasing(s: Spring, v0 = 0): { ms: number; easing: string } {
  const total = settleTime(s, v0);
  const n = 240;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([i / n, i === n ? 1 : springAt(s, (i / n) * total, v0)]);
  const kept = simplify(pts, 0.0015);
  const stops = kept.map(([x, y], i) => (i === 0 || i === kept.length - 1 ? `${round(y, 3)}` : `${round(y, 3)} ${round(x * 100, 1)}%`));
  return { ms: Math.round(total * 1000), easing: `linear(${stops.join(', ')})` };
}

/** `springEasing` as one CSS value: "520ms linear(…)", for `transition: transform <this>`. */
export function springCss(s: Spring, v0 = 0): string {
  const { ms, easing } = springEasing(s, v0);
  return `${ms}ms ${easing}`;
}

/**
 * Where something flicked at `v` (px per ms) would come to rest past where it is, coasting as a
 * UIScrollView does (`rate` per ms: 0.998, or 0.99 for a paging-quick stop).
 */
export const project = (v: number, rate = 0.998) => (v * rate) / (1 - rate);

/** Past an edge, `x` points of pull move it this far: less and less, never past `d` (UIScrollView's). */
export const rubberBand = (x: number, d: number, c = 0.55) => (1 - 1 / ((Math.abs(x) * c) / d + 1)) * d * Math.sign(x);

/**
 * A finger's speed, from its last tenth of a second (px per ms). A finger that had stopped before
 * lifting isn't moving.
 */
export function velocityTracker() {
  let pts: { x: number; t: number }[] = [];
  return {
    add(x: number, t: number) {
      pts.push({ x, t });
      while (pts.length > 2 && t - pts[0].t > 100) pts.shift();
    },
    reset() {
      pts = [];
    },
    velocity(now?: number): number {
      if (pts.length < 2) return 0;
      const a = pts[0];
      const b = pts[pts.length - 1];
      if ((now ?? b.t) - b.t > 80) return 0;
      return (b.x - a.x) / Math.max(1, b.t - a.t);
    },
  };
}

/** The springs index.css names (--spring-<name>): what each kind of motion in the app runs on. */
export const SPRING_TOKENS: Record<string, Spring> = {
  /** Things moving a long way: sheets, pages, rows sliding into new places. */
  smooth: SMOOTH,
  /** Controls settling with a touch of give: a segmented control's thumb, the tab bar's lens. */
  snappy: SNAPPY,
  /** Things that pop into being: menus, alerts, toasts. */
  bouncy: BOUNCY,
  /** Fades, and anything small and quick. */
  quick: { duration: 0.3, bounce: 0 },
  /** A button pressed and let go. */
  press: { duration: 0.25, bounce: 0.15 },
};
