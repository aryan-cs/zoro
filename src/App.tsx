import { Dialog, DialogButton, App as KonstaApp, Tabbar, TabbarLink, ToolbarPane } from 'konsta/react';
import { CalendarDays, Droplet, Dumbbell, History, Salad } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AddFoodScreen } from './screens/AddFood';
import { FoodScreen } from './screens/Food';
import { HistoryScreen } from './screens/History';
import { LiftScreen } from './screens/Lift';
import { LogSleepScreen } from './screens/LogSleep';
import { SettingsScreen } from './screens/Settings';
import { SleepSetupScreen } from './screens/SleepSetup';
import { TodayScreen } from './screens/Today';
import { WaterScreen } from './screens/Water';
import { WorkoutScreen } from './screens/Workout';
import { ToastProvider } from './ui/kit';
import { useEffect, useRef } from 'react';
import { NavProvider, SLIDE_MS, useNav, type Entry, type Route, type Tab } from './ui/nav';

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'water', label: 'Water', icon: Droplet },
  { id: 'food', label: 'Food', icon: Salad },
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'lift', label: 'Lift', icon: Dumbbell },
  { id: 'history', label: 'History', icon: History },
];

function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'workout':
      return <WorkoutScreen key={route.sessionId} sessionId={route.sessionId} />;
    case 'addFood':
      return <AddFoodScreen meal={route.meal} date={route.date} />;
    case 'logSleep':
      return <LogSleepScreen />;
    case 'sleepSetup':
      return <SleepSetupScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function TabRoot({ tab }: { tab: Tab }) {
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
}

/** iOS 26 tab bar (Konsta Tabbar with the sliding glass thumb), a bit slimmer than the default. */
function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <Tabbar
      labels
      icons
      className="fixed bottom-0 left-0 z-20 !pb-[var(--tabbar-bottom)]"
      innerClassName="!h-[60px]"
      bgClassName="!hidden"
    >
      <ToolbarPane>
        {TABS.map((t) => (
          <TabbarLink
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={<t.icon className="h-6 w-6" strokeWidth={tab === t.id ? 2.2 : 1.8} />}
            label={<span className="text-[10px]">{t.label}</span>}
          />
        ))}
      </ToolbarPane>
    </Tabbar>
  );
}

/**
 * A pushed screen: slides in from the right like a UINavigationController push,
 * slides out on Back, and follows your finger when you swipe from the left edge.
 */
function StackPage({ entry, onSwipeBack }: { entry: Entry; onSwipeBack: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; active: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    // Only from the left edge, like iOS.
    if (t.clientX > 24) return;
    drag.current = { x: t.clientX, y: t.clientY, t: Date.now(), active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    const node = el.current;
    if (!d || !node) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    if (!d.active) {
      if (Math.abs(t.clientY - d.y) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      d.active = dx > 6;
    }
    if (d.active) {
      node.style.transition = 'none';
      node.style.transform = `translateX(${Math.max(0, dx)}px)`;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current;
    const node = el.current;
    drag.current = null;
    if (!d?.active || !node) return;
    const dx = e.changedTouches[0].clientX - d.x;
    const fast = dx / Math.max(1, Date.now() - d.t) > 0.5;
    node.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    if (dx > node.offsetWidth * 0.35 || fast) {
      node.style.transform = 'translateX(100%)';
      setTimeout(onSwipeBack, SLIDE_MS);
    } else {
      node.style.transform = 'translateX(0)';
    }
  };

  return (
    <div
      ref={el}
      className={`stack-page absolute inset-0 z-30 ${entry.leaving ? 'stack-out' : 'stack-in'}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <RouteScreen route={entry.route} />
    </div>
  );
}

function Shell() {
  const { tab, stacks, pop } = useNav();
  return (
    <>
      {/* Every tab stays mounted, so switching tabs or going back keeps your place. */}
      {TABS.map((t) => (
        <div key={t.id} className={`absolute inset-0 ${t.id === tab ? '' : 'invisible pointer-events-none'}`} aria-hidden={t.id !== tab}>
          <TabRoot tab={t.id} />
          {stacks[t.id].map((e) => (
            <StackPage key={e.id} entry={e} onSwipeBack={() => pop(true)} />
          ))}
        </div>
      ))}
      <TabBar />
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
    needRefresh: [needRefresh, setNeedRefresh],
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
      content="A new version of Zoro is ready. Update now? Your data stays on your phone."
      buttons={
        <>
          <DialogButton onClick={() => setNeedRefresh(false)}>Later</DialogButton>
          <DialogButton strong onClick={() => void updateServiceWorker(true)}>
            Update
          </DialogButton>
        </>
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
