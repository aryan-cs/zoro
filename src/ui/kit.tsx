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
import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { carbTarget } from '../core/calc';
import { NavBar, NavButton, NavTextButton, SegmentedControl } from './bars';
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
export function IconBtn(props: { label: string; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <NavButton label={props.label} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </NavButton>
  );
}

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
export function Section(props: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; plain?: boolean }) {
  const titled = !!(props.title || props.right);
  return (
    <div className={`${titled ? '' : 'zoro-section-untitled'} ${props.className ?? ''}`}>
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
/**
 * Activity ring, drawn like Apple Fitness: a dark track in the ring's color, a round-capped arc
 * from 12 o'clock, and past the goal a second lap whose tip casts a shadow on the first.
 */
function Ring({ c: [cx, cy], r, w, value, target, color, arrow }: { c: [number, number]; r: number; w: number; value: number; target: number; color: string; arrow?: boolean }) {
  const len = 2 * Math.PI * r;
  const p = target > 0 ? Math.max(0, value / target) : 0;
  const lap = p > 1 ? Math.min(p - 1, 1) : 0;
  const arc = (frac: number) => (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${frac * len} ${len}`} />
  );
  const tip = 2 * Math.PI * lap;
  return (
    <>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={w} />
        {p > 0 && arc(Math.min(p, 1))}
        {lap > 0 && (
          <>
            <circle cx={cx + r * Math.cos(tip)} cy={cy + r * Math.sin(tip)} r={w / 2} fill={color} style={{ filter: `drop-shadow(0 0 ${w / 5}px rgba(0,0,0,0.75))` }} />
            {arc(lap)}
          </>
        )}
      </g>
      {arrow && (
        <path
          d={`M${cx - w * 0.28} ${cy - r}h${w * 0.56}m${-w * 0.24} ${-w * 0.24}l${w * 0.24} ${w * 0.24}l${-w * 0.24} ${w * 0.24}`}
          fill="none"
          stroke="#000"
          strokeWidth={w * 0.11}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
}

/** "Move" over "41/170CAL": white label, then the value in the ring's color in SF Rounded with a small uppercase unit. */
function RingValue({ label, value, target, unit, color, big }: { label: string; value: number; target: number; unit: string; color: string; big?: boolean }) {
  return (
    <div className={`ring-value ${big ? 'is-big' : ''}`}>
      <div className="ring-value-label">{label}</div>
      <div className="ring-value-num" style={{ color }}>
        {fmt(value)}/{fmt(target)}
        <small>{unit}</small>
      </div>
    </div>
  );
}

/** One goal as a single Fitness ring with its value beside it (Water). */
export function GoalRing(props: { label: string; value: number; target: number; unit: string; color: string }) {
  return (
    <div className="ring-card">
      <svg viewBox="0 0 110 110" className="ring-art" aria-hidden>
        <Ring c={[55, 55]} r={44} w={22} value={props.value} target={props.target} color={props.color} arrow />
      </svg>
      <div className="ring-legend">
        <RingValue {...props} big />
      </div>
    </div>
  );
}

/** Calories and macros as concentric Fitness rings, each labeled beside them like Move, Exercise and Stand. */
export function MacroSummary({ totals, settings }: { totals: Macros; settings: Settings }) {
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const rows: [string, number, number, string, string][] = [
    ['Calories', totals.kcal, settings.kcalTarget, '#ff9f0a', 'KCAL'],
    ['Protein', totals.protein, settings.proteinTarget, '#30d158', 'G'],
    ['Carbs', totals.carbs, carbs, '#0a84ff', 'G'],
    ['Fat', totals.fat, settings.fatTarget, '#bf5af2', 'G'],
  ];
  return (
    <div className="ring-card is-multi">
      <svg viewBox="0 0 110 110" className="ring-art" aria-hidden>
        {rows.map(([label, v, t, color], i) => (
          <Ring key={label} c={[55, 55]} r={49.5 - i * 13} w={11} value={v} target={t} color={color} />
        ))}
      </svg>
      <div className="ring-legend">
        {rows.map(([label, v, t, color, unit]) => (
          <RingValue key={label} label={label} value={v} target={t} unit={unit} color={color} />
        ))}
      </div>
    </div>
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
      <Page className="pb-[calc(var(--k-safe-area-bottom,0px)+16px)]">
        <Header title={title} right={<NavText onClick={onClose}>{closeLabel}</NavText>} />
        {children}
      </Page>
    </Popup>
  );
}

/**
 * iOS alert with a number field (like UIAlertController with a text field):
 * title, short message, the field with its unit, then Cancel / Save.
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
  const n = parseFloat(v);
  const valid = Number.isFinite(n) && n >= (props.min ?? 0.01) && n <= (props.max ?? 10000);
  return (
    <Dialog
      opened={props.opened}
      title={props.title}
      content={
        <div className="space-y-3">
          {props.message && <div>{props.message}</div>}
          <label className="flex items-center gap-2 rounded-xl bg-[rgba(118,118,128,0.24)] px-3">
            <input
              autoFocus
              inputMode="decimal"
              value={v}
              placeholder={props.initial ?? ''}
              onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && valid && (props.onSave(n), setV(''))}
              className="tabular min-w-0 flex-1 bg-transparent py-2.5 text-[17px] text-white outline-none placeholder:text-[rgba(235,235,245,0.3)]"
            />
            <span className="text-[17px] text-[rgba(235,235,245,0.6)]">{props.unit}</span>
          </label>
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
          <DialogButton
            strong
            disabled={!valid}
            onClick={() => {
              props.onSave(n);
              setV('');
            }}
          >
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
