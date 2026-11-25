import { App as KonstaApp, Toast } from 'konsta/react';
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
import { Btn, ToastProvider } from './ui/kit';
import { NavProvider, useNav, type Route, type Tab } from './ui/nav';

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

/** Slim floating glass tab bar. */
function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)*0.5+8px)]">
      <div className="glass-control pointer-events-auto mx-auto flex h-[54px] max-w-md items-center rounded-full px-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`flex h-[46px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition ${
                active ? 'bg-white/12 text-accent' : 'text-black/75 active:bg-black/5 dark:text-white/80'
              }`}
            >
              <t.icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Shell() {
  const { tab, stack } = useNav();
  const top = stack[stack.length - 1];
  return (
    <>
      {top ? <RouteScreen route={top} /> : <TabRoot tab={tab} />}
      <TabBar />
    </>
  );
}

function UpdateToast() {
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
  return (
    <Toast
      position="center"
      opened={needRefresh}
      className="top-[calc(env(safe-area-inset-top)+8px)] bottom-auto"
      button={
        <Btn size="sm" kind="plain" onClick={() => void updateServiceWorker(true)}>
          Update
        </Btn>
      }
    >
      <button type="button" className="shrink" onClick={() => setNeedRefresh(false)}>
        A new version of Zoro is ready.
      </button>
    </Toast>
  );
}

export function App() {
  return (
    <KonstaApp theme="ios" safeAreas>
      <NavProvider>
        <ToastProvider>
          <Shell />
          <UpdateToast />
        </ToastProvider>
      </NavProvider>
    </KonstaApp>
  );
}
