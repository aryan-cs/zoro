import { Dialog, DialogButton, App as KonstaApp, Tabbar, TabbarLink, ToolbarPane } from 'konsta/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AddFoodScreen } from './screens/AddFood';
import { FoodScreen } from './screens/Food';
import { HistoryScreen, type HistoryTab } from './screens/History';
import { LiftScreen } from './screens/Lift';
import { LogSleepScreen } from './screens/LogSleep';
import { SettingsScreen } from './screens/Settings';
import { SleepSetupScreen } from './screens/SleepSetup';
import { TodayScreen } from './screens/Today';
import { WaterScreen } from './screens/Water';
import { WorkoutScreen } from './screens/Workout';
import { ExerciseScreen } from './screens/Exercise';
import { useAutoTargets } from './ui/autoTargets';
import { InfoProvider, ToastProvider } from './ui/kit';
import type { SFName } from './ui/sf';
import { Sym } from './ui/Sym';
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DIM, InStack, NavProvider, PARALLAX, RELEASE_EASE, RELEASE_MS, useNav, useNavState, type Entry, type Route, type Tab } from './ui/nav';

const TABS: { id: Tab; label: string; icon: SFName }[] = [
  { id: 'water', label: 'Water', icon: 'drop.fill' },
  { id: 'food', label: 'Food', icon: 'fork.knife' },
  { id: 'today', label: 'Today', icon: 'calendar' },
  { id: 'lift', label: 'Lift', icon: 'figure.run.circle.fill' },
  { id: 'history', label: 'History', icon: 'text.book.closed.fill' },
];

function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'workout':
      return <WorkoutScreen key={route.sessionId} sessionId={route.sessionId} />;
    case 'exercise':
      return <ExerciseScreen exerciseId={route.exerciseId} />;
    case 'addFood':
      return <AddFoodScreen meal={route.meal} date={route.date} barcode={route.barcode} />;
    case 'logSleep':
      return <LogSleepScreen />;
    case 'sleepSetup':
      return <SleepSetupScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'screen':
      switch (route.tab) {
        case 'water':
          return <WaterScreen />;
        case 'food':
          return <FoodScreen />;
        case 'today':
          return <TodayScreen />;
        case 'lift':
          return <LiftScreen />;
        case 'history':
          return <HistoryScreen initial={route.section as HistoryTab | undefined} />;
      }
  }
}

/** A tab's first screen. Memoized: switching tabs doesn't re-render the other tabs. */
const TabRoot = memo(function TabRoot({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'water':
      return <WaterScreen />;
    case 'food':
      return <FoodScreen />;
    case 'today':
      return <TodayScreen />;
    case 'lift':
      return <LiftScreen />;
    case 'history':
      return <HistoryScreen />;
  }
});

/**
 * iOS 26 tab bar: Konsta's Tabbar + ToolbarPane, icons only. Its press flash is switched off
 * (highlight=false) and its selection lens is restyled in index.css ("Tab bar").
 */
