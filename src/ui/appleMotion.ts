/**
 * Apple's motion, measured: each curve below was read frame by frame from UIKit itself in the iOS
 * 27 simulator (scripts/nativelab: `trace` records every layer's on-screen frame, opacity and scale
 * at 60fps while something opens or closes), not tuned by eye.
 */

/**
 * A menu growing out of its button (_UIContextMenuView, opened from a 48pt glass button): the glass
 * starts as a 24pt circle at the button's center, then each edge travels to the menu's on its own
 * curve. Rows: [ms, near x, near y, far x, far y], each the share of its edge's way from the circle
 * to the menu; "near" edges are on the button's side. The far edge shoots past and the near one
 * swings back first, which is the liquid pop.
 */
export const MENU_OPEN_MS = 600;
export const MENU_OPEN: number[][] = [
  [17, -0.0, 0.0, 0.0, -0.0],
  [83, 0.433, -0.277, 0.433, 0.72],
  [117, 0.668, -1.094, 0.668, 1.05],
  [133, 0.763, -1.286, 0.763, 1.141],
  [150, 0.84, -1.287, 0.84, 1.187],
  [167, 0.901, -1.133, 0.901, 1.199],
  [183, 0.948, -0.875, 0.947, 1.189],
  [200, 0.98, -0.566, 0.98, 1.165],
  [217, 1.002, -0.246, 1.003, 1.137],
  [233, 1.017, 0.057, 1.017, 1.107],
  [250, 1.025, 0.322, 1.025, 1.08],
  [267, 1.028, 0.542, 1.028, 1.056],
  [283, 1.028, 0.718, 1.028, 1.037],
  [300, 1.026, 0.85, 1.026, 1.022],
  [317, 1.023, 0.945, 1.023, 1.011],
  [333, 1.019, 1.01, 1.019, 1.004],
  [350, 1.016, 1.049, 1.016, 0.998],
  [367, 1.012, 1.072, 1.012, 0.995],
  [383, 1.009, 1.081, 1.009, 0.993],
  [400, 1.007, 1.08, 1.006, 0.993],
  [417, 1.004, 1.074, 1.004, 0.993],
  [433, 1.002, 1.065, 1.003, 0.994],
  [450, 1.002, 1.055, 1.001, 0.994],
  [467, 1.001, 1.043, 1.0, 0.995],
  [483, 1.0, 1.034, 1.0, 0.996],
  [500, 0.999, 1.026, 0.999, 0.997],
  [517, 1.006, 1.022, 1.0, 0.998],
  [534, 1.007, 1.016, 1.0, 0.999],
  [550, 1.007, 1.012, 1.0, 0.999],
  [600, 1, 1, 1, 1],
];

/** Closing: the glass lifts a little, then shrinks back into a circle at the button. */
export const MENU_CLOSE_MS = 440;
export const MENU_CLOSE: number[][] = [
  [17, 0.988, 0.583, 0.988, 1.042],
  [33, 0.942, -0.315, 0.942, 1.126],
  [50, 0.873, -0.91, 0.873, 1.162],
  [67, 0.791, -1.123, 0.791, 1.141],
  [100, 0.612, -0.893, 0.611, 0.979],
  [117, 0.524, -0.63, 0.524, 0.863],
  [133, 0.442, -0.369, 0.441, 0.74],
  [150, 0.366, -0.152, 0.366, 0.62],
  [167, 0.298, 0.007, 0.298, 0.508],
  [183, 0.238, 0.106, 0.238, 0.408],
  [200, 0.187, 0.155, 0.187, 0.32],
  [217, 0.143, 0.165, 0.143, 0.245],
  [234, 0.106, 0.148, 0.106, 0.183],
  [250, 0.076, 0.117, 0.076, 0.132],
  [267, 0.052, 0.077, 0.052, 0.091],
  [283, 0.033, 0.037, 0.032, 0.059],
  [300, 0.018, 0.003, 0.018, 0.034],
  [317, 0.006, -0.027, 0.006, 0.015],
  [333, -0.002, -0.05, -0.002, 0.001],
  [350, -0.007, -0.066, -0.008, -0.008],
  [367, -0.012, -0.075, -0.012, -0.015],
  [383, -0.014, -0.08, -0.014, -0.019],
  [400, -0.015, -0.081, -0.015, -0.021],
  [417, -0.015, -0.077, -0.015, -0.021],
  [433, -0.015, -0.073, -0.015, -0.021],
];

