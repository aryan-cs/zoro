import { useLiveQuery } from 'dexie-react-hooks';
import { Toast } from 'konsta/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { getDB, getSettings } from '../core/db';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { Settings } from '../core/types';

export const db = getDB();

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS);
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtLb = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${fmt(n, n % 1 ? 1 : 0)}`);

/** Thin progress bar with a label row above it. */
export function ProgressRow(props: { label: string; value: number; target: number; unit?: string; color: string }) {
  const pct = props.target > 0 ? Math.min(1, props.value / props.target) : 0;
  const over = props.value > props.target * 1.05;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-[15px]">
        <span>{props.label}</span>
        <span className="tabular text-black/50 dark:text-white/55">
          <span className={over ? 'text-[#ff3b30]' : 'text-black dark:text-white'}>{fmt(props.value)}</span> / {fmt(props.target)}
          {props.unit ? ` ${props.unit}` : ''}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: props.color }} />
      </div>
    </div>
  );
}

export function Stat(props: { label: string; value: ReactNode; sub?: ReactNode; subClass?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex flex-col items-start rounded-xl bg-white p-3 text-left active:opacity-70 dark:bg-[#1c1c1e]"
    >
      <span className="text-[13px] text-black/50 dark:text-white/55">{props.label}</span>
      <span className="tabular text-[22px] font-semibold leading-tight">{props.value}</span>
      {props.sub && <span className={`text-[12px] ${props.subClass ?? 'text-black/50 dark:text-white/55'}`}>{props.sub}</span>}
    </button>
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
      className={`tabular rounded-lg bg-black/5 px-2 py-1.5 text-center outline-none focus:bg-[#007aff]/10 disabled:opacity-60 dark:bg-white/10 ${props.width ?? 'w-16'}`}
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
      <Toast position="center" opened={!!msg} className="!bottom-[calc(env(safe-area-inset-bottom)+104px)]">
        <span className="shrink">{msg}</span>
      </Toast>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
