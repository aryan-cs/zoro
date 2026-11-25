import { useLiveQuery } from 'dexie-react-hooks';
import { Page, Popup, Sheet, Toast } from 'konsta/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { carbTarget } from '../core/calc';
import { getDB, getSettings } from '../core/db';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { Macros, Settings } from '../core/types';

export const db = getDB();

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS);
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtLb = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${fmt(n, n % 1 ? 1 : 0)}`);

export const dim = 'text-black/50 dark:text-white/55';

export function timeAgo(t: number | undefined): string {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Layout ----------

/** Glass top bar: crisp title, optional back button, and an optional row underneath (search, segments). */
export function Header(props: { title: ReactNode; sub?: ReactNode; onBack?: () => void; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <header className="glass-bar sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
      <div className="relative flex h-11 items-center px-3">
        <div className="z-10 flex flex-1 items-center justify-start">
          {props.onBack ? (
            <IconBtn label="Back" onClick={props.onBack}>
              <ChevronLeft className="h-5 w-5" />
            </IconBtn>
          ) : (
            props.left
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-20 flex flex-col items-center">
          <div className="max-w-full truncate text-[17px] font-semibold leading-tight">{props.title}</div>
          {props.sub && <div className={`max-w-full truncate text-[11px] leading-tight ${dim}`}>{props.sub}</div>}
        </div>
        <div className="z-10 flex flex-1 items-center justify-end gap-2">{props.right}</div>
      </div>
      {props.children && <div className="px-4 pb-2.5">{props.children}</div>}
    </header>
  );
}

/** Round glass button for icons in the top bar. */
export function IconBtn(props: { label: string; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className={`glass-control flex h-8 w-8 items-center justify-center rounded-full text-black active:scale-95 dark:text-white ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  );
}

/** A titled glass card. Pass `plain` to skip the card (for grids of tiles). */
export function Section(props: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; plain?: boolean; cardClass?: string }) {
  return (
    <section className={`mx-4 mt-4 ${props.className ?? ''}`}>
      {(props.title || props.right) && (
        <div className="mb-1.5 flex min-h-5 items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-black/45 dark:text-white/50">{props.title}</h2>
          {props.right}
        </div>
      )}
      {props.plain ? props.children : <div className={`glass overflow-hidden rounded-[22px] ${props.cardClass ?? ''}`}>{props.children}</div>}
    </section>
  );
}

/** One line in a card. Becomes a button when it has onClick. */
export function Row(props: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  accent?: boolean;
  className?: string;
}) {
  const cls = `row flex w-full items-center gap-3 px-4 py-2.5 text-left ${props.onClick ? 'active:bg-black/5 dark:active:bg-white/8' : ''} ${props.className ?? ''}`;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15px] ${props.danger ? 'text-[#ff453a]' : props.accent ? 'font-medium text-accent' : ''}`}>{props.title}</div>
        {props.sub && <div className={`truncate text-[12px] ${dim}`}>{props.sub}</div>}
      </div>
      {props.right !== undefined && <div className={`tabular shrink-0 text-[14px] ${dim}`}>{props.right}</div>}
      {props.chevron && <ChevronRight className="h-4 w-4 shrink-0 text-black/25 dark:text-white/30" />}
    </>
  );
  return props.onClick ? (
    <button type="button" onClick={props.onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Glass button. `tint` is the blue prominent one. */
export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'tint' | 'glass' | 'danger' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const kind = props.kind ?? 'glass';
  const size = props.size ?? 'md';
  const sizes = { sm: 'h-8 px-3.5 text-[14px]', md: 'h-10 px-4 text-[15px]', lg: 'h-11 w-full px-5 text-[16px]' };
  const kinds = {
    tint: 'glass-tint text-black',
    glass: 'glass-control text-accent',
    danger: 'glass-control text-[#ff453a]',
    plain: 'text-accent',
  };
  return (
    <button
      type={props.type ?? 'button'}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-40 ${sizes[size]} ${kinds[kind]} ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  );
}

/** Glass segmented control. */
export function Seg<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`glass-control flex rounded-full p-0.5 ${props.className ?? ''}`}>
      {props.options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => props.onChange(v)}
          className={`h-7 flex-1 rounded-full px-2.5 text-[13px] font-medium transition ${
            props.value === v ? 'bg-white text-black shadow-sm dark:bg-white/25 dark:text-white' : 'text-black/70 dark:text-white/70'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Thin progress bar. */
export function Bar(props: { value: number; target: number; color: string; className?: string }) {
  const pct = props.target > 0 ? Math.min(1, props.value / props.target) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15 ${props.className ?? ''}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: props.color }} />
    </div>
  );
}

