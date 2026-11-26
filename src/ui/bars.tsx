import { Sym } from './Sym';
import { Fragment, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

/**
 * iOS 26 pull-down menu: a glass panel that grows out of the button that opened it, with
 * white 17pt items and their symbols on the right. Tapping outside closes it.
 */
export function PullDownMenu(props: {
  anchor: DOMRect | null;
  onClose: () => void;
  /** A small gray line at the top saying what the menu is for, as iOS context menus have. */
  title?: string;
  items: { label: string; icon?: ReactNode; onClick: () => void; /** Starts a new group (a gap above it). */ group?: boolean }[];
}) {
  // Closing plays the open animation in reverse (back into the button), then tells the parent.
  const [closing, setClosing] = useState(false);
  if (!props.anchor) return null;
  const a = props.anchor;
  const close = (then?: () => void) => {
    if (closing) return;
    setClosing(true);
    then?.();
    window.setTimeout(() => {
      setClosing(false);
      props.onClose();
    }, MENU_CLOSE_MS);
  };
  // Portaled to <body>: inside a dialog (or any transformed box) a fixed menu would be placed
  // relative to that box and clipped by it.
  return createPortal(
    <div className={`ios-menu-scrim ${closing ? 'is-closing' : ''}`} onClick={() => close()}>
      <div
        className={`ios-menu ${closing ? 'is-closing' : ''}`}
        role="menu"
        // Opens down from its button, on the button's side of the screen (as iOS does), or up from
        // it when there isn't room below (above the tab bar).
        style={(() => {
          const h = props.items.length * 44 + 12 + props.items.filter((i) => i.group).length * 16 + (props.title ? 32 : 0);
          const up = a.bottom + 8 + h > window.innerHeight - 96 && a.top - 8 - h > 56;
          const y = up ? { top: a.top - 8 - h } : { top: a.bottom + 8 };
          const left = a.left + a.width / 2 < window.innerWidth / 2;
          return left
            ? { ...y, left: Math.max(16, a.left), transformOrigin: up ? 'bottom left' : 'top left' }
            : { ...y, right: Math.max(16, window.innerWidth - a.right), transformOrigin: up ? 'bottom right' : 'top right' };
        })()}
        onClick={(e) => e.stopPropagation()}
      >
        {props.title && <div className="ios-menu-title">{props.title}</div>}
        {props.items.map((i) => (
          <Fragment key={i.label}>
            {i.group && <div className="ios-menu-sep" role="separator" />}
            <button type="button" role="menuitem" className="ios-menu-item" onClick={() => close(i.onClick)}>
              <span>{i.label}</span>
              {i.icon && <span className="ios-menu-icon">{i.icon}</span>}
            </button>
          </Fragment>
        ))}
      </div>
    </div>,
    document.body,
  );
}
const MENU_CLOSE_MS = 300;

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
