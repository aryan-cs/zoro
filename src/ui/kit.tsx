import { useLiveQuery } from 'dexie-react-hooks';
import {
  BlockTitle,
  Dialog,
  DialogButton,
  List,
  ListButton,
  ListItem,
  Page,
  Popup,
  Progressbar,
  Sheet,
  Toast,
} from 'konsta/react';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { carbTarget } from '../core/calc';
import { NavBar, NavButton, NavButtonGroup, NavTextButton, PullDownMenu, SegmentedControl } from './bars';
import { InStack } from './nav';
import { Sym } from './Sym';
import { SF, type SFName } from './sf';
import { getDB, getSettings } from '../core/db';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { Macros, Settings } from '../core/types';

/**
 * Shared building blocks. Wherever iOS has a native control, these wrap Konsta's iOS
 * component for it (Navbar, List, ListItem, Segmented, Sheet, Dialog, Toast, Glass)
 * rather than drawing our own.
 */

export const db = getDB();

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS);
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtLb = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${fmt(n, n % 1 ? 1 : 0)}`);

/** Apple's secondary label color in dark mode. */
export const dim = 'text-[rgba(235,235,245,0.6)]';

export function timeAgo(t: number | undefined): string {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Navigation bar ----------

/** iOS navigation bar (our own, see bars.tsx): centered title, round glass buttons, optional row below. */
export function Header(props: { title: ReactNode; onBack?: () => void; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return <NavBar {...props} />;
}

/** Round glass icon button for the navigation bar. */
export function IconBtn(props: { label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <NavButton label={props.label} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </NavButton>
  );
}

/** Icon buttons grouped in one glass capsule in the navigation bar. */
export const IconGroup = NavButtonGroup;
export const Menu = PullDownMenu;

/** Text button for the navigation bar (Done, Cancel, Finish). */
export function NavText(props: { onClick?: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <NavTextButton onClick={props.onClick} strong={props.strong}>
      {props.children}
    </NavTextButton>
  );
}

// ---------- Grouped lists ----------

/** A titled inset grouped list (Konsta List). Children are Rows, Cells or Fields. */
/**
 * A grouped list (or plain block). Like Apple's Settings, groups carry no titles and are set apart
 * by space alone, with an optional gray footnote under the group; `title` names it for VoiceOver. Numbered setup steps (`keep`) still show
 * theirs, since the heading is the instruction.
 */
export function Section(props: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; plain?: boolean; keep?: boolean; footer?: ReactNode }) {
  const titled = !!props.keep && !!(props.title || props.right);
  return (
    <div
      className={`${titled ? '' : 'zoro-section-untitled'} ${props.className ?? ''}`}
      role="group"
      aria-label={!titled && typeof props.title === 'string' ? props.title : undefined}
    >
      {titled && (
        <BlockTitle className="zoro-section-title flex items-center justify-between gap-2">
          <span className="min-w-0">{props.title}</span>
          {props.right && <span className="flex h-[22px] shrink-0 items-center text-[15px] font-normal">{props.right}</span>}
        </BlockTitle>
      )}
      {props.plain ? (
        <div className="mx-4">{props.children}</div>
      ) : (
        <List strong inset dividers className="!my-0">
          {props.children}
        </List>
      )}
      {props.footer && <p className="zoro-section-footer">{props.footer}</p>}
    </div>
  );
}

/** Gray placeholder row for an empty list ("No Items"), like Apple's empty states. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return <li className="zoro-empty-row">{children}</li>;
}

/** A standard list row (Konsta ListItem). Accent and danger rows are list buttons. */
export function Row(props: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  accent?: boolean;
  /** Touch-and-hold handlers (useHoldInfo) for the whole row. */
  hold?: object;
}) {
  // Action rows use native list buttons.
  if ((props.accent || props.danger) && props.onClick && !props.chevron && !props.sub) {
    return (
      <ListButton onClick={props.onClick} className="zoro-list-action" colors={props.danger ? { textIos: 'text-[#ff453a]' } : undefined}>
        {props.title}
      </ListButton>
    );
  }
  return (
    <ListItem
      link={!!props.onClick}
      chevron={!!props.chevron}
      title={props.accent ? <span className="text-accent">{props.title}</span> : props.title}
      subtitle={props.sub}
      after={props.right == null ? undefined : <div className="min-w-0 text-right">{props.right}</div>}
      onClick={props.onClick}
      innerClassName={props.sub ? 'zoro-row-inner min-w-0 !py-2' : 'zoro-row-inner min-w-0 !py-0'}
      titleWrapClassName={`zoro-row-title min-w-0 ${props.sub ? '!min-h-0' : '!min-h-[52px]'}`}
      strongTitle={false}
      {...props.hold}
    />
  );
}

/** A list row with custom content, divided like the others. */
export function Cell(props: { children: ReactNode; className?: string }) {
  return (
    <ListItem
      innerClassName="min-w-0 !py-0"
      innerChildren={<div className={props.className ?? 'py-2.5'}>{props.children}</div>}
    />
  );
}

/** Label on the left, input on the right, like iOS Settings. */
export function Field(props: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  placeholder?: string;
  wide?: boolean;
  secret?: boolean;
}) {
  return (
    <ListItem
      label
      innerClassName="min-w-0 !py-0"
      innerChildren={
        <div className="flex min-h-[52px] min-w-0 items-center gap-3">
          <span className="max-w-[65%] shrink-0 text-[17px] leading-[22px]">{props.label}</span>
          <input
            type={props.secret ? 'password' : (props.type ?? 'text')}
            inputMode={props.inputMode}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={props.placeholder}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            onBlur={props.onBlur}
            className={`zoro-field-input tabular h-[52px] min-w-0 flex-1 truncate bg-transparent text-right text-[17px] outline-none placeholder:text-[rgba(235,235,245,0.3)] ${dim} focus:text-white`}
          />
        </div>
      }
    />
  );
}

// ---------- Controls ----------

/** iOS button: a glass capsule with a white label (`tint` and `glass` look the same), red for `danger`, blue text for `plain`. */
export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'tint' | 'glass' | 'danger' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}) {
  // Liquid Glass capsule with a white label, like the Continue button in Fitness setup.
  // sm 34pt / 15pt (inside rows), md 44pt / 17pt, lg 52pt / 17pt full width.
  const kind = props.kind === 'tint' ? 'glass' : props.kind ?? 'glass';
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`ios-btn is-${props.size ?? 'md'} is-${kind} ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  );
}

