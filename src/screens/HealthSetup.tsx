import { Page } from 'konsta/react';
import { Cell, Header, Row, Section } from '../ui/kit';
import { useHealthSyncedAt } from '../ui/healthSync';
import { useNav } from '../ui/nav';
import { useSync } from '../ui/sync';

/**
 * Apple Health, on its own: a Shortcuts automation runs Zoro Health (scripts/make-health-shortcut.py)
 * when an app you open every morning opens. Once a day it sends the last two days' sleep and steps
 * through the backup repo for Zoro to bring in (src/ui/healthSync.ts); later runs that day stop at once. iOS doesn't let
 * an app add an automation, so this walks you through making it once.
 */

/** Runs Zoro Health now (the first run is when iOS asks to read Apple Health). */
export const RUN_URL = 'shortcuts://run-shortcut?name=Zoro%20Health';

/**
 * Where Zoro Health installs from: the signed copy this app serves. Adding it asks for the backup
 * key, so nothing personal is in the file.
 */
const ADD_URL = new URL(`${import.meta.env.BASE_URL}ZoroHealth.shortcut`, location.origin).href;

/** Add Zoro Health to Shortcuts, for the automation to run. */
export function addHealthAutomation() {
  // A new window leaves the Home Screen app, so iOS hands the file to Safari and then Shortcuts.
  if (!window.open(ADD_URL, '_blank')) window.location.href = ADD_URL;
}

/** "today at 9:02 AM", "yesterday at 9:02 AM" or "Nov 24 at 9:02 AM". */
export function whenWas(t: number): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day =
    d.toDateString() === new Date().toDateString()
      ? 'today'
      : d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()
        ? 'yesterday'
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

export function HealthSetupScreen() {
  const nav = useNav();
  const connected = useSync().state !== 'off';
  const syncedAt = useHealthSyncedAt();
  return (
    <Page className="tab-safe">
      <Header title="Apple Health" onBack={nav.pop} />
      <Section
        footer={
          connected
            ? 'Once it’s set up, your sleep and steps come into Zoro on their own.'
            : 'Turn on Cloud Backup in Settings first. Your iPhone sends your sleep and steps to Zoro through it.'
        }
      >
        <Row title="Last Brought In" right={syncedAt ? whenWas(syncedAt) : 'Not Yet'} />
      </Section>
      <Section keep title="1. Add Zoro Health" footer="These are the steps the automation runs. Adding them asks once for your Cloud Backup key.">
        <Row accent title="Add to Shortcuts" onClick={addHealthAutomation} />
      </Section>
      <Section
        keep
        title="2. Make the Automation"
        footer="It runs once a day: the first time you open that app after 5 AM, once last night’s sleep is in Apple Health. Opening it again that day does nothing. It waits for you to open an app because Apple Health can’t be read while your iPhone is locked."
      >
        <Cell className="py-2.5 text-[15px]">
          In Shortcuts, tap Automation, then +. Choose App, pick an app you open every morning (Messages, say) and choose Is Opened. Then choose Run Immediately, turn off Notify When Run, and pick Zoro Health.
        </Cell>
      </Section>
      <Section keep title="3. Allow Apple Health" footer="Your iPhone asks once to let it read your sleep and steps, and to keep a note of the day it last ran. After that, nothing to tap.">
        <Row accent title="Run Now" onClick={() => (window.location.href = RUN_URL)} />
      </Section>
    </Page>
  );
}
