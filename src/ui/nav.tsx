import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ISODate, Meal } from '../core/types';

export type Tab = 'water' | 'food' | 'today' | 'lift' | 'history';

export type Route =
  | { name: 'workout'; sessionId: number }
  | { name: 'addFood'; meal?: Meal; date: ISODate; barcode?: string }
  | { name: 'logSleep' }
  | { name: 'sleepSetup' }
  | { name: 'settings' }
  /** A tab's screen opened from a card (Today's Water, This Week…), pushed with a Back button. */
  | { name: 'screen'; tab: Tab; section?: string };

/** A pushed screen. `leaving` is set while it slides out. */
export interface Entry {
  id: number;
  route: Route;
  leaving?: boolean;
}

/** iOS push/pop: duration (ms), curve, how far the screen underneath moves left (% of its
 * width) and how much it dims. Mirrored as --push-ms / --push-ease in index.css. */
export const SLIDE_MS = 500;
export const PUSH_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const PARALLAX = 30;
export const DIM = 0.12;

/** What screens use: stable functions, so a tab switch doesn't re-render every screen. */
interface NavActions {
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  /** Slide the top screen away. `instant` skips the animation (after a swipe-back already moved it). */
  pop: (instant?: boolean | unknown) => void;
  /** Switch tabs and open a screen there. */
  go: (t: Tab, r?: Route) => void;
}

/** What the shell and tab bar use. */
interface NavState {
  tab: Tab;
  stacks: Record<Tab, Entry[]>;
}

const ActionsContext = createContext<NavActions | null>(null);
const StateContext = createContext<NavState | null>(null);
const EMPTY: Record<Tab, Entry[]> = { water: [], food: [], today: [], lift: [], history: [] };

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('today');
  const [stacks, setStacks] = useState<Record<Tab, Entry[]>>(EMPTY);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const nextId = useRef(1);

  const actions = useMemo<NavActions>(() => {
    const entry = (route: Route): Entry => ({ id: nextId.current++, route });
    return {
      setTab: (t) => {
        // Tapping the active tab again goes back to its first screen, like iOS.
        if (t === tabRef.current) setStacks((s) => (s[t].length ? { ...s, [t]: [] } : s));
        tabRef.current = t;
        setTabState(t);
      },
      push: (r) => {
        const t = tabRef.current;
        setStacks((s) => ({ ...s, [t]: [...s[t], entry(r)] }));
      },
      pop: (arg) => {
        // Only an explicit `true` skips the slide: buttons wired straight to pop pass their click event.
        const instant = arg === true;
        const t = tabRef.current;
        setStacks((s) => {
          const list = s[t];
          const top = list.findLastIndex((e) => !e.leaving);
          if (top < 0) return s;
          // After a swipe-back the screen is already off to the right: just drop it.
          if (instant) return { ...s, [t]: list.filter((_, i) => i !== top) };
          return { ...s, [t]: list.map((e, i) => (i === top ? { ...e, leaving: true } : e)) };
        });
        if (!instant) setTimeout(() => setStacks((s) => ({ ...s, [t]: s[t].filter((e) => !e.leaving) })), SLIDE_MS);
      },
      go: (t, r) => {
        tabRef.current = t;
        setTabState(t);
        setStacks((s) => ({ ...s, [t]: r ? [entry(r)] : [] }));
      },
    };
  }, []);

  const state = useMemo(() => ({ tab, stacks }), [tab, stacks]);
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useNav(): NavActions {
  const n = useContext(ActionsContext);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}

export function useNavState(): NavState {
  const n = useContext(StateContext);
  if (!n) throw new Error('useNavState outside NavProvider');
  return n;
}

/** True inside a pushed screen: its navigation bar then shows Back even if the screen didn't ask. */
export const InStack = createContext(false);