/** iOS segmented control (see bars.tsx): gray track, sliding selected capsule. */
export function Seg<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return <SegmentedControl {...props} />;
}

/** Thin progress bar. */
export function Bar(props: { value: number; target: number; color: string; className?: string }) {
  const pct = props.target > 0 ? Math.min(1, props.value / props.target) : 0;
  return (
    <Progressbar
      progress={pct}
      className={props.className}
      style={{ '--bar-color': props.color } as CSSProperties}
      colors={{ activeBgIos: 'bg-[var(--bar-color)]', trackBgIos: 'bg-white/15' }}
    />
  );
}

/** Calories left plus protein, carbs and fat, in one compact block. */
/** Apple Fitness's ring and stat colors, sampled from the Fitness app (iOS 27, dark). */
export const FITNESS = {
  move: '#fa114f',
  exercise: '#a6ff00',
  stand: '#00f5ea',
  distance: '#00b7ff',
  steps: '#a28be1',
  /** Not in Fitness: Health's sleep indigo and body orange, at Fitness's brightness. */
  sleep: '#7d7aff',
  body: '#ff9f0a',
  /** Carbs: a vivid orange, as bright as the other rings. */
  carbs: '#ff9500',
};

/** Ring gradients sampled from Apple's Activity rings: start color at 12 o'clock to end color a full lap later. */
export const RING_GRADIENT = {
  move: ['#e2001a', '#ff3d97'],
  exercise: ['#3edd00', '#b8ff00'],
  stand: ['#00b8e6', '#00f5d4'],
  carbs: ['#ff6a00', '#ffb800'],
  steps: ['#7d5bf0', '#c3a8ff'],
  distance: ['#0091ff', '#00d9ff'],
  sleep: ['#5e5ce6', '#a09eff'],
  /** Health's sleep stages. */
  rem: ['#2aa8f2', '#8fe2ff'],
  core: ['#1d64f2', '#5fa6ff'],
  deep: ['#4a3fe3', '#968cff'],
} as const;

