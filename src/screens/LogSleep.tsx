import { ListInput, Page } from 'konsta/react';
import { useState } from 'react';
import { formatMinutes } from '../core/calc';
import { parseSleepImport, sleepFromTimes } from '../core/sleep';
import { saveSleep, today } from '../core/store';
import { Btn, db, Header, Row, Section, useSettings, useToast } from '../ui/kit';
import { SleepDial, SleepTime } from '../ui/SleepDial';

/** "8 hr 15 min", as Health writes durations. */
const hrMin = (min: number) => `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}`;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
import { useNav } from '../ui/nav';

const RUN_URL = 'shortcuts://run-shortcut?name=Zoro%20Sleep';
const INSTALLED_KEY = 'zoro.sleepShortcut';

/** 'tried' once you've been sent to add it, 'ok' once a paste from it worked. */
function shortcutState(): 'none' | 'tried' | 'ok' {
  try {
    const v = localStorage.getItem(INSTALLED_KEY);
    return v === 'ok' ? 'ok' : v ? 'tried' : 'none';
  } catch {
    return 'none';
  }
}
function setShortcutState(v: 'tried' | 'ok') {
  try {
    if (v === 'ok' || shortcutState() !== 'ok') localStorage.setItem(INSTALLED_KEY, v);
  } catch {
    // Storage blocked: we'll just offer to add it again.
  }
}
export const shortcutInstalled = () => shortcutState() === 'ok';

/** Apple's iCloud link for the Zoro Sleep shortcut: opening it shows Shortcuts' own Add Shortcut screen. */
const SHORTCUT_ICLOUD = 'https://www.icloud.com/shortcuts/323631b5cb6e484ea7559840a38aed85';

/** Open Shortcuts' Add Shortcut screen for Zoro Sleep (one tap, no share sheet). */
export function addSleepShortcut() {
  setShortcutState('tried');
  // A new window leaves the Home Screen app, so iOS hands the link to Shortcuts.
  if (!window.open(SHORTCUT_ICLOUD, '_blank')) window.location.href = SHORTCUT_ICLOUD;
}

export function LogSleepScreen() {
  const nav = useNav();
  const toast = useToast();
  const [bed, setBed] = useState('23:30');
  const [wake, setWake] = useState('07:00');
  const settings = useSettings();
  const span = ((toMin(wake) - toMin(bed) + 1440) % 1440) || 1440;
  // Until you've set up the shortcut, the card offers only that; after, only Copy and Paste.
  const [setUp, setSetUp] = useState(shortcutState() !== 'none');
  const [manualPaste, setManualPaste] = useState(false);
  const [paste, setPaste] = useState('');

  const importText = async (text: string) => {
    const s = parseSleepImport(text);
    if (!s) return toast("Invalid sleep data");
    await saveSleep(s, db);
    setShortcutState('ok');
    setPaste('');
    toast(`Saved ${formatMinutes(s.minutes)}`);
    nav.pop();
  };
  const pasteFromClipboard = async () => {
    try {
      // iOS shows its Paste button for this.
      const text = await navigator.clipboard.readText();
      await importText(text);
    } catch {
      setManualPaste(true);
    }
  };
  const saveManual = async () => {
    const s = sleepFromTimes(today(), bed, wake);
    if (!s) return toast('Check the times.');
    await saveSleep(s, db);
    toast(`Saved ${formatMinutes(s.minutes)}`);
    nav.pop();
  };

  return (
    <Page className="tab-safe">
      <Header title="Log Sleep" onBack={nav.pop} />

      <div className="fit-stack">
        {/* From Apple Health: the shortcut copies last night's sleep, then paste it here. */}
        <div className="sleep-card sleep-import">
          {setUp ? (
            <div className="sleep-import-btns">
              <Btn onClick={() => (window.location.href = RUN_URL)}>Copy</Btn>
              <Btn onClick={() => void pasteFromClipboard()}>Paste</Btn>
            </div>
          ) : (
            <Btn
              size="lg"
              onClick={() => {
                addSleepShortcut();
                setSetUp(true);
              }}
            >
              Set Up Shortcut
            </Btn>
          )}
        </div>
      </div>
      {manualPaste && (
        <Section>
          <ListInput
            type="textarea"
            label="Sleep Data"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text) {
                e.preventDefault();
                void importText(text);
              }
            }}
            placeholder="Touch and hold to paste"
          />
          {paste.trim() && <Row accent title="Import" onClick={() => void importText(paste)} />}
        </Section>
      )}

      {/* Manual: drag bedtime and wake-up on the dial, as in Health's sleep schedule. */}
      <div className="fit-stack">
        <div className="sleep-card">
          <div className="sleep-times">
            <SleepTime icon="bed.double.fill" label="BEDTIME" time={bed} day={toMin(bed) >= toMin(wake) ? 'Last Night' : 'Today'} />
            <SleepTime icon="alarm.waves.left.and.right.fill" label="WAKE UP" time={wake} day="Today" />
          </div>
          <SleepDial
            bed={bed}
            wake={wake}
            onChange={(b, w) => {
              setBed(b);
              setWake(w);
            }}
          />
          <div className="sleep-total">{hrMin(span)}</div>
          <div className="sleep-goal">{span >= settings.sleepTargetMin ? 'This meets your sleep goal.' : `${hrMin(settings.sleepTargetMin - span)} short of your sleep goal.`}</div>
        </div>
        <Btn size="lg" onClick={() => void saveManual()}>
          Save
        </Btn>
      </div>
    </Page>
  );
}
