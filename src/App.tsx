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

/** iOS 26 tab bar (Konsta Tabbar with the sliding glass thumb), a bit slimmer than the default. */
function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <Tabbar
      labels
      icons
      className="fixed bottom-0 left-0 z-20 !pb-[var(--tabbar-bottom)]"
      innerClassName="!h-14"
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

/** Native alert when a new version has been downloaded. */
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
  return (
    <Dialog
      opened={needRefresh}
      onBackdropClick={() => setNeedRefresh(false)}
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