/** Fitness's stroked arrow, or an SF Symbol drawn filled on the start cap (the macro rings). */
type RingGlyph = 'arrow' | SFName;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mixColor(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
/** Point on the ring at `deg` degrees clockwise from 12 o'clock. */
function onRing(cx: number, cy: number, r: number, deg: number) {
  const t = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

/**
 * An Apple Activity ring: a track of the ring color at 15% (as measured on Fitness's cards), the
 * progress arc shaded along its length from the start color to the end color, round caps, a glyph
 * on the start cap in a deep shade of the ring color, and past the goal a second lap whose tip casts
 * a shadow.
 */
/**
 * A number that glides to each new value (ease-out over `ms`) instead of jumping: rings fill and
 * empty smoothly. Starts at its first value without animating.
 */
export function useTweened(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const v = from + (target - from) * (1 - Math.pow(1 - k, 3));
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/**
 * A whole number that changes like an odometer. One value counts from the old number to the new
 * one; the ones place spins continuously and each higher place turns only while the place below
 * it rolls over from 9 to 0, so every in-between reading is a real number on the way (64 → 80
 * passes 65, 66 … 79). Counting up rolls upward, counting down rolls downward. An invisible digit
 * in each place sets its width and baseline, so it lines up with the text around it.
 */
/** Degrees the drum turns per digit: steep enough that a leaving digit visibly tips into the screen. */
const STEP_DEG = 60;

export function RollingNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const target = Math.round(value);
  const v = useTweened(target, 800);
  const a = Math.abs(v);
  const places = String(Math.max(Math.round(a), Math.abs(target))).length;
  const resting = Math.abs(v - target) < 0.001;
  return (
    <span className="odo" aria-label={`${target}${suffix}`}>
      {target < 0 && '−'}
      {Array.from({ length: places }, (_, i) => {
        const p = places - 1 - i; // most significant first
        const unit = 10 ** p;
        // Position on the 0–9 drum: the ones follow the value; a higher place adds the share of
        // the last unit below it that is rolling over (…9.x → …0).
        const below = a % unit;
        const turning = p === 0 ? a % 1 : Math.max(0, below - (unit - 1));
        const pos = (Math.floor(a / unit) % 10) + turning;
        // A leading place (nothing above it) shows blank instead of 0.
        const leading = p > 0 && a < unit * 10 && Math.floor(a / (unit * 10)) === 0;
        const blankZero = leading && Math.floor(a / unit) === 0;
        if (resting) {
          const d = Math.floor(Math.abs(target) / unit) % 10;
          return p > 0 && Math.abs(target) < unit ? null : <span key={p}>{d}</span>;
        }
        return (
          <span key={p} className="odo-col" aria-hidden>
            <span className="odo-ghost">0</span>
            {/* A drum (like a slot-machine reel or the iOS picker wheel), its axis across the screen:
                as it turns, the digit in front rolls up and back into the screen, darkening, while
                the next rises from below and comes forward. */}
            <span className="odo-window">
              <span className="odo-drum">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                  // Where this digit sits relative to the front, the short way round (−5…5). Only the
                  // digit leaving and the one arriving are drawn.
                  const delta = ((((d - pos) % 10) + 15) % 10) - 5;
                  if (Math.abs(delta) >= 1) return null;
                  const angle = -delta * STEP_DEG;
                  // Fades all the way out as it turns away (gone exactly when it stops being drawn).
                  const fade = 1 - Math.abs(delta);
                  return (
                    <span key={d} className="odo-face" style={{ transform: `rotateX(${angle}deg) translateZ(var(--odo-r))`, opacity: fade * fade }}>
                      {d === 0 && blankZero ? '\u00a0' : d}
                    </span>
                  );
                })}
              </span>
            </span>
          </span>
        );
      })}
      {suffix}
    </span>
  );
}