/** Calories left plus protein, carbs and fat, in one compact block. */
export function MacroSummary({ totals, settings }: { totals: Macros; settings: Settings }) {
  const left = settings.kcalTarget - totals.kcal;
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const rows: [string, number, number, string][] = [
    ['Protein', totals.protein, settings.proteinTarget, '#48fa78'],
    ['Carbs', totals.carbs, carbs, '#0a84ff'],
    ['Fat', totals.fat, settings.fatTarget, '#bf5af2'],
  ];
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div>
          <span className={`tabular text-[24px] font-bold leading-none ${left < 0 ? 'text-[#ff453a]' : ''}`}>{fmt(Math.abs(left))}</span>
          <span className={`ml-1.5 text-[13px] ${dim}`}>{left >= 0 ? 'kcal left' : 'kcal over'}</span>
        </div>
        <span className={`tabular text-[13px] ${dim}`}>
          {fmt(totals.kcal)} / {fmt(settings.kcalTarget)}
        </span>
      </div>
      <Bar value={totals.kcal} target={settings.kcalTarget} color="#ff9f0a" className="mt-2" />
      <div className="mt-3 grid grid-cols-3 gap-3">
        {rows.map(([label, v, t, color]) => (
          <div key={label}>
            <div className={`text-[11px] ${dim}`}>{label}</div>
            <div className="tabular text-[13px] font-medium">
              {fmt(v)}
              <span className={`font-normal ${dim}`}> / {fmt(t)} g</span>
            </div>
            <Bar value={v} target={t} color={color} className="mt-1" />
          </div>
        ))}
      </div>
    </div>
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
    <label className="row flex items-center gap-3 px-4 py-2">
      <span className="flex-1 text-[15px]">{props.label}</span>
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
        className={`tabular min-w-0 rounded-lg bg-transparent py-1 text-right outline-none placeholder:text-black/30 dark:placeholder:text-white/30 ${props.wide ? 'w-48' : 'w-28'}`}
      />
    </label>
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
      disabled={props.disabled}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value.replace(/[^\d.]/g, ''))}
      onFocus={(e) => e.target.select()}
      className={`tabular rounded-lg bg-black/5 px-2 py-1 text-center outline-none focus:bg-accent/15 disabled:opacity-60 dark:bg-white/10 ${props.width ?? 'w-16'}`}
    />
  );
}

/** Gray helper text under a card. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`mx-5 mt-1.5 text-[12px] leading-snug ${dim} ${className ?? ''}`}>{children}</p>;
}

/** Bottom sheet with a glass background. */
export function GlassSheet({ opened, onClose, children }: { opened: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="glass-sheet pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-black/20 dark:bg-white/25" />
      {children}
    </Sheet>
  );
}

/** Full-height glass sheet with a top bar and a close button. */
export function SheetPage({ opened, onClose, title, children, closeLabel = 'Cancel' }: { opened: boolean; onClose: () => void; title: string; children: ReactNode; closeLabel?: string }) {
  return (
    <Popup opened={opened} onBackdropClick={onClose} className="glass-sheet">
      <Page className="pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <Header
          title={title}
          right={
            <Btn size="sm" kind="plain" onClick={onClose}>
              {closeLabel}
            </Btn>
          }
        />
        {children}
      </Page>
    </Popup>
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
      <Toast position="center" opened={!!msg} className="!bottom-[calc(env(safe-area-inset-bottom)*0.5+84px)]">
        <span className="shrink">{msg}</span>
      </Toast>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
