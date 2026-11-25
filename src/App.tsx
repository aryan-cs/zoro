import { App as KonstaApp, Button, Tabbar, TabbarLink, Toast, ToolbarPane } from 'konsta/react';
import { CalendarDays, ChartLine, Dumbbell, Salad, Settings as SettingsIcon } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AddFoodScreen } from './screens/AddFood';
import { BodyScreen } from './screens/Body';
import { FoodScreen } from './screens/Food';
import { MoreScreen } from './screens/More';
import { SleepSetupScreen } from './screens/SleepSetup';
import { TodayScreen } from './screens/Today';
import { TrainScreen } from './screens/Train';
import { WorkoutScreen } from './screens/Workout';
import { ToastProvider } from './ui/kit';
import { NavProvider, useNav, type Route, type Tab } from './ui/nav';

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'food', label: 'Food', icon: Salad },
  { id: 'body', label: 'Body', icon: ChartLine },
  { id: 'more', label: 'Settings', icon: SettingsIcon },
];

function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'workout':
      return <WorkoutScreen key={route.sessionId} sessionId={route.sessionId} />;
    case 'addFood':
      return <AddFoodScreen meal={route.meal} date={route.date} />;
    case 'sleepSetup':
      return <SleepSetupScreen />;
  }
}

function TabRoot({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'today':
      return <TodayScreen />;
    case 'train':
      return <TrainScreen />;
    case 'food':
      return <FoodScreen />;
    case 'body':
      return <BodyScreen />;
    case 'more':
      return <MoreScreen />;
  }
}

function Shell() {
  const { tab, stack, setTab } = useNav();
  const top = stack[stack.length - 1];
  return (
    <>
      {top ? <RouteScreen route={top} /> : <TabRoot tab={tab} />}
      <Tabbar labels icons className="fixed bottom-0 left-0 z-20">
        <ToolbarPane>
        {TABS.map((t) => (
          <TabbarLink
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={<t.icon className="h-7 w-7" strokeWidth={tab === t.id ? 2.2 : 1.8} />}
            label={t.label}
          />
        ))}
        </ToolbarPane>
      </Tabbar>
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
        <Button rounded clear small inline onClick={() => void updateServiceWorker(true)}>
          Update
        </Button>
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
