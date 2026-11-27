import { Sym } from './Sym';
import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MENU_CLOSE, MENU_CLOSE_CONTENT, MENU_CLOSE_MS, MENU_OPEN, MENU_OPEN_MS, menuFrame } from './appleMotion';
import { InStack, useNav } from './nav';
import './bars.css';

/**
 * Navigation chrome drawn to match iOS 26 directly (no Konsta): the floating tab bar,
 * the navigation bar, its round glass buttons, the search field and the segmented control.
 * Styles live in index.css under "iOS bars".
 */

// ---------- Tab bar ----------

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/** Floating glass tab bar with a selection pill that slides between tabs. Icons only. */
export function TabBar<T extends string>({ tabs, active, onSelect }: { tabs: TabItem<T>[]; active: T; onSelect: (id: T) => void }) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === active));
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const release = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  return (
    <nav className="ios-tabbar" aria-label="Tabs">
      <div
        className="ios-tabbar-capsule ios-glass"
        style={{ '--count': tabs.length, '--index': index } as CSSProperties}
        onPointerDown={() => {
          window.clearTimeout(timer.current);
          // Only a real long press magnifies the selection, like iOS.
          timer.current = window.setTimeout(() => setHolding(true), 450);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <span className={`ios-tabbar-pill ${holding ? 'is-holding' : ''}`} aria-hidden />
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-current={t.id === active ? 'page' : undefined}
            className={`ios-tabbar-item ${t.id === active ? 'is-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---------- Navigation bar ----------

/** iOS navigation bar: 44pt row, centered 17pt semibold title, round glass buttons, optional row below. */
export function NavBar(props: { title: ReactNode; onBack?: () => void; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  // A tab's screen pushed from a card gets Back too (next to its own left button, if any).
  const inStack = useContext(InStack);
  const { pop } = useNav();
  const onBack = props.onBack ?? (inStack ? () => pop() : undefined);
  // Show the scroll-edge fade only while content is scrolled under the bar.
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const page = ref.current?.closest('.k-page');
    if (!page) return;
    const onScroll = () => setScrolled(page.scrollTop > 2);
    onScroll();
    page.addEventListener('scroll', onScroll, { passive: true });
    return () => page.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header ref={ref} className={`ios-navbar ${props.children ? 'has-sub' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="ios-navbar-row">
        <div className="ios-navbar-side">
          {onBack && (
            <NavButton label="Back" onClick={onBack}>
              <Sym name="chevron.left" size={17.5} />
            </NavButton>
          )}
          {props.left}
        </div>
        <h1 className="ios-navbar-title">{props.title}</h1>
        <div className="ios-navbar-side is-right">{props.right}</div>
      </div>
      {props.children && <div className="ios-navbar-sub">{props.children}</div>}
    </header>
  );
}

/** Round glass button for an icon in the navigation bar. */
export function NavButton(props: { label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={props.label} disabled={props.disabled} onClick={props.onClick} className="ios-navbtn ios-glass">
      {props.children}
    </button>
  );
}

/** Several icon buttons sharing one glass capsule, like iOS 26 groups bar buttons. */
export function NavButtonGroup({ items }: { items: { label: string; icon: ReactNode; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }[] }) {
  return (
    <div className="ios-navgroup ios-glass">
      {items.map((i) => (
        <button key={i.label} type="button" aria-label={i.label} className="ios-navgroup-btn" onClick={(e) => i.onClick(e)}>
          {i.icon}
        </button>
      ))}
    </div>
  );
}

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Starts a new group (a line above it). */
  group?: boolean;
  /** Red, for deleting. */
  danger?: boolean;
  /** Opens more choices (a chevron, as for a submenu). */
  submenu?: boolean;
  /** Leaves the menu up under what this opens (iOS's photo picker), until the parent closes it. */
  keepOpen?: boolean;
};

/**
 * Liquid Glass in layers, fitted in iOS Safari against UIKit's own glass over a test pattern
 * (bars.css, "Glass"): the blurred base, a sharper lens band along the edges, and the lit rim. They
 * are siblings of the content, never its parents: in Safari anything that clips, fades or filters
 * an element cuts the glass inside it off from the page behind.
 */
export function GlassLayers() {
  return (
    <>
      <span className="glass-base" aria-hidden />
      <span className="glass-lens" aria-hidden />
      <span className="glass-rim" aria-hidden />
    </>
  );
}

/** iOS 27 menu metrics, read from UIKit's own menu (_UIContextMenuView) in the iPhone 17 simulator. */
const MENU = { row: 42, pad: 10, sep: 21, title: 30, radius: 34, width: 250 };

/**
 * iOS 27 pull-down menu, measured from UIKit's: a Liquid Glass panel that grows out of the button
 * that opened it (covering it, corner to corner) as a blurred blob that sharpens into the list.
 * Rows are 42pt with the symbol on the left (centered 40pt in) and the label 64pt in; groups are
 * split by a thin line. Opened upward, the items run bottom-up so the first stays nearest the
 * button, as iOS does. Tapping outside closes it.
 */
export function PullDownMenu(props: {
  anchor: DOMRect | null;
  onClose: () => void;
  /** A small gray line at the top saying what the menu is for, as iOS context menus have. */
  title?: string;
  items: MenuItem[];
}) {
  // The last anchor stays while the menu animates away (also when the parent closes it).
  const [shown, setShown] = useState<DOMRect | null>(props.anchor);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // The glass button it grows out of, hidden while it's open: in iOS the button becomes the menu.
  const source = useRef<HTMLElement | null>(null);
  // The tap this menu last opened for. It opens again only for a new one: a render in between
  // closing and the parent letting go (same anchor) must not bring it back for a frame.
  const opened = useRef<DOMRect | null>(props.anchor);
  if (props.anchor && props.anchor !== opened.current) {
    opened.current = props.anchor;
    setShown(props.anchor);
    closing.current = false;
  }

  const a = shown;
  const seps = props.items.filter((i, k) => i.group && k > 0).length;
  const h = MENU.pad * 2 + props.items.length * MENU.row + seps * MENU.sep + (props.title ? MENU.title : 0);
  const up = !!a && a.top + h > window.innerHeight - 96 && a.bottom - h > 56;
  const right = !!a && a.left + a.width / 2 >= window.innerWidth / 2;
  const near = { x: right ? 'right' : 'left', y: up ? 'bottom' : 'top' } as const;
  const origin = `${up ? 'bottom' : 'top'} ${right ? 'right' : 'left'}`;

  /** The menu's shape over time, measured from UIKit (appleMotion): from a 24pt circle at the button. */
  const shapes = (rows: number[][], el: HTMLElement, total: number) => {
    const box = el.getBoundingClientRect();
    const to = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    const cx = a ? a.left + a.width / 2 : box.right - 22;
    const cy = a ? a.top + a.height / 2 : box.top + 22;
    const from = { left: cx - 12, top: cy - 12, right: cx + 12, bottom: cy + 12 };
    const frames = rows.map((row) => ({ offset: Math.min(1, row[0] / total), ...menuFrame(row, from, to, near, MENU.radius) }));
    // Hold the last measured frame to the end: keyframes that stop short of 100% would let the
    // browser animate back to the resting menu in the gap, flashing it as it goes.
    const last = frames[frames.length - 1];
    if (last.offset < 1) frames.push({ ...last, offset: 1 });
    return frames;
  };

  // Open: the glass grows out of the button along UIKit's own curves (far edge shooting past, near
  // edge swinging back), each layer clipped to the shape and the menu moved and scaled where the
  // shape pokes out of it. The rows come into focus as the glass reaches them.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || !props.anchor) return;
    const x = props.anchor.left + props.anchor.width / 2;
    const y = props.anchor.top + props.anchor.height / 2;
    const btn = document.elementsFromPoint(x, y).find((e) => !e.closest('.ios-menu-scrim'))?.closest<HTMLElement>('.ios-navbtn');
    if (btn) {
      btn.style.visibility = 'hidden';
      source.current = btn;
    }
    const frames = shapes([[0, 0, 0, 0, 0], ...MENU_OPEN], el, MENU_OPEN_MS);
    const timing = { duration: MENU_OPEN_MS, easing: 'linear' };
    el.animate(frames.map((f) => ({ offset: f.offset, transform: f.transform, transformOrigin: '0 0' })), timing);
    for (const layer of el.children) (layer as HTMLElement).animate(frames.map((f) => ({ offset: f.offset, clipPath: f.clipPath })), timing);
    el.querySelector('.ios-menu-body')?.animate([{ filter: 'blur(6px)' }, { filter: 'blur(0px)', offset: 0.35 }, { filter: 'blur(0px)' }], timing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.anchor]);

  const close = (then?: () => void) => {
    const el = panel.current;
    if (closing.current) return;
    closing.current = true;
    then?.();
    const done = () => {
      if (source.current) source.current.style.visibility = '';
      source.current = null;
      setShown(null);
      closing.current = false;
      if (props.anchor) props.onClose();
    };
    if (!el) return done();
    // Close: the glass lifts a little and shrinks back into the button; the rows shrink toward
    // the button and fade well before it gets there (UIKit's curves, appleMotion).
    const frames = shapes([[0, 1, 1, 1, 1], ...MENU_CLOSE], el, MENU_CLOSE_MS);
    const timing = { duration: MENU_CLOSE_MS, easing: 'linear', fill: 'forwards' as const };
    el.animate(frames.map((f) => ({ offset: f.offset, transform: f.transform, transformOrigin: '0 0' })), timing);
    let last: Animation | undefined;
    for (const layer of el.children) {
      const glass = !(layer as HTMLElement).classList.contains('ios-menu-body');
      // The glass fades as it becomes the button again, which comes back under it.
      last = (layer as HTMLElement).animate(
        frames.map((f) => ({ offset: f.offset, clipPath: f.clipPath, ...(glass ? { opacity: f.offset < 0.55 ? 1 : Math.max(0, 1 - (f.offset - 0.55) / 0.45) } : {}) })),
        timing,
      );
    }
    const box = el.getBoundingClientRect();
    const ox = a ? a.left + a.width / 2 - box.left : box.width;
    const oy = a ? a.top + a.height / 2 - box.top : 0;
    el.querySelector('.ios-menu-body')?.animate(
      [
        { offset: 0, opacity: 1, transform: 'scale(1)' },
        ...MENU_CLOSE_CONTENT.map(([ms, o, sc]) => ({ offset: ms / MENU_CLOSE_MS, opacity: o, transform: `scale(${sc})` })),
        // Gone for the rest of the close (UIKit's rows are out well before the glass).
        { offset: 1, opacity: 0, transform: `scale(${MENU_CLOSE_CONTENT[MENU_CLOSE_CONTENT.length - 1][2]})` },
      ].map((f) => ({ ...f, transformOrigin: `${ox}px ${oy}px` })),
      timing,
    );
    if (source.current) {
      source.current.style.visibility = '';
      source.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: MENU_CLOSE_MS, easing: 'linear' });
    }
    if (last) last.onfinish = done;
    else done();
  };
  // The parent closed it (say, the photo picker it opened was done): animate away too.
  useEffect(() => {
    if (!props.anchor && shown && !closing.current) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.anchor]);

  if (!a) return null;
  const items = up ? [...props.items].reverse() : props.items;
  // Reversed, a group's line belongs above the item after the one that started it.
  const lineAbove = (k: number) => (up ? k > 0 && !!items[k - 1].group : k > 0 && !!items[k].group);
  const place: CSSProperties = {
    ...(up ? { bottom: window.innerHeight - a.bottom } : { top: a.top }),
    ...(right ? { right: Math.max(16, window.innerWidth - a.right) } : { left: Math.max(16, a.left) }),
    transformOrigin: origin,
  };

  // Portaled to <body>: inside a dialog (or any transformed box) a fixed menu would be placed
  // relative to that box and clipped by it.
  return createPortal(
    <div className="ios-menu-scrim" onClick={() => close()}>
      <div ref={panel} className="ios-menu" role="menu" style={place} onClick={(e) => e.stopPropagation()}>
        <GlassLayers />
        <div className="ios-menu-body">
          {props.title && <div className="ios-menu-title">{props.title}</div>}
          {items.map((i, k) => (
            <Fragment key={i.label}>
              {lineAbove(k) && <div className="ios-menu-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`ios-menu-item ${i.danger ? 'is-danger' : ''}`}
                // Kept open under what it opens (iOS's photo picker), at full strength: Safari
                // never says when that picker is dismissed, so a dimmed menu would stay dimmed.
                onClick={() => (i.keepOpen ? i.onClick() : close(i.onClick))}
              >
                <span className="ios-menu-icon">{i.icon}</span>
                <span className="ios-menu-label">{i.label}</span>
                {i.submenu && <Sym name="chevron.right" size={11.5} className="ios-menu-chevron" />}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Text button in a glass capsule (Done, Cancel, Finish). `strong` makes it the blue prominent one. */
export function NavTextButton(props: { onClick?: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <button type="button" onClick={props.onClick} className={`ios-navbtn is-text ${props.strong ? 'is-prominent' : 'ios-glass'}`}>
      {props.children}
    </button>
  );
}

// ---------- Search field ----------

/** iOS search field: capsule, magnifier, clear button, and Cancel while editing. */
export function SearchField(props: { value: string; onChange: (v: string) => void; onSubmit?: () => void; onCancel?: () => void; placeholder?: string; inputMode?: 'search' | 'numeric'; autoFocus?: boolean }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="ios-search"
      onSubmit={(e) => {
        e.preventDefault();
        input.current?.blur();
        props.onSubmit?.();
      }}
    >
      <label className="ios-search-field">
        <Sym name="magnifyingglass" size={14} className="text-[var(--ios-label-2)]" />
        <input
          ref={input}
          type="search"
          inputMode={props.inputMode}
          autoFocus={props.autoFocus}
          enterKeyHint="search"
          value={props.value}
          placeholder={props.placeholder ?? 'Search'}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => props.onChange(e.target.value)}
        />
        {props.value && (
          <button type="button" aria-label="Clear" className="ios-search-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onChange('')}>
            <Sym name="xmark.circle.fill" size={14} />
          </button>
        )}
      </label>
      {(editing || props.value) && (
        <button
          type="button"
          className="ios-search-cancel"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            props.onChange('');
            input.current?.blur();
            props.onCancel?.();
          }}
        >
          Cancel
        </button>
      )}
    </form>
  );
}

// ---------- Segmented control ----------

/** iOS segmented control: gray track, a lighter selected capsule that slides between segments. */
export function SegmentedControl<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  const index = Math.max(0, props.options.findIndex(([v]) => v === props.value));
  const [ready, setReady] = useState(false);
  // Skip the slide on first paint so it doesn't animate in from the left.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      role="tablist"
      className={`ios-segmented ${ready ? 'is-ready' : ''} ${props.className ?? ''}`}
      style={{ '--count': props.options.length, '--index': index } as CSSProperties}
    >
      <span className="ios-segmented-thumb" aria-hidden />
      {props.options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          role="tab"
          aria-selected={v === props.value}
          className={`ios-segmented-item ${v === props.value ? 'is-active' : ''}`}
          onClick={() => props.onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
