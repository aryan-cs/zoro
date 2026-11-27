import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDB } from '../core/db';
import { latestRestSession, openedForWorkout } from './restStore';
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

/** A pushed screen. `leaving` is set while it slides out; `still` ones appear without sliding in. */
export interface Entry {
  id: number;
  route: Route;
  leaving?: boolean;
  still?: boolean;
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
  /** Switch tabs and open a screen there (`still`: already there, without sliding in). */
  go: (t: Tab, r?: Route, still?: boolean) => void;
}

/** What the shell and tab bar use. */
interface NavState {
  tab: Tab;
  stacks: Record<Tab, Entry[]>;
}

const ActionsContext = createContext<NavActions | null>(null);
const StateContext = createContext<NavState | null>(null);
const EMPTY: Record<Tab, Entry[]> = { water: [], food: [], today: [], lift: [], history: [] };
const TAB_IDS = Object.keys(EMPTY) as Tab[];
const ROUTES = new Set<Route['name']>(['workout', 'plannedWorkout', 'exercise', 'addFood', 'logSleep', 'healthSetup', 'settings', 'screen']);

/**
 * Where you were (the tab and the screens open on each), kept so opening Zoro again (after iOS
 * closed it, or an update) comes back to the same screen, as iPhone apps do.
 */
const PLACE_KEY = 'zoro.place';
type Place = { tab: Tab; stacks: Partial<Record<Tab, Route[]>> };

function savedPlace(): { tab: Tab; stacks: Record<Tab, Entry[]>; next: number } {
  let id = 1;
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null') as Place | null;
    if (!p || !TAB_IDS.includes(p.tab)) throw new Error('none');
    const stacks = { ...EMPTY };
    for (const t of TAB_IDS) {
      const routes = Array.isArray(p.stacks?.[t]) ? p.stacks[t]! : [];
      stacks[t] = routes.filter((r) => r && ROUTES.has(r.name)).map((route) => ({ id: id++, route, still: true }));
    }
    return withRestLink({ tab: p.tab, stacks, next: id });
  } catch {
    return withRestLink({ tab: 'today', stacks: EMPTY, next: id });
  }
}

/** Opened from "Your rest is over": that workout, on the first frame (nothing else shows first). */
function withRestLink(place: { tab: Tab; stacks: Record<Tab, Entry[]>; next: number }) {
  const sessionId = typeof location !== 'undefined' && openedForWorkout(location.search) ? latestRestSession() : undefined;
  if (sessionId === undefined) return place;
  const route: Route = { name: 'workout', sessionId };
  return { tab: 'lift' as Tab, stacks: { ...place.stacks, lift: [{ id: place.next, route, still: true }] }, next: place.next + 1 };
}

/**
 * A tab switch that should happen at once rather than slide (opening a link): set by go(…, still)
 * and taken by the tab pager as it moves to the new tab.
 */
let jump = false;
export function takeJump(): boolean {
  const j = jump;
  jump = false;
  return j;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [start] = useState(savedPlace);
  const [tab, setTabState] = useState<Tab>(start.tab);
  const [stacks, setStacks] = useState<Record<Tab, Entry[]>>(start.stacks);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const nextId = useRef(start.next);

  // Kept as you go.
  useEffect(() => {
    const place: Place = { tab, stacks: {} };
    for (const t of TAB_IDS) {
      const routes = stacks[t].filter((e) => !e.leaving).map((e) => e.route);
      if (routes.length) place.stacks[t] = routes;
    }
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    } catch {
      /* the next launch starts on Today */
    }
  }, [tab, stacks]);
  // A workout deleted since (on another screen, or by a restore) isn't brought back.
  useEffect(() => {
    const ids = TAB_IDS.flatMap((t) => start.stacks[t]).flatMap((e) => (e.route.name === 'workout' ? [e.route.sessionId] : []));
    if (!ids.length) return;
    void getDB()
      .sessions.bulkGet(ids)
      .then((found) => {
        const gone = new Set(ids.filter((_, i) => !found[i]));
        if (gone.size) setStacks((s) => Object.fromEntries(TAB_IDS.map((t) => [t, s[t].filter((e) => !(e.route.name === 'workout' && gone.has(e.route.sessionId)))])) as Record<Tab, Entry[]>);
      })
      .catch(() => undefined);
  }, [start]);

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
      go: (t, r, still) => {
        if (still && t !== tabRef.current) jump = true;
        tabRef.current = t;
        setTabState(t);
        setStacks((s) => {
          // Already open there (a workout left on Lift): keep it as it is rather than open it again.
          const top = s[t].findLast((e) => !e.leaving);
          if (still && r && top && JSON.stringify(top.route) === JSON.stringify(r)) return { ...s, [t]: s[t].filter((e) => !e.leaving && s[t].indexOf(e) <= s[t].indexOf(top)) };
          return { ...s, [t]: r ? [{ ...entry(r), still }] : [] };
        });
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
