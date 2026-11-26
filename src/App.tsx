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
import { useAutoTargets } from './ui/autoTargets';
import { ToastProvider } from './ui/kit';
import type { SFName } from './ui/sf';
import { Sym } from './ui/Sym';
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
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
    <div ref={el} className="absolute inset-0" style={active ? undefined : { display: 'none' }} aria-hidden={!active}>
      {children}
    </div>
  );
}

function Shell() {
  const { tab, stacks } = useNavState();
  useAutoTargets(); // keep the daily targets on the profile's recommendation
  return (
    <>
      {/* Every tab stays mounted, so switching tabs or going back keeps your place. */}
      {TABS.map((t) => (
        <TabPane key={t.id} active={t.id === tab}>
          {/* Each screen knows whether a pushed screen is on top of it (then it sits back). */}
          <div className={`stack-layer absolute inset-0 ${stacks[t.id].some((e) => !e.leaving) ? 'is-covered' : ''}`}>
            <TabRoot tab={t.id} />
          </div>
          {stacks[t.id].map((e, i) => (
            <StackPage key={e.id} entry={e} covered={stacks[t.id].slice(i + 1).some((x) => !x.leaving)} />
          ))}
        </TabPane>
      ))}
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
          <Shell />
          <UpdatePrompt />
        </ToastProvider>
      </NavProvider>
    </KonstaApp>
  );
}
