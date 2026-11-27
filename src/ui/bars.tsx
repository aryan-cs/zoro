import { Sym } from './Sym';
import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

/** One of Apple's springs from index.css ("820ms linear(…)"), split for the Web Animations API. */
function spring(name: string, fallbackMs: number): { duration: number; easing: string } {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = v.match(/^([\d.]+)ms\s+(.+)$/);
  return m ? { duration: Number(m[1]), easing: m[2] } : { duration: fallbackMs, easing: 'ease-out' };
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
  const [held, setHeld] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // The glass button it grows out of, hidden while it's open: in iOS the button becomes the menu.
  const source = useRef<HTMLElement | null>(null);
  if (props.anchor && props.anchor !== shown) {
    setShown(props.anchor);
    setHeld(false);
    closing.current = false;
  }

  const a = shown;
  const seps = props.items.filter((i, k) => i.group && k > 0).length;
  const h = MENU.pad * 2 + props.items.length * MENU.row + seps * MENU.sep + (props.title ? MENU.title : 0);
  const up = !!a && a.top + h > window.innerHeight - 96 && a.bottom - h > 56;
  const right = !!a && a.left + a.width / 2 >= window.innerWidth / 2;
  // Where the button sits inside the menu, so the glass can grow out of exactly it.
  const bw = a ? Math.min(a.width, MENU.width) : 44;
  const bh = a ? Math.min(a.height, 48) : 44;
  const from = `inset(${up ? `calc(100% - ${bh}px)` : '0px'} ${right ? '0px' : `calc(100% - ${bw}px)`} ${up ? '0px' : `calc(100% - ${bh}px)`} ${right ? `calc(100% - ${bw}px)` : '0px'} round ${Math.min(bw, bh) / 2}px)`;
  // Its full size, plus room for the shadow (the clip's corners stay outside the glass's own).
  const to = `inset(-40px round ${MENU.radius + 40}px)`;
  const origin = `${up ? 'bottom' : 'top'} ${right ? 'right' : 'left'}`;

  // Open: the glass grows from the button on Apple's bouncy spring; the rows start blurred and
  // small and come into focus a little behind it.
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
    const s = spring('--spring-bouncy', 820);
    const grow = { ...s, duration: s.duration * 0.75 };
    // Each layer is clipped on its own (a clip on the menu would cut its glass off from the page).
    for (const layer of el.children) (layer as HTMLElement).animate([{ clipPath: from }, { clipPath: to }], grow);
    el.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], grow);
    el.querySelector('.ios-menu-body')?.animate(
      [
        { filter: 'blur(8px)', opacity: 0, transform: 'scale(0.85)' },
        { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.anchor]);

  const close = (then?: () => void) => {
    const el = panel.current;
    if (closing.current) return;
    closing.current = true;
    then?.();
    // Back into the button: the reverse, quicker and without the bounce.
    el?.querySelector('.ios-menu-body')?.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(6px)', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    let anim: Animation | undefined;
    for (const layer of el?.children ?? []) anim = (layer as HTMLElement).animate([{ clipPath: to, opacity: 1 }, { clipPath: from, opacity: 0 }], { duration: MENU_CLOSE_MS, easing: 'cubic-bezier(0.4, 0, 0.7, 1)', fill: 'forwards' });
    const done = () => {
      if (source.current) source.current.style.visibility = '';
      source.current = null;
      setShown(null);
      setHeld(false);
      closing.current = false;
      if (props.anchor) props.onClose();
    };
    if (anim) anim.onfinish = done;
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
      <div ref={panel} className={`ios-menu ${held ? 'is-held' : ''}`} role="menu" style={place} onClick={(e) => e.stopPropagation()}>
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
                onClick={() => {
                  if (i.keepOpen) {
                    setHeld(true);
                    i.onClick();
                  } else close(i.onClick);
                }}
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
const MENU_CLOSE_MS = 260;

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