/** While it closes, the rows shrink toward the button and fade: [ms, opacity, scale]. */
export const MENU_CLOSE_CONTENT: number[][] = [
  [17, 0.98, 0.98],
  [33, 0.9, 0.92],
  [50, 0.79, 0.83],
  [67, 0.67, 0.73],
  [100, 0.44, 0.55],
  [117, 0.34, 0.47],
  [133, 0.26, 0.41],
  [150, 0.19, 0.35],
  [167, 0.14, 0.31],
  [183, 0.1, 0.28],
  [200, 0.06, 0.25],
  [217, 0.04, 0.23],
  [234, 0.02, 0.22],
  [250, 0.01, 0.21],
  [267, 0, 0.2],
];

/** Easings as CSS `linear()` curves traced from UIKit (each with its duration). */
export const EASE = {
  "sheet-in": "520ms linear(0.000 0.0%, 0.035 3.2%, 0.339 12.8%, 0.445 16.0%, 0.541 19.2%, 0.625 22.4%, 0.696 25.6%, 0.756 28.9%, 0.805 32.1%, 0.846 35.3%, 0.878 38.5%, 0.904 41.7%, 0.925 44.9%, 0.941 48.1%, 0.954 51.3%, 0.965 54.5%, 0.973 57.7%, 0.979 60.9%, 0.984 64.1%, 0.987 67.3%, 0.990 70.5%, 0.993 73.7%, 0.994 76.9%, 0.996 80.1%, 0.997 83.3%, 0.997 86.5%, 0.998 89.7%, 0.999 93.0%, 0.999 96.2%, 1.000 99.4%, 1.000 100.0%)",
  "sheet-out": "460ms linear(0.000 0.0%, 0.046 3.4%, 0.246 10.6%, 0.357 14.3%, 0.462 17.9%, 0.556 21.5%, 0.638 25.1%, 0.707 28.8%, 0.765 32.4%, 0.813 36.0%, 0.852 39.6%, 0.883 43.3%, 0.908 46.9%, 0.928 50.5%, 0.944 54.1%, 0.956 57.7%, 0.966 61.4%, 0.974 65.0%, 0.980 68.6%, 0.984 72.2%, 0.988 75.9%, 0.991 79.5%, 0.993 83.1%, 0.995 86.7%, 0.996 90.4%, 0.997 94.0%, 0.998 97.6%, 1.000 100.0%)",
  "alert-in-scale": "420ms linear(0.000 0.0%, 0.050 4.0%, 0.307 11.9%, 0.442 15.9%, 0.564 20.0%, 0.659 23.8%, 0.740 27.8%, 0.804 31.8%, 0.854 35.7%, 0.892 39.8%, 0.921 43.8%, 0.941 47.6%, 0.957 51.7%, 0.969 55.6%, 0.977 59.5%, 0.984 63.6%, 0.988 67.6%, 0.992 71.6%, 0.994 75.5%, 0.996 79.5%, 0.997 83.5%, 0.998 87.3%, 0.998 91.3%, 0.999 95.4%, 1.000 99.2%, 1.000 100.0%)",
  "alert-in-fade": "420ms linear(0.000 0.0%, 0.050 4.0%, 0.310 11.9%, 0.440 15.9%, 0.560 20.0%, 0.660 23.8%, 0.740 27.8%, 0.800 31.8%, 0.850 35.7%, 0.890 39.8%, 0.920 43.8%, 0.940 47.6%, 0.960 51.7%, 0.970 55.6%, 0.980 59.5%, 0.980 63.6%, 0.990 67.6%, 0.990 71.6%, 0.990 75.5%, 1.000 79.5%, 1.000 83.5%, 1.000 87.3%, 1.000 91.3%, 1.000 95.4%, 1.000 99.2%, 1.000 100.0%)",
  "alert-out": "340ms linear(0.000 0.0%, 0.000 4.9%, 0.070 9.8%, 0.190 14.7%, 0.330 19.6%, 0.470 24.5%, 0.580 29.4%, 0.680 34.4%, 0.750 39.3%, 0.820 44.2%, 0.860 49.1%, 0.900 54.0%, 0.920 58.9%, 0.940 63.8%, 0.960 68.7%, 0.970 73.7%, 0.980 78.6%, 0.980 83.5%, 0.990 88.4%, 0.990 93.1%, 0.990 98.0%, 1.000 100.0%)",
  "tab": "560ms linear(0.000 0.0%, -0.000 3.0%, 0.059 6.0%, 0.148 9.0%, 0.252 12.0%, 0.360 14.9%, 0.464 17.9%, 0.561 21.0%, 0.647 23.8%, 0.721 26.8%, 0.784 29.8%, 0.836 32.8%, 0.879 35.7%, 0.913 38.7%, 0.939 41.7%, 0.960 44.7%, 0.975 47.6%, 0.986 50.6%, 0.994 53.6%, 0.999 56.6%, 1.003 59.6%, 1.005 62.5%, 1.006 65.5%, 1.006 68.5%, 1.006 71.5%, 1.006 74.4%, 1.005 77.4%, 1.005 80.4%, 1.004 83.4%, 1.003 86.4%, 1.003 89.3%, 1.002 92.3%, 1.002 95.3%, 1.001 98.3%, 1.000 100.0%)",
  "press": "330ms linear(0.000 0.0%, 0.102 5.1%, 0.236 9.7%, 0.387 14.8%, 0.538 19.8%, 0.675 24.9%, 0.789 29.9%, 0.879 35.0%, 0.944 40.0%, 0.988 45.1%, 1.013 50.1%, 1.024 55.2%, 1.024 60.2%, 1.017 65.3%, 1.007 70.3%, 0.994 75.4%, 0.983 80.4%, 0.971 85.5%, 0.962 90.5%, 0.954 95.6%, 1.000 100.0%)",
  "release": "330ms linear(0.000 0.0%, 0.052 5.1%, 0.093 10.1%, 0.186 15.2%, 0.310 20.2%, 0.446 25.3%, 0.581 30.3%, 0.706 35.4%, 0.816 40.4%, 0.906 45.5%, 0.976 50.5%, 1.027 55.6%, 1.061 60.6%, 1.081 65.7%, 1.089 70.7%, 1.089 75.8%, 1.082 80.8%, 1.071 85.9%, 1.059 90.9%, 1.046 96.0%, 1.000 100.0%)"
};