/** Today's day of the month, kept current across midnight and when the app comes back. */
function useDayOfMonth() {
  const [day, setDay] = useState(() => new Date().getDate());
  useEffect(() => {
    const update = () => setDay(new Date().getDate());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = window.setTimeout(update, midnight + 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [day]);
  return day;
}

/** Today's tab shows the day like Calendar's icon: the weekday in red over the date. */
function DayIcon({ day }: { day: number }) {
  // `day` changes at midnight, which re-renders this with the new weekday.
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  return (
    <span className="day-icon" aria-hidden data-day={day}>
      <span className="day-icon-weekday">{weekday}</span>
      <span className="day-icon-date">{day}</span>
    </span>
  );
}

function Tabs() {
  const { tab } = useNavState();
  const { setTab } = useNav();
  // Today shows the date, like Calendar's icon: WED over 25.
  const day = useDayOfMonth();
  return (
    <Tabbar icons className="zoro-tabbar fixed bottom-0 left-0 z-20 !pb-[var(--tabbar-bottom)]" bgClassName="!hidden">
      <ToolbarPane {...({ highlight: false } as object)}>
        {TABS.map((t) => (
          <TabbarLink
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
            icon={t.id === 'today' ? <DayIcon day={day} /> : <Sym name={t.icon} size={17} />}
          />
        ))}
      </ToolbarPane>
    </Tabbar>
  );
}

/** Elements a sideways drag should operate instead of swiping back. */
const NO_SWIPE = 'input, textarea, select, [contenteditable], .k-stepper, .k-range, canvas, [data-no-swipe]';

/**
 * A pushed screen: slides in from the right like a UINavigationController push and slides
 * out on Back, while the screen under it slides a third of the way left and dims (iOS's
 * parallax). As in iOS 26, you can swipe right from anywhere on it (not just the edge) to go
 * back; it and the screen under it follow your finger and finish or snap back when you let go.
 */
const StackPage = memo(function StackPage({ entry, covered }: { entry: Entry; covered: boolean }) {
  const { pop } = useNav();
  // Slide in once: hidden tabs are display:none, which would replay the animation on return.
  const [landed, setLanded] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; active: boolean; dead: boolean } | null>(null);
  const under = () => el.current?.previousElementSibling as HTMLElement | null;

  /** Put this screen `dx` px in from the left and the one under it where that leaves it. */
  const follow = (dx: number, animate: boolean) => {
    const node = el.current;
    const u = under();
    if (!node) return;
    const p = Math.min(1, Math.max(0, dx / node.offsetWidth)); // 0 = fully shown, 1 = gone
    const t = animate ? `transform ${RELEASE_MS}ms ${RELEASE_EASE}` : 'none';
    node.style.transition = t;
    node.style.transform = `translateX(${p * 100}%)`;
    if (u) {
      u.style.transition = t;
      u.style.transform = `translateX(${-PARALLAX * (1 - p)}%)`;
      u.style.setProperty('--dim', String(DIM * (1 - p)));
      u.style.setProperty('--dim-ms', animate ? `${RELEASE_MS}ms` : '0ms');
    }
  };
  /** Hand both screens back to their classes once an animation has landed. */
  const release = () => {
    for (const n of [el.current, under()]) {
      if (!n) continue;
      n.style.removeProperty('transition');
      n.style.removeProperty('transform');
      n.style.removeProperty('--dim');
      n.style.removeProperty('--dim-ms');
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (covered || e.touches.length !== 1 || (e.target as Element).closest?.(NO_SWIPE)) return;
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, t: Date.now(), active: false, dead: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d || d.dead) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Mostly sideways and to the right: it's a back swipe. Otherwise let the page scroll.
      if (dx > 0 && dx > Math.abs(dy) * 1.3) d.active = true;
      else {
        d.dead = true;
        return;
      }
    }
    follow(Math.max(0, dx), false);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current;
    const node = el.current;
    drag.current = null;
    if (!d?.active || !node) return;
    const dx = e.changedTouches[0].clientX - d.x;
    const fast = dx / Math.max(1, Date.now() - d.t) > 0.5;
    if (dx > node.offsetWidth * 0.3 || (fast && dx > 40)) {
      follow(node.offsetWidth, true);
      setTimeout(() => {
        release();
        pop(true);
      }, RELEASE_MS);
    } else {
      follow(0, true);
      setTimeout(release, RELEASE_MS);
    }
  };

  return (
    <div
      ref={el}
      className={`stack-layer stack-page absolute inset-0 touch-pan-y ${entry.leaving ? 'stack-out' : landed ? '' : 'stack-in'} ${covered ? 'is-covered' : ''}`}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && !entry.leaving) setLanded(true);
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        if (drag.current?.active) {
          follow(0, true);
          setTimeout(release, RELEASE_MS);
        }
        drag.current = null;
      }}
    >
      <InStack.Provider value={true}>
        <RouteScreen route={entry.route} />
      </InStack.Provider>
    </div>
  );
});

/**
 * One tab and its pushed screens. Hidden tabs are display:none, so nothing of the old tab
 * stays on screen while the new one paints (visibility:hidden kept its layers around on iOS).
 * display:none resets scroll positions, so they're remembered and put back on return.
 */
