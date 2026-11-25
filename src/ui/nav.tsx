import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ISODate, Meal } from '../core/types';

export type Tab = 'water' | 'food' | 'today' | 'lift' | 'history';

export type Route =
  | { name: 'workout'; sessionId: number }
  | { name: 'addFood'; meal: Meal; date: ISODate; barcode?: string }
  | { name: 'logSleep' }
  | { name: 'sleepSetup' }
  | { name: 'settings' };

/** A pushed screen. `leaving` is set while it slides out. */
export interface Entry {
  id: number;
  route: Route;
  leaving?: boolean;
}

/** How long the iOS push/pop slide takes, in ms. */
export const SLIDE_MS = 350;

interface Nav {
  tab: Tab;
  stacks: Record<Tab, Entry[]>;
  /** Routes on the current tab's stack (top last). */
  stack: Route[];
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  /** Slide the top screen away. `instant` skips the animation (after a swipe-back already moved it). */
  pop: (instant?: boolean) => void;
  /** Switch tabs and open a screen there. */
  go: (t: Tab, r?: Route) => void;
}

const NavContext = createContext<Nav | null>(null);
const EMPTY: Record<Tab, Entry[]> = { water: [], food: [], today: [], lift: [], history: [] };

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('today');
  const [stacks, setStacks] = useState<Record<Tab, Entry[]>>(EMPTY);
  const nextId = useRef(1);
  const entry = (route: Route): Entry => ({ id: nextId.current++, route });

  const setTab = useCallback(
    (t: Tab) => {
      // Tapping the active tab again goes back to its first screen, like iOS.
      if (t === tab) setStacks((s) => ({ ...s, [t]: [] }));
      setTabState(t);
    },
    [tab],
  );
  const push = useCallback((r: Route) => setStacks((s) => ({ ...s, [tab]: [...s[tab], entry(r)] })), [tab]);
  const pop = useCallback(
    (instant?: boolean) => {
      const t = tab;
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
    [tab],
  );
  const go = useCallback((t: Tab, r?: Route) => {
    setTabState(t);
    setStacks((s) => ({ ...s, [t]: r ? [entry(r)] : [] }));
  }, []);

  const value = useMemo(
    () => ({ tab, stacks, stack: stacks[tab].filter((e) => !e.leaving).map((e) => e.route), setTab, push, pop, go }),
    [tab, stacks, setTab, push, pop, go],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}