/** How much a glass button grows while pressed (UIKit's 370pt-wide glass button: 386pt). */
export const PRESS_SCALE = 1.0432;

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * One frame of a menu's shape: where the glass is, as a transform of the menu plus a clip inside
 * it. Safari can't clip the menu itself (that cuts its glass off from the page), so the shape is a
 * clip on each layer, and the parts that overshoot the menu's own box come from the transform.
 */
export function menuFrame(p: number[], from: Box, to: Box, near: { x: 'left' | 'right'; y: 'top' | 'bottom' }, radius = 34) {
  const [, nx, ny, fx, fy] = p;
  const far = { x: near.x === 'left' ? 'right' : 'left', y: near.y === 'top' ? 'bottom' : 'top' } as const;
  const at = (edge: keyof Box, k: number) => from[edge] + k * (to[edge] - from[edge]);
  const r: Box = { left: 0, top: 0, right: 0, bottom: 0 };
  r[near.x] = at(near.x, nx);
  r[far.x] = at(far.x, fx);
  r[near.y] = at(near.y, ny);
  r[far.y] = at(far.y, fy);
  const W = to.right - to.left;
  const H = to.bottom - to.top;
  const w = Math.max(0, r.right - r.left);
  const h = Math.max(0, r.bottom - r.top);
  // Scale only when the shape is bigger than the menu; move only when it pokes out of it.
  const sx = Math.max(1, w / W);
  const sy = Math.max(1, h / H);
  const fit = (lo: number, hi: number, size: number, s: number, start: number) => {
    // Offset d with start + d <= lo and start + d + s*size >= hi, as small as possible.
    const min = hi - start - s * size;
    const max = lo - start;
    return Math.min(Math.max(0, min), max);
  };
  const dx = fit(r.left, r.right, W, sx, to.left);
  const dy = fit(r.top, r.bottom, H, sy, to.top);
  const local = {
    left: (r.left - to.left - dx) / sx,
    top: (r.top - to.top - dy) / sy,
    right: W - (r.right - to.left - dx) / sx,
    bottom: H - (r.bottom - to.top - dy) / sy,
  };
  const round = Math.min(radius, w / 2, h / 2) / Math.max(sx, sy);
  const px = (v: number) => `${Math.max(0, v).toFixed(2)}px`;
  return {
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
    clipPath: `inset(${px(local.top)} ${px(local.right)} ${px(local.bottom)} ${px(local.left)} round ${Math.max(0, round).toFixed(2)}px)`,
  };
}