/**
 * A tab's screen. The tabs sit side by side in tab-bar order; useTabPager moves them (it sets
 * their transform and visibility directly, every frame while they move).
 */
function TabPane({ active, children, paneRef }: { active: boolean; children: ReactNode; paneRef: (el: HTMLDivElement | null) => void }) {
  const el = useRef<HTMLDivElement | null>(null);
  const scrolls = useRef(new WeakMap<Element, number>());
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onScroll = (e: Event) => {
      if (e.target instanceof Element) scrolls.current.set(e.target, e.target.scrollTop);
    };
    node.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => node.removeEventListener('scroll', onScroll, { capture: true });
  }, []);
  useLayoutEffect(() => {
    if (!active || !el.current) return;
    for (const page of el.current.querySelectorAll('.k-page')) {
      const top = scrolls.current.get(page);
      if (top) page.scrollTop = top;
    }
  }, [active]);
  return (
    <div
      ref={(node) => {
        el.current = node;
        paneRef(node);
      }}
      className="absolute inset-0"
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

/** Touches that start on these keep the sideways swipe for themselves (scrubbing a chart, dragging a dial). */
const OWN_SWIPE = '.fit-chart, canvas, input, textarea, select, .ios-segmented, .sleep-dial, .zoro-tabbar, .k-dialog, .k-popup, .k-sheet, .k-actions';

/**
 * The tabs as pages, moved like a UIKit paging scroll view. One position (in pages) drives every
 * tab; a critically damped spring carries it to the tab you picked, a little slower the farther
 * it goes. Touch the screen while it's moving and it stops under your finger; swipe sideways and
 * it follows your finger; let go and it carries on at your finger's speed to the next tab (past
 * halfway, or with a flick), or settles back. It stretches past the first and last tab. Not while a
 * screen is pushed on the tab (its own swipe goes back).
 */
function useTabPager(root: RefObject<HTMLDivElement | null>, panes: RefObject<(HTMLDivElement | null)[]>, current: number, pushed: boolean) {
  const { setTab } = useNav();
  // p: where the tabs are, in pages (2 = Today). While a slide runs, `run` holds its spring curve.
  const st = useRef({
    p: current,
    target: current,
    dragging: false,
    run: null as null | { t0: number; dt: number; ps: number[]; vs: number[]; anims: Animation[] },
  });
  const live = useRef({ pushed, current });
  live.current = { pushed, current };
  // Width of a page, for turning a finger's travel into pages: read as a swipe starts, not during
  // it (which would force a layout). The tabs themselves are placed in percent of their own width,
  // so they line up even if this is off (Safari can report a narrower window while a page loads).
  const width = useRef(window.innerWidth);

  /** Puts every tab at position `p` directly (at rest, or under your finger). */
  const place = (p: number, moving: boolean) => {
    root.current?.classList.toggle('is-paging', moving);
    panes.current?.forEach((el, i) => {
      if (!el) return;
      const off = i - p;
      // No transform on the tab at rest: a transformed box would hold fixed-position sheets.
      el.style.transform = !moving && Math.abs(off) < 1e-4 ? '' : `translate3d(${off * 100}%, 0, 0)`;
      // The tabs either side stay drawn (just off screen) so a swipe has nothing to paint first.
      el.style.visibility = Math.abs(off) < 1.999 ? 'visible' : 'hidden';
    });
  };

  /** Where a running slide is right now (position and speed), from its spring curve. */
  const now = () => {
    const r = st.current.run;
    if (!r) return { p: st.current.p, v: 0 };
    const k = Math.min(r.ps.length - 1, Math.max(0, Math.floor((performance.now() - r.t0) / 1000 / r.dt)));
    return { p: r.ps[k], v: r.vs[k] };
  };
  /** Stops a running slide where it is. */
  const halt = () => {
    const r = st.current.run;
    if (!r) return;
    const { p } = now();
    r.anims.forEach((a) => a.cancel());
    st.current.run = null;
    st.current.p = p;
    place(p, true);
  };

  /**
   * Slides to `target` on a critically damped spring (no bounce, as paging settles), starting at
   * `velocity` (pages a second). The curve is worked out up front and handed to the browser's own
   * animator, which runs at the screen's full rate (iOS holds scripts to 30 fps in Low Power Mode).
   */
  const animateTo = (target: number, velocity?: number) => {
    const s = st.current;
    const from = now();
    const v0 = velocity ?? from.v;
    halt();
    const p0 = s.p;
    s.target = target;
    // About half a second to the next tab; a little longer for each one passed.
    const response = 0.42 + 0.11 * Math.max(0, Math.abs(target - p0) - 1);
    const k = ((2 * Math.PI) / response) ** 2;
    const c = (4 * Math.PI) / response;
    const dt = 1 / 120;
    const ps = [p0];
    const vs = [v0];
    let p = p0;
    let v = v0;
    for (let n = 0; n < 600; n++) {
      v += (k * (target - p) - c * v) * dt;
      p += v * dt;
      ps.push(p);
      vs.push(v);
      if (Math.abs(target - p) < 0.0005 && Math.abs(v) < 0.02) break;
    }
    ps[ps.length - 1] = target;
    if (ps.length < 3) {
      s.p = target;
      place(target, false);
      return;
    }
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    root.current?.classList.add('is-paging');
    const anims: Animation[] = [];
    panes.current?.forEach((el, i) => {
      if (!el) return;
      // Shown if it passes through the screen at any point in the slide.
      el.style.visibility = i > lo - 1 && i < hi + 1 ? 'visible' : Math.abs(i - p0) < 1.999 ? 'visible' : 'hidden';
      // Every tab moves by the same curve, so share keyframes sampled from it.
      const frames = ps.map((q) => ({ transform: `translate3d(${(i - q) * 100}%, 0, 0)` }));
      anims.push(el.animate(frames, { duration: (ps.length - 1) * dt * 1000, easing: 'linear', fill: 'forwards' }));
    });
    const run = { t0: performance.now(), dt, ps, vs, anims };
    s.run = run;
    void anims[0]?.finished.then(() => {
      if (st.current.run !== run) return;
      st.current.run = null;
      st.current.p = target;
      place(target, false);
      anims.forEach((a) => a.cancel());
    }, () => {});
  };

  useLayoutEffect(() => {
    place(st.current.p, false);
    const onResize = () => {
      width.current = root.current?.clientWidth || window.innerWidth;
      if (!st.current.run) place(st.current.p, false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A tab picked any way (the tab bar, a swipe, a card that opens another tab): go there.
  useLayoutEffect(() => {
    const s = st.current;
    if (s.target !== current || (!s.run && Math.abs(s.p - current) > 1e-4)) animateTo(current);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let start: { x: number; y: number; t: number; p: number } | null = null;
    let mode: 'undecided' | 'swipe' | 'other' = 'other';
    let last = { x: 0, t: 0 };
    let v = 0; // pages per second, smoothed
    const N = TABS.length;
    const rubber = (p: number) => (p < 0 ? p * 0.3 : p > N - 1 ? N - 1 + (p - (N - 1)) * 0.3 : p);
    const onStart = (e: TouchEvent) => {
      mode = 'other';
      if (e.touches.length !== 1 || live.current.pushed) return;
      if ((e.target as Element).closest(OWN_SWIPE)) return;
      const t = e.touches[0];
      width.current = node.clientWidth || window.innerWidth;
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp, p: 0 };
      last = { x: t.clientX, t: e.timeStamp };
      v = 0;
      mode = 'undecided';
    };
    const onMove = (e: TouchEvent) => {
      if (!start || mode === 'other') return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (mode === 'undecided') {
        if (Math.hypot(dx, dy) < 8) return;
        // Mostly sideways and started promptly: a swipe. Otherwise a scroll, or a hold-and-drag.
        mode = Math.abs(dx) > Math.abs(dy) * 1.15 && e.timeStamp - start.t < 400 ? 'swipe' : 'other';
        if (mode === 'other') return;
        // Catch the tabs where they are (even mid-slide) and take them from there.
        halt();
        st.current.dragging = true;
        start = { ...start, x: t.clientX, p: st.current.p };
      }
      e.preventDefault();
      const W = width.current || 1;
      const dt = Math.max(1, e.timeStamp - last.t) / 1000;
      const inst = -((t.clientX - last.x) / W) / dt;
      v = v * 0.4 + inst * 0.6;
      last = { x: t.clientX, t: e.timeStamp };
      st.current.p = rubber(start.p - (t.clientX - start.x) / W);
      place(st.current.p, true);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || mode !== 'swipe') {
        start = null;
        return;
      }
      const from = Math.round(start.p);
      start = null;
      mode = 'other';
      st.current.dragging = false;
      // A finger that stopped before lifting isn't flicking.
      const vel = e.timeStamp - last.t > 80 ? 0 : v;
      const p = st.current.p;
      // Where it would coast to, then the nearest tab, at most one away from where you started.
      let target = Math.round(p + vel * 0.18);
      if (Math.abs(vel) > 0.9) target = vel > 0 ? Math.ceil(p - 0.02) : Math.floor(p + 0.02);
      target = Math.max(0, Math.min(N - 1, Math.max(from - 1, Math.min(from + 1, target))));
      animateTo(target, vel);
      if (target !== live.current.current) setTab(TABS[target].id);
    };
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [root, panes, setTab]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Shell() {
  const { tab, stacks } = useNavState();
  useAutoTargets(); // keep the daily targets on the profile's recommendation
  const current = TABS.findIndex((t) => t.id === tab);
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useTabPager(root, panes, current, stacks[tab].some((e) => !e.leaving));
  return (
    <>
      {/* Every tab stays mounted, so switching tabs or going back keeps your place. */}
      <div ref={root} className="tab-panes absolute inset-0">
      {TABS.map((t, i) => (
        <TabPane
          key={t.id}
          active={i === current}
          paneRef={(el) => {
            panes.current[i] = el;
          }}
        >
          {/* Each screen knows whether a pushed screen is on top of it (then it sits back). */}
          <div className={`stack-layer absolute inset-0 ${stacks[t.id].some((e) => !e.leaving) ? 'is-covered' : ''}`}>
            <TabRoot tab={t.id} />
          </div>
          {stacks[t.id].map((e, i) => (
            <StackPage key={e.id} entry={e} covered={stacks[t.id].slice(i + 1).some((x) => !x.leaving)} />
          ))}
        </TabPane>
      ))}
      </div>
      {/* iOS 26's scroll edge effect: content softly fades out behind the floating tab bar. */}
      <div className="ios-bottom-edge" aria-hidden />
      <Tabs />
    </>
  );
}

// When the app was last opened or brought back to the front.
let shownAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') shownAt = Date.now();
});

/**
 * Updates: if a new version turns up right as you open the app, switch to it straight away
 * (nothing is lost; your data lives on the phone). If one turns up while you're using it,
 * ask with a native alert instead of reloading under you.
 */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.local');
if (LOCAL && 'serviceWorker' in navigator) {
  // A worker registered by an earlier visit would keep serving its cached copy.
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
  void caches?.keys().then((ks) => ks.forEach((k) => void caches.delete(k)));
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Home Screen apps resume instead of reloading, so check for updates when reopened.
      if (!reg) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    },
  });
  const justOpened = needRefresh && Date.now() - shownAt < 10_000;
  useEffect(() => {
    if (justOpened) void updateServiceWorker(true);
  }, [justOpened, updateServiceWorker]);

  return (
    <Dialog
      opened={needRefresh && !justOpened}
      title="Update Available"
      content="A new version of Zoro is ready."
      buttons={
        <DialogButton strong onClick={() => void updateServiceWorker(true)}>
          Update
        </DialogButton>
      }
    />
  );
}

export function App() {
  return (
    <KonstaApp theme="ios" safeAreas>
      <NavProvider>
        <ToastProvider>
          <InfoProvider>
          <Shell />
          {/* Local previews skip the offline cache so every reload shows the latest build. */}
          {!LOCAL && <UpdatePrompt />}
          </InfoProvider>
        </ToastProvider>
      </NavProvider>
    </KonstaApp>
  );
}
