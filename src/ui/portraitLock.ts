/**
 * Portrait only, like the phone apps Zoro copies. iOS gives a Home Screen web app no way to lock
 * its orientation (it ignores the manifest's "orientation", and screen.orientation.lock doesn't
 * exist there), so when a phone turns sideways the app turns itself back: the page is laid out at
 * portrait size and rotated a quarter turn the other way, so it stays put on the screen, as a
 * portrait-only app does.
 *
 * Code that reads positions (touches, pointers, element boxes, the window's size) would then get
 * the rotated screen's numbers, so those are translated back into the page's own upright
 * coordinates while it's turned. Everything else (layout, scrolling, taps) works as usual.
 */

/** How the page is turned against the screen: 0, or a quarter turn either way. */
let turn: 0 | 90 | -90 = 0;

type Getter = (this: unknown) => number;
function getterOf(target: object, key: string): Getter | null {
  for (let o: object | null = target; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (d?.get) return d.get as Getter;
  }
  return null;
}

let innerW: Getter = () => window.innerWidth;
let innerH: Getter = () => window.innerHeight;
/** The real (screen) viewport size, while the page may be turned. */
const screenW = () => innerW.call(window);
const screenH = () => innerH.call(window);

/** A point on the screen as the upright page sees it. */
function toPage(x: number, y: number): [number, number] {
  if (turn === -90) return [screenH() - y, x];
  if (turn === 90) return [y, screenW() - x];
  return [x, y];
}

/** Swap in getters that translate while the page is turned (and pass straight through otherwise). */
function patch(target: object, key: string, make: (orig: Getter) => Getter) {
  const orig = getterOf(target, key);
  if (!orig) return;
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get: make(orig) });
}

function patchPositions() {
  for (const proto of [MouseEvent.prototype, typeof Touch === 'undefined' ? null : Touch.prototype]) {
    if (!proto) continue;
    const gx = getterOf(proto, 'clientX');
    const gy = getterOf(proto, 'clientY');
    if (!gx || !gy) continue;
    patch(proto, 'clientX', () => function (this: unknown) {
      const x = gx.call(this);
      return turn ? toPage(x, gy.call(this))[0] : x;
    });
    patch(proto, 'clientY', () => function (this: unknown) {
      const y = gy.call(this);
      return turn ? toPage(gx.call(this), y)[1] : y;
    });
  }

  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const r = rect.call(this);
    if (!turn) return r;
    const [x1, y1] = toPage(r.left, r.top);
    const [x2, y2] = toPage(r.right, r.bottom);
    return new DOMRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  };

  innerW = getterOf(window, 'innerWidth') ?? innerW;
  innerH = getterOf(window, 'innerHeight') ?? innerH;
  const w0 = innerW;
  const h0 = innerH;
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => (turn ? h0.call(window) : w0.call(window)) });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => (turn ? w0.call(window) : h0.call(window)) });

  if (typeof VisualViewport !== 'undefined') {
    const vw = getterOf(VisualViewport.prototype, 'width');
    const vh = getterOf(VisualViewport.prototype, 'height');
    if (vw && vh) {
      patch(VisualViewport.prototype, 'width', () => function (this: unknown) {
        return turn ? vh.call(this) : vw.call(this);
      });
      patch(VisualViewport.prototype, 'height', () => function (this: unknown) {
        return turn ? vw.call(this) : vh.call(this);
      });
    }
  }
}

/** The safe-area inset on one side, read from CSS. */
function inset(side: 'left' | 'right'): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;width:env(safe-area-inset-${side},0px)`;
  document.documentElement.appendChild(probe);
  const v = probe.getBoundingClientRect().width;
  probe.remove();
  return v;
}

/** Which way the screen has turned: the angle iOS reports, 90 one way and 270 (or -90) the other. */
function screenAngle(): number {
  const a = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

export function lockPortrait(): void {
  // Phones only: an iPad (or a computer) can turn as it likes.
  if (Math.min(screen.width, screen.height) >= 600 || navigator.maxTouchPoints < 1) return;
  patchPositions();
  const root = document.documentElement;
  const fit = () => {
    const w = screenW();
    const h = screenH();
    const next: typeof turn = w > h ? (screenAngle() === 90 ? -90 : 90) : 0;
    turn = 0; // measure untranslated
    root.classList.toggle('turned', next !== 0);
    if (next) {
      // Laid out at portrait size, then turned back a quarter turn so it sits upright on the phone.
      root.style.setProperty('--turn-w', `${h}px`);
      root.style.setProperty('--turn-h', `${w}px`);
      root.style.setProperty('--turn', next === -90 ? `translateY(${h}px) rotate(-90deg)` : `translateX(${w}px) rotate(90deg)`);
      // The page's top now runs along the side with the Dynamic Island. iOS reports the same
      // inset on both sides in landscape, so the larger one is the island's.
      root.style.setProperty('--turn-safe-top', `${Math.max(inset('left'), inset('right'))}px`);
    }
    turn = next;
  };
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 0));
  screen.orientation?.addEventListener?.('change', fit);
}
