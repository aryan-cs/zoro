import { Page } from 'konsta/react';
import { Cell, Header, Row, Section } from '../ui/kit';
import { useHealthSyncedAt } from '../ui/healthSync';
import { useNav } from '../ui/nav';
import { useSync } from '../ui/sync';

/**
 * Apple Health, on its own: a Shortcuts automation runs Connect Zoro to Health (scripts/make-health-shortcut.py)
 * when an app you open every morning opens. Once a day it sends the last two days' sleep and steps
 * through the backup repo for Zoro to bring in (src/ui/healthSync.ts); later runs that day stop at once. iOS doesn't let
 * an app add an automation, so this walks you through making it once.
 */

/** Runs Connect Zoro to Health now (the first run is when iOS asks to read Apple Health). */
export const RUN_URL = 'shortcuts://run-shortcut?name=Connect%20Zoro%20to%20Health';

/**
 * Connect Zoro to Health, shared from Shortcuts as an iCloud link (made on the Mac with Share ›
 * Copy iCloud Link; it opens Shortcuts' Add Shortcut screen). It's a snapshot: after changing the
 * shortcut (scripts/make-health-shortcut.py), add the new build and share a fresh link. The shared
 * copy asks for the backup key when added; no key is in it.
 */
const ICLOUD_URL = 'https://www.icloud.com/shortcuts/d3c267607b4f443995db3821e5994f86';

/** Add Connect Zoro to Health to Shortcuts, for the automation to run. */
export function addHealthAutomation() {
  window.location.href = ICLOUD_URL;
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
      <Section keep title="1. Add the Shortcut" footer="Adds Connect Zoro to Health, the steps the automation runs. It asks once for your Cloud Backup key.">
        <Row accent title="Add to Shortcuts" onClick={addHealthAutomation} />
      </Section>
      <Section
        keep
        title="2. Make the Automation"
        footer="It runs once a day: the first time you open that app after 5 AM, once last night’s sleep is in Apple Health. Opening it again that day does nothing. It waits for you to open an app because Apple Health can’t be read while your iPhone is locked."
      >
        <Cell className="py-2.5 text-[15px]">
          In Shortcuts, tap Automation, then +. Choose App, pick an app you open every morning (Messages, say) and choose Is Opened. Then choose Run Immediately, turn off Notify When Run, and pick Connect Zoro to Health.
        </Cell>
      </Section>
      <Section keep title="3. Allow Apple Health" footer="Your iPhone asks once to let it read your sleep and steps, and to keep a note of the day it last ran. After that, nothing to tap.">
        <Row accent title="Run Now" onClick={() => (window.location.href = RUN_URL)} />
      </Section>
    </Page>
  );
}
