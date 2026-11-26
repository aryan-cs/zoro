import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ISODate, Meal, TemplateId } from '../core/types';
import { springEasing, type Spring } from './motion';

export type Tab = 'water' | 'food' | 'today' | 'lift' | 'history';

export type Route =
  | { name: 'workout'; sessionId: number }
  /** A day still to come: its workout as planned, to look at (nothing to tick yet). */
  | { name: 'plannedWorkout'; templateId: TemplateId; date: ISODate }
  /** How to do an exercise: its photos and a few pointers (swipe a set to the left). */
  | { name: 'exercise'; exerciseId: string; lastSet?: boolean }
  | { name: 'addFood'; meal?: Meal; date: ISODate; barcode?: string }
  | { name: 'logSleep' }
  | { name: 'healthSetup' }
  | { name: 'settings' }
  /** A tab's screen opened from a card (Today's Water, This Week…), pushed with a Back button. */
  | { name: 'screen'; tab: Tab; section?: string };

/** A pushed screen. `leaving` is set while it slides out. */
export interface Entry {
  id: number;
  route: Route;
  leaving?: boolean;
}

/**
 * iOS push/pop, measured from Fitness and Settings on iOS 27 (both are UIKit's stock transition):
 * a critically damped spring (response ~260 ms) that lands in ~420 ms, sampled here as a CSS
 * linear() curve; the screen underneath moves 30% of its width and takes a 10% black dim, both
 * in step with progress. Releasing a swipe-back uses a slightly bouncy spring (damping 0.85)
 * that starts at the finger's speed, and finishes the pop if the swipe would coast past halfway. Mirrored as --push-ms / --push-ease in index.css.
 */
export const SLIDE_MS = 420;

/**
 * Sliding sideways between pages (History's sections, Food's days): on the same spring as the
 * tabs, a little longer for each page passed, so a long trip glides past the pages between
 * instead of flicking across them.
 */
export function pageSlide(distance: number): { ms: number; ease: string } {
  const d = Math.max(1, Math.abs(distance));
  // The tabs' own spring (useTabPager): critically damped, 0.42 s to the next page, 0.11 s more per page passed.
  const { ms, easing } = springEasing({ duration: 0.42 + 0.11 * (d - 1), bounce: 0 });
  return { ms, ease: easing };
}
export const PUSH_EASE = 'linear(0, 0.079, 0.237, 0.404, 0.553, 0.673, 0.765, 0.834, 0.884, 0.92, 0.945, 0.963, 0.975, 0.983, 0.989, 0.992, 0.995, 0.997, 0.998, 0.999, 1)';
/** Letting go of a swipe-back: a slightly bouncy spring (damping 0.85), from the finger's speed. */
export const RELEASE_SPRING: Spring = { duration: 0.3, bounce: 0.15 };
export const PARALLAX = 30;
export const DIM = 0.1;

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
        const from = tabRef.current;
        if (t === from) {
          // Tapping the active tab again slides back to its first screen, like iOS.
          setStacks((s) => (s[t].some((e) => !e.leaving) ? { ...s, [t]: s[t].map((e) => ({ ...e, leaving: true })) } : s));
          setTimeout(() => setStacks((s) => ({ ...s, [t]: s[t].filter((e) => !e.leaving) })), SLIDE_MS);
          return;
        }
        // Leaving a tab closes what was opened on it (Settings, Water…), so coming back shows the
        // tab itself. Only a workout in progress stays open. It closes once the tab has slid away,
        // not while you can still see it go (unless you've come straight back).
        tabRef.current = t;
        setTabState(t);
        setTimeout(
          () => {
            if (tabRef.current !== from) setStacks((s) => ({ ...s, [from]: s[from].filter((e) => e.route.name === 'workout' && !e.leaving) }));
          },
          pageSlide(4).ms + 60,
        );
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
