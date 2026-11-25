import { useLiveQuery } from 'dexie-react-hooks';
import {
  BlockTitle,
  Button,
  Dialog,
  DialogButton,
  Link,
  List,
  ListButton,
  ListItem,
  Navbar,
  NavbarBackLink,
  Page,
  Popup,
  Progressbar,
  Segmented,
  SegmentedButton,
  Sheet,
  Toast,
} from 'konsta/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { carbTarget } from '../core/calc';
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

/** iOS navigation bar (Konsta Navbar) on a solid background, with optional back button and a row underneath. */
export function Header(props: { title: ReactNode; onBack?: () => void; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <Navbar
      title={props.title}
      left={props.onBack ? <NavbarBackLink onClick={() => props.onBack?.()} /> : props.left}
      right={props.right}
      subnavbar={props.children}
      bgClassName="!bg-none !bg-black !h-full"
      // Center the title with flexbox instead of a GPU half-pixel shift, which Safari draws fuzzy.
      titleClassName="!inset-0 !translate-none !transform-none flex flex-col items-center justify-center pointer-events-none"
      subnavbarClassName="!h-auto pb-2 pt-1"
    />
  );
}

/** Icon button for the navigation bar (sits in the bar's glass capsule). */
export function IconBtn(props: { label: string; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <Link
      iconOnly
      aria-label={props.label}
      aria-disabled={props.disabled}
      onClick={props.disabled ? undefined : props.onClick}
      className={`${props.disabled ? 'pointer-events-none opacity-30' : ''} ${props.className ?? ''}`}
    >
      {props.children}
    </Link>
  );
}

/** Text button for the navigation bar. */
export function NavText(props: { onClick?: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <Link onClick={props.onClick} className={`px-2 ${props.strong ? 'font-semibold' : ''}`}>
      {props.children}
    </Link>
  );
}

// ---------- Grouped lists ----------

/** A titled inset grouped list (Konsta List). Children are Rows, Cells or Fields. */
export function Section(props: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; plain?: boolean }) {
  const titled = !!(props.title || props.right);
  return (
    <div className={`${titled ? '' : 'mt-4'} ${props.className ?? ''}`}>
      {titled && (
        <BlockTitle className="flex items-center justify-between gap-2">
          <span>{props.title}</span>
          {props.right && <span className="text-[15px] font-normal">{props.right}</span>}
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
      <ListButton onClick={props.onClick} className={`!h-11 ${props.danger ? '!text-[#ff453a]' : ''}`}>
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
      after={props.right == null ? undefined : <div className="min-w-0 truncate">{props.right}</div>}
      onClick={props.onClick}
      innerClassName={props.sub ? 'min-w-0 !py-2' : 'min-w-0 !py-0'}
      titleWrapClassName={`${props.sub ? '' : '!min-h-11'} min-w-0 [&>div:first-child:not(:last-of-type)]:shrink-0 [&>div:first-child:not(:last-of-type)]:max-w-[65%] [&>div:first-child]:min-w-0 [&>div:first-child]:truncate [&>div:last-of-type]:min-w-0 [&>div:last-of-type]:shrink [&>div:last-of-type]:overflow-hidden [&>div:last-of-type]:whitespace-nowrap [&>div:last-of-type]:text-ellipsis`}
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
        <div className="flex h-11 min-w-0 items-center gap-3">
          <span className="max-w-[65%] shrink-0 truncate text-[17px]">{props.label}</span>
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
            className={`tabular h-11 min-w-0 flex-1 truncate bg-transparent text-right text-[17px] outline-none placeholder:text-[rgba(235,235,245,0.3)] ${dim} focus:text-white`}
          />
        </div>
      }
    />
  );
}

// ---------- Controls ----------

/**
 * iOS button (Konsta Button): `tint` is the filled accent button, `glass` the tinted
 * secondary one (like iOS's gray/tinted buttons), `plain` is text only.
 */
export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'tint' | 'glass' | 'danger' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}) {
  const kind = props.kind ?? 'glass';
  const size = props.size ?? 'md';
  const sizes = { sm: '!h-9 !px-3.5 !text-[15px]', md: '!h-10 !px-4 !text-[16px]', lg: '' };
  const danger = { tonalTextIos: 'text-[#ff453a]', tonalBgIos: 'bg-[#ff453a]/15 active:bg-[#ff453a]/25' };
  return (
    <Button
      rounded
      inline={size !== 'lg'}
      large={size === 'lg'}
      tonal={kind === 'glass' || kind === 'danger'}
      clear={kind === 'plain'}
      colors={kind === 'danger' ? danger : undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`shrink-0 gap-1.5 font-semibold ${sizes[size]} ${props.className ?? ''}`}
    >
      {props.children}
    </Button>
  );
}

/** iOS segmented control (Konsta Segmented, with the sliding thumb). */
export function Seg<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <Segmented strong rounded className={props.className}>
      {props.options.map(([v, label]) => (
        <SegmentedButton key={String(v)} active={props.value === v} onClick={() => props.onChange(v)} {...({ 'aria-pressed': props.value === v } as object)}>
          {label}
        </SegmentedButton>
      ))}
    </Segmented>
  );
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
export function MacroSummary({ totals, settings }: { totals: Macros; settings: Settings }) {
  const left = settings.kcalTarget - totals.kcal;
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const rows: [string, number, number, string][] = [
    ['Protein', totals.protein, settings.proteinTarget, '#48fa78'],
    ['Carbs', totals.carbs, carbs, '#0a84ff'],
    ['Fat', totals.fat, settings.fatTarget, '#bf5af2'],
  ];
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between">
        <div>
          <span className={`tabular text-[26px] font-bold leading-none ${left < 0 ? 'text-[#ff453a]' : ''}`}>{fmt(Math.abs(left))}</span>
          <span className={`ml-1.5 text-[15px] ${dim}`}>{left >= 0 ? 'kcal left' : 'kcal over'}</span>
        </div>
        <span className={`tabular text-[15px] ${dim}`}>
          {fmt(totals.kcal)} / {fmt(settings.kcalTarget)}
        </span>
      </div>
      <Bar value={totals.kcal} target={settings.kcalTarget} color="#ff9f0a" className="mt-2" />
      <div className="mt-3 grid grid-cols-3 gap-3">
        {rows.map(([label, v, t, color]) => (
          <div key={label}>
            <div className={`text-[13px] ${dim}`}>{label}</div>
            <div className="tabular text-[15px] font-medium">
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
  return <p className={`mx-8 mt-1.5 text-[13px] leading-snug ${dim} ${className ?? ''}`}>{children}</p>;
}

/** iOS bottom sheet (Konsta Sheet) with a grabber. */
export function GlassSheet({ opened, onClose, children }: { opened: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet opened={opened} onBackdropClick={onClose} className="pb-[calc(var(--k-safe-area-bottom,0px)+12px)] pt-2">
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
