import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ISODate, Meal } from '../core/types';

export type Tab = 'today' | 'train' | 'food' | 'body' | 'more';

export type Route =
  | { name: 'workout'; sessionId: number }
  | { name: 'addFood'; meal: Meal; date: ISODate }
  | { name: 'sleepSetup' };

interface Nav {
  tab: Tab;
  stack: Route[];
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  pop: () => void;
  /** Switch tabs and open a screen there. */
  go: (t: Tab, r?: Route) => void;
}

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('today');
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({ today: [], train: [], food: [], body: [], more: [] });

  const setTab = useCallback(
    (t: Tab) => {
      // Tapping the active tab again goes back to its first screen, like iOS.
      if (t === tab) setStacks((s) => ({ ...s, [t]: [] }));
      setTabState(t);
    },
    [tab],
  );
  const push = useCallback((r: Route) => setStacks((s) => ({ ...s, [tab]: [...s[tab], r] })), [tab]);
  const pop = useCallback(() => setStacks((s) => ({ ...s, [tab]: s[tab].slice(0, -1) })), [tab]);
  const go = useCallback((t: Tab, r?: Route) => {
    setTabState(t);
    setStacks((s) => ({ ...s, [t]: r ? [r] : [] }));
  }, []);

  const value = useMemo(() => ({ tab, stack: stacks[tab], setTab, push, pop, go }), [tab, stacks, setTab, push, pop, go]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}