function Ring({ c: [cx, cy], r, w, value: raw, target, colors, glyph }: { c: [number, number]; r: number; w: number; value: number; target: number; colors: readonly [string, string]; glyph: RingGlyph }) {
  // The ring glides to a new value instead of jumping.
  const value = useTweened(raw);
  // Ids for the tip shadow's clip and blur (useId's punctuation isn't safe inside url(#…)).
  const uid = `r${useId().replace(/[^\w-]/g, '')}`;
  const p = target > 0 ? Math.max(0, value / target) : 0;

  // Everything below is a continuous function of p, so the ring animates smoothly through any
  // value, 100% included: no modes that switch on at a threshold (an earlier "closed loop" mode
  // between 100% and 104% made rings jump in color and pop a tip in as they animated past it).
  //
  // The first lap runs to `end`; past the goal a second lap runs to `over` (one extra lap at most).
  const end = Math.min(p, 1) * 360;
  const over = Math.min(Math.max(p - 1, 0), 1) * 360;
  const past = p >= 1;
  // Shading runs start → end color along the whole drawn length (both laps past the goal), so the
  // tip is always the end color and the second lap picks up where the first left off.
  const total = past ? 360 + over : 360;
  const shade = (a: number) => mixColor(colors[0], colors[1], Math.min(1, Math.max(0, a / total)));
  // `base` is how far round the ring this lap starts (360 for the second lap).
  const lap = (from: number, to: number, key: string, base = 0) => {
    // Short arcs with butt ends, each in its own shade, overlapping a hair so no seams show.
    const n = Math.max(2, Math.ceil((to - from) / 3));
    const step = (to - from) / n;
    return Array.from({ length: n }, (_, i) => {
      const a0 = from + i * step;
      const a1 = Math.min(to, a0 + step + 0.8);
      const [x0, y0] = onRing(cx, cy, r, a0);
      const [x1, y1] = onRing(cx, cy, r, a1);
      return (
        <path
          key={`${key}${i}`}
          d={`M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`}
          fill="none"
          stroke={shade(base + (a0 + a1) / 2)}
          strokeWidth={w}
        />
      );
    });
  };

  // The leading tip: the first lap's end, or the second lap's past the goal (the same point at 100%).
  const lead = past ? over : end;
  const [lx, ly] = onRing(cx, cy, r, lead);
  const [sx, sy] = onRing(cx, cy, r, 0);
  // Its shadow falls ahead along the ring, onto the start it's catching up with: it fades in over
  // the last 30° before the goal (the tip only overlaps the start cap from there) and stays past
  // it. Clipped to the half ahead of the tip and to the ring's band, so it never rims the tip's
  // trailing half (which would outline it as a disc) or spills onto the card or the next ring.
  const shadow = past ? 1 : Math.min(1, Math.max(0, (end - 330) / 30));
  const tx = Math.cos((lead * Math.PI) / 180);
  const ty = Math.sin((lead * Math.PI) / 180);
  const L = w * 3;
  const ahead = [
    [lx - ty * L, ly + tx * L],
    [lx - ty * L + tx * L, ly + tx * L + ty * L],
    [lx + ty * L + tx * L, ly - tx * L + ty * L],
    [lx + ty * L, ly - tx * L],
  ]
    .map((q) => q.join(','))
    .join(' ');
  const ro = r + w / 2;
  const ri = r - w / 2;
  const band = `M${cx - ro} ${cy}a${ro} ${ro} 0 1 0 ${2 * ro} 0a${ro} ${ro} 0 1 0 ${-2 * ro} 0ZM${cx - ri} ${cy}a${ri} ${ri} 0 1 0 ${2 * ri} 0a${ri} ${ri} 0 1 0 ${-2 * ri} 0Z`;

  // The glyph rides the leading tip (at 25% it sits at 3 o'clock); at the top while empty.
  const [gx, gy] = [lx, ly];
  const g = w * 0.22; // arrow half-size
  // On the tip, a deep shade of the ring's own color (pure black read as a hole); on an empty
  // track, the ring color itself so the glyph stays legible.
  // Near zero the filled part is just its two round caps on top of each other (a dot), so it fades
  // out over the last 3% instead of vanishing the moment it reaches 0 (and fades in from 0 the
  // same way). The glyph's ink follows, from the cap's deep shade to the track's color.
  const shown = Math.min(1, p / 0.03);
  const ink = mixColor(colors[0], '#000000', 0.62 * shown);
  const inkOpacity = 0.7 + 0.3 * shown;
  let glyphEl: ReactNode;
  if (glyph === 'arrow') {
    glyphEl = (
      <path
        d={`M${gx - g} ${gy}h${g * 2}m${-g * 0.85} ${-g * 0.85}l${g * 0.85} ${g * 0.85}l${-g * 0.85} ${g * 0.85}`}
        transform={`rotate(${lead} ${gx} ${gy})`}
        fill="none"
        stroke={ink}
        strokeOpacity={inkOpacity}
        strokeWidth={w * 0.12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else {
    // The symbol fits a box 60% of the ring's width, centered on the leading tip.
    const sym = SF[glyph];
    const k = (w * 0.6) / Math.max(sym.w, sym.h);
    glyphEl = (
      <path
        d={sym.d}
        fill={ink}
        fillOpacity={inkOpacity}
        fillRule={sym.e ? 'evenodd' : 'nonzero'}
        transform={`translate(${gx - (sym.w * k) / 2} ${gy - (sym.h * k) / 2}) scale(${k})`}
      />
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={colors[0]} strokeOpacity="0.15" strokeWidth={w} />
      {p > 0 && (
        // Fades in over a moment when it appears (from zero), and out over the last 3% on the
        // way back to zero.
        <g opacity={shown} className="ring-fill">
          {lap(0, end, 'a')}
          {/* The start's round cap, only under the goal: once the ring has come all the way round,
              the first lap's end is behind it, and a start-colored disc there would show as a flat-
              edged half disc. (The tip covers that spot at exactly 100%.) */}
          {!past && <circle cx={sx} cy={sy} r={w / 2} fill={colors[0]} />}
          {/* The second lap, drawn over the first. It starts a little before 12 o'clock so its square
              start overlaps the first lap's end (same shade there) instead of meeting it edge to edge. */}
          {past && over > 0 && lap(-2, over, 'b', 360)}
          {shadow > 0 && (
            <>
              <defs>
                <clipPath id={`${uid}b`}>
                  <path d={band} clipRule="evenodd" />
                </clipPath>
                <clipPath id={`${uid}a`}>
                  <polygon points={ahead} />
                </clipPath>
                <filter id={`${uid}s`} x="-1" y="-1" width="3" height="3">
                  <feGaussianBlur stdDeviation={w * 0.14} />
                </filter>
              </defs>
              <g clipPath={`url(#${uid}b)`}>
                <g clipPath={`url(#${uid}a)`}>
                  <circle cx={lx + tx * w * 0.1} cy={ly + ty * w * 0.1} r={w / 2} fill="#000" fillOpacity={0.6 * shadow} filter={`url(#${uid}s)`} />
                </g>
              </g>
            </>
          )}
          {/* The tip on top, in the lap's color at that point, so its trailing half melts into the
              stroke and only the rounded front shows. */}
          <circle cx={lx} cy={ly} r={w / 2} fill={shade(past ? total : end)} />
        </g>
      )}
      {glyphEl}
    </g>
  );
}

/** "Move" over "41/170CAL": white label, then the value in the ring's color in SF Rounded with a small uppercase unit. */
function RingValue({ label, value, target, unit, color, big, info }: { label: string; value: number; target: number; unit: string; color: string; big?: boolean; info?: string }) {
  const hold = useHoldInfo(label, info);
  return (
    <div className={`ring-value ${big ? 'is-big' : ''}`} {...hold}>
      <div className="ring-value-label">{label}</div>
      <div className="ring-value-num" style={{ color }}>
        {fmt(value)}/{fmt(target)}
        <small>{unit}</small>
      </div>
    </div>
  );
}

/** A single large Fitness ring on its own, sized by the page (Water). */
export function BigRing(props: { value: number; target: number; colors: readonly [string, string]; w?: number }) {
  const w = props.w ?? 44;
  return (
    <svg viewBox="0 0 220 220" className="big-ring" aria-hidden>
      <Ring c={[110, 110]} r={110 - w / 2} w={w} value={props.value} target={props.target} colors={props.colors} glyph="drop.fill" />
    </svg>
  );
}

/** A single Fitness ring on its own (Today's Sleep card). */
export function SingleRing(props: { value: number; target: number; colors: readonly [string, string]; glyph: SFName; className?: string }) {
  return (
    <svg viewBox="0 0 110 110" className={props.className} aria-hidden>
      <Ring c={[55, 55]} r={44} w={22} value={props.value} target={props.target} colors={props.colors} glyph={props.glyph} />
    </svg>
  );
}

/** One goal as a single Fitness ring with its value beside it (Water). */
export function GoalRing(props: { label: string; value: number; target: number; unit: string; color: string; gradient?: readonly [string, string] }) {
  return (
    <div className="ring-card">
      <svg viewBox="0 0 110 110" className="ring-art" aria-hidden>
        <Ring c={[55, 55]} r={44} w={22} value={props.value} target={props.target} colors={props.gradient ?? [props.color, props.color]} glyph="arrow" />
      </svg>
      <div className="ring-legend">
        <RingValue label={props.label} value={props.value} target={props.target} unit={props.unit} color={props.color} big />
      </div>
    </div>
  );
}

/**
 * A Fitness summary card: title top-left, an optional trailing control, then the content; the
 * whole card taps through when it has somewhere to go. Measured from Fitness (iOS 27):
 * 16pt padding, 17pt semibold title, 26pt corners, 12pt between cards.
 */
export function FitCard(props: { title: ReactNode; onOpen?: () => void; trailing?: ReactNode; children: ReactNode; className?: string; bare?: boolean }) {
  const open = props.onOpen;
  return (
    <section
      className={`fit-card ${open ? 'is-link' : ''} ${props.bare ? 'is-bare' : ''} ${props.className ?? ''}`}
      onClick={open}
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      // Bare cards (Today) show no title; it's still their accessible name.
      aria-label={props.bare && typeof props.title === 'string' ? props.title : undefined}
    >
      {!props.bare && <header className="fit-card-head">
        <h2 className="fit-card-title">{props.title}</h2>
        <span className="flex items-center gap-2">
          {/* Controls in the header act on their own instead of opening the card. */}
          {props.trailing && <span onClick={(e) => e.stopPropagation()}>{props.trailing}</span>}
        </span>
      </header>}
      {props.children}
    </section>
  );
}

/**
 * A workout card in Fitness's style (its Outdoor Walk card): the card tinted with the workout's
 * color, a large glyph and a round play button on top, a bold one-line title, then a row of
 * small tinted tiles with one short fact each. Measured from Fitness (iOS 27).
 */
export function WorkoutCard(props: {
  title: string;
  glyph: SFName;
  color: string;
  tiles?: { icon?: SFName; text: string }[];
  onPlay?: () => void;
  done?: boolean;
  onOpen?: () => void;
}) {
  const style = { '--tint': props.color } as CSSProperties;
  return (
    <section className={`wk-card ${props.onOpen ? 'is-link' : ''}`} style={style} onClick={props.onOpen} role={props.onOpen ? 'button' : undefined}>
      <div className="wk-top">
        <span className="wk-glyph">
          <Sym name={props.glyph} size={30} />
        </span>
        {props.done ? (
          <span className="wk-play is-done" role="img" aria-label="Done">
            <Sym name="checkmark.bold" size={17} />
          </span>
        ) : (
          props.onPlay && (
            <button
              type="button"
              aria-label={`Start ${props.title}`}
              className="wk-play"
              onClick={(e) => {
                e.stopPropagation();
                props.onPlay?.();
              }}
            >
              <Sym name="play.fill" size={17} />
            </button>
          )
        )}
      </div>
      <h2 className="wk-title">{props.title}</h2>
      {props.tiles && props.tiles.length > 0 && (
        <div className="wk-tiles" style={{ gridTemplateColumns: `repeat(${props.tiles.length}, minmax(0, 1fr))` }}>
          {props.tiles.map((t) => (
            <span key={t.text} className="wk-tile">
              {t.icon && <Sym name={t.icon} size={14} />}
              <span className="truncate">{t.text}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** "Today" over "991" in the card's color: Fitness's stat, value in SF Rounded with small caps units. */
export function FitStat(props: { label?: string; value: ReactNode | null; unit?: string; color: string; sub?: ReactNode; small?: boolean; info?: string; infoTitle?: string }) {
  const hold = useHoldInfo(props.infoTitle ?? props.label, props.info);
  // No value yet: a gray dash in the value's place, the same everywhere in the app.
  const empty = props.value === null;
  // In a Today square or wide card the value is as large as fits: start at the CSS size and step down only
  // if it would be clipped (185.4 lb, 10h 45m).
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.closest('.is-squares, .is-rect')) return;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 24) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
  }, [props.value, props.unit]);
  return (
    <div className={`fit-stat ${props.small ? 'is-small' : ''}`} {...hold}>
      {props.label && <div className="fit-stat-label">{props.label}</div>}
      <div ref={ref} className="fit-stat-value" style={{ color: empty ? '#8d8d93' : props.color }}>
        {empty ? '—' : props.value}
        {!empty && props.unit && <small>{props.unit}</small>}
      </div>
      {props.sub && <div className="fit-stat-sub">{props.sub}</div>}
    </div>
  );
}

/**
 * Keeps a row of stat values whole: if any would be cut off (a long number with its unit), the
 * whole row steps down a size together, so the values stay the same size as each other and none
 * ends in "…". Watches the row's width, so it holds on any screen.
 */
export function useFitRow(ref: React.RefObject<HTMLElement | null>, key: unknown, min = 14) {
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const fit = () => {
      const values = [...row.querySelectorAll<HTMLElement>('.fit-stat-value')];
      values.forEach((v) => (v.style.fontSize = ''));
      if (!values.length) return;
      let size = parseFloat(getComputedStyle(values[0]).fontSize);
      const overflowing = () => values.some((v) => v.scrollWidth > v.clientWidth + 0.5);
      while (overflowing() && size > min) {
        size -= 1;
        values.forEach((v) => (v.style.fontSize = `${size}px`));
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(row);
    return () => watch.disconnect();
  }, [ref, key, min]);
}

/** Text that steps its font size down (to `min`) when it would otherwise overflow its box. */
export function FitText({ className, style, children, min = 12 }: { className?: string; style?: CSSProperties; children: ReactNode; min?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 0.5 && size > min) el.style.fontSize = `${(size -= 1)}px`;
  });
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/** Just the four macro rings, filling their box (Today's Food square). */
export function MacroRings({ totals, settings }: { totals: Macros; settings: Settings }) {
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const rows: [number, number, readonly [string, string], RingGlyph][] = [
    [totals.kcal, settings.kcalTarget, RING_GRADIENT.move, 'flame.fill'],
    [totals.protein, settings.proteinTarget, RING_GRADIENT.exercise, 'frying.pan.fill'],
    [totals.carbs, carbs, RING_GRADIENT.carbs, 'carrot.fill'],
    [totals.fat, settings.fatTarget, RING_GRADIENT.steps, 'circle.hexagongrid.fill'],
  ];
  const R = 70;
  const W = R * 0.19;
  const GAP = R * 0.017;
  return (
    <svg viewBox={`0 0 ${R * 2} ${R * 2}`} className="macro-rings-sq" aria-hidden>
      {rows.map(([v, t, grad, glyph], i) => (
        <Ring key={i} c={[R, R]} r={R - W / 2 - i * (W + GAP)} w={W} value={v} target={t} colors={grad} glyph={glyph} />
      ))}
    </svg>
  );
}

/** One ring in a summary: its legend line and its arc. */
export interface RingRow {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  gradient: readonly [string, string];
  glyph: RingGlyph;
  /** What touching and holding its legend line explains. */
  info?: string;
}

/**
 * Concentric Fitness rings, each labeled beside them like Move, Exercise and Stand. Apple's three
 * rings measure stroke 23% of the outer radius, gaps 2%, hole 25%; four keep the same
 * stroke-to-gap ratio at stroke 19%, gap 1.7%. (Thinner with wider gaps was tried and rejected.)
 */
export function RingSummary({ rows }: { rows: RingRow[] }) {
  const R = 70;
  const W = R * (rows.length > 3 ? 0.19 : 0.23);
  const GAP = R * (rows.length > 3 ? 0.017 : 0.02);
  return (
    <div className="ring-card is-multi">
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} className="ring-art" aria-hidden>
        {rows.map((r, i) => (
          <Ring key={r.label} c={[R, R]} r={R - W / 2 - i * (W + GAP)} w={W} value={r.value} target={r.target} colors={r.gradient} glyph={r.glyph} />
        ))}
      </svg>
      <div className="ring-legend">
        {rows.map((r) => (
          <RingValue key={r.label} label={r.label} value={r.value} target={r.target} unit={r.unit} color={r.color} info={r.info} />
        ))}
      </div>
    </div>
  );
}

/** Calories and macros as concentric Fitness rings (the Food tab). */
export function MacroSummary({ totals, settings }: { totals: Macros; settings: Settings }) {
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  return (
    <RingSummary
      rows={[
        { label: 'Calories', value: totals.kcal, target: settings.kcalTarget, unit: 'KCAL', color: FITNESS.move, gradient: RING_GRADIENT.move, glyph: 'flame.fill' },
        { label: 'Protein', value: totals.protein, target: settings.proteinTarget, unit: 'G', color: FITNESS.exercise, gradient: RING_GRADIENT.exercise, glyph: 'frying.pan.fill' },
        { label: 'Carbs', value: totals.carbs, target: carbs, unit: 'G', color: FITNESS.carbs, gradient: RING_GRADIENT.carbs, glyph: 'carrot.fill' },
        { label: 'Fat', value: totals.fat, target: settings.fatTarget, unit: 'G', color: FITNESS.steps, gradient: RING_GRADIENT.steps, glyph: 'circle.hexagongrid.fill' },
      ]}
    />
  );
}

/** Small numeric input used in set rows. */
export function NumField(props: {
  value: string;
  onChange: (v: string) => void;
  width?: string;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <input
      aria-label={props.label}
      inputMode="decimal"
      type="text"
      readOnly={props.disabled}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value.replace(/[^\d.]/g, ''))}
      onFocus={(e) => !props.disabled && e.target.select()}
      className={`tabular h-9 rounded-lg px-2 text-center outline-none placeholder:text-[rgba(235,235,245,0.3)] focus:ring-2 focus:ring-accent/60 ${props.disabled ? 'bg-transparent font-semibold' : 'bg-[rgba(118,118,128,0.24)]'} ${props.width ?? 'w-16'}`}
    />
  );
}

/** Gray footnote under a list. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  // Footnote, as in Settings: 15pt secondary label, aligned with row text, 10pt under the card.
  return <p className={`mx-8 mt-1.5 text-[15px] leading-[20px] text-[#8d8d93] ${className ?? ''}`}>{children}</p>;
}

/** iOS bottom sheet (Konsta Sheet) with a grabber. */
export function GlassSheet({ opened, onClose, children }: { opened: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="pb-[calc(var(--k-safe-area-bottom,0px)+12px)] pt-2">
      <div aria-hidden="true" className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-white/30" />
      {children}
    </Sheet>
  );
}

/** Full-height modal sheet (Konsta Popup) with a navigation bar and a close button. */
export function SheetPage({ opened, onClose, title, children, closeLabel = 'Cancel' }: { opened: boolean; onClose: () => void; title: string; children: ReactNode; closeLabel?: string }) {
  return (
    <Popup opened={opened} onBackdropClick={onClose}>
      {/* A sheet isn't a pushed screen, even when opened from one: its bar has no Back (which
          would pop the screen underneath), only its own Cancel or Done. */}
      <InStack.Provider value={false}>
        <Page className="pb-[calc(var(--k-safe-area-bottom,0px)+16px)]">
          <Header title={title} right={<NavText onClick={onClose}>{closeLabel}</NavText>} />
          {children}
        </Page>
      </InStack.Provider>
    </Popup>
  );
}

/**
 * iOS alert with a number field (like UIAlertController with a text field):
 * title, short message, the field with its unit, then Cancel / Save.
 */
/** Units a prompt can enter a value in, by the unit it's stored in: factor from the stored unit, and decimals. */
const UNITS: Record<string, { unit: string; per: number; digits: number }[]> = {
  oz: [
    { unit: 'oz', per: 1, digits: 1 },
    { unit: 'ml', per: 29.5735, digits: 0 },
    { unit: 'L', per: 0.0295735, digits: 2 },
    { unit: 'cups', per: 0.125, digits: 2 },
    { unit: 'gal', per: 0.0078125, digits: 2 },
  ],
  lb: [
    { unit: 'lb', per: 1, digits: 1 },
    { unit: 'kg', per: 0.45359237, digits: 1 },
  ],
  in: [
    { unit: 'in', per: 1, digits: 2 },
    { unit: 'cm', per: 2.54, digits: 1 },
  ],
};
const unitKey = (u: string) => `zoro.unit.${u}`;
function readUnit(base: string) {
  try {
    const saved = localStorage.getItem(unitKey(base));
    return UNITS[base]?.find((u) => u.unit === saved) ?? (saved === 'alt' ? UNITS[base]?.[1] : undefined);
  } catch {
    return undefined;
  }
}

/**
 * Asks for one number. Where the stored unit has others (oz: ml, L, cups, gal; lb: kg; in: cm),
 * tapping the unit opens a menu of them; the value is converted back to the stored unit on save,
 * and the choice is remembered for next time.
 */
export function NumberPrompt(props: {
  opened: boolean;
  title: string;
  message?: string;
  unit: string;
  initial?: string;
  onCancel: () => void;
  onSave: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [v, setV] = useState('');
  const options = UNITS[props.unit];
  const [chosen, setChosen] = useState(() => readUnit(props.unit) ?? options?.[0]);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const k = chosen?.per ?? 1;
  const shownUnit = chosen?.unit ?? props.unit;
  const n = parseFloat(v);
  const valid = Number.isFinite(n) && n >= (props.min ?? 0.01) * k && n <= (props.max ?? 10000) * k;
  const round = (x: number, d: number) => String(Math.round(x * 10 ** d) / 10 ** d);
  const initial = props.initial && chosen && k !== 1 ? round(parseFloat(props.initial) * k, chosen.digits) : props.initial;
  const save = () => {
    props.onSave(n / k);
    setV('');
  };
  const pick = (next: (typeof options)[number]) => {
    // Carry a typed value across so switching converts it instead of reinterpreting it.
    if (Number.isFinite(n)) setV(round((n / k) * next.per, next.digits));
    setChosen(next);
    try {
      localStorage.setItem(unitKey(props.unit), next.unit);
    } catch {
      /* remembered for this session only */
    }
  };
  return (
    <Dialog
      opened={props.opened}
      title={props.title}
      content={
        <div className="space-y-3">
          {props.message && <div>{props.message}</div>}
          <label className="flex items-center gap-2 rounded-xl bg-[rgba(118,118,128,0.24)] pl-3 pr-1">
            <input
              autoFocus
              inputMode="decimal"
              value={v}
              placeholder={initial ?? ''}
              onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && valid && save()}
              className="tabular min-w-0 flex-1 bg-transparent py-2.5 text-[17px] text-white outline-none placeholder:text-[rgba(235,235,245,0.3)]"
            />
            {options ? (
              <button
                type="button"
                className="unit-switch"
                onClick={(e) => {
                  e.preventDefault();
                  setMenu(e.currentTarget.getBoundingClientRect());
                }}
                aria-label={`Units: ${shownUnit}`}
              >
                {shownUnit}
                <Sym name="chevron.up.chevron.down" size={11} />
              </button>
            ) : (
              <span className="pr-2 text-[17px] text-[rgba(235,235,245,0.6)]">{props.unit}</span>
            )}
          </label>
          {options && (
            <PullDownMenu
              anchor={menu}
              onClose={() => setMenu(null)}
              items={options.map((o) => ({
                label: o.unit,
                icon: o.unit === shownUnit ? <Sym name="checkmark" size={15} /> : undefined,
                onClick: () => pick(o),
              }))}
            />
          )}
        </div>
      }
      buttons={
        <>
          <DialogButton
            onClick={() => {
              setV('');
              props.onCancel();
            }}
          >
            Cancel
          </DialogButton>
          <DialogButton strong disabled={!valid} onClick={save}>
            Save
          </DialogButton>
        </>
      }
    />
  );
}

// ---------- Toasts ----------

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Mounted only while showing, so a hidden toast never sits over the page. */}
      {msg && (
        <Toast position="center" opened className="!bottom-[calc(var(--k-safe-area-bottom)+76px)]">
          <span className="shrink">{msg}</span>
        </Toast>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Touch and hold to explain ----------

const InfoContext = createContext<(title: string, text: string) => void>(() => {});

/** An alert (title, a few plain sentences, OK) that explains whatever was held. */
export function InfoProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<{ title: string; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((title: string, text: string) => {
    setInfo({ title, text });
    setOpen(true);
  }, []);
  return (
    <InfoContext.Provider value={show}>
      {children}
      <Dialog
        opened={open}
        onBackdropClick={() => setOpen(false)}
        title={info?.title}
        content={info?.text}
        buttons={
          <DialogButton strong onClick={() => setOpen(false)}>
            OK
          </DialogButton>
        }
      />
    </InfoContext.Provider>
  );
}

export const useInfo = () => useContext(InfoContext);

/**
 * Touch and hold (about half a second) to explain something: shows `text` under `title` in an
 * alert. A quick tap still does whatever a tap does there (editing a goal, opening a card).
 */
export function useHoldInfo(title: string | undefined, text: string | undefined) {
  const show = useInfo();
  const timer = useRef<number | undefined>(undefined);
  const from = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  if (!text || !title) return {};
  const cancel = () => window.clearTimeout(timer.current);
  return {
    'data-info': '',
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      from.current = [e.clientX, e.clientY];
      cancel();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        show(title, text);
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      // Scrolling or dragging isn't holding.
      if (from.current && Math.hypot(e.clientX - from.current[0], e.clientY - from.current[1]) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // The tap that ends a hold doesn't also count as a tap.
    onClickCapture: (e: React.MouseEvent) => {
      if (!fired.current) return;
      e.stopPropagation();
      e.preventDefault();
      fired.current = false;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
