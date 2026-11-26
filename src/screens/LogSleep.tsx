import { ListInput, Page } from 'konsta/react';
import { useEffect, useState } from 'react';
import { formatMinutes } from '../core/calc';
import { parseHealthImport, sleepFromTimes } from '../core/sleep';
import { saveMetric, saveSleep, today } from '../core/store';
import { hrMin } from '../core/say';
import { Btn, db, FitCard, Header, Row, Section, useSettings, useToast } from '../ui/kit';
import { SleepDial, SleepTime } from '../ui/SleepDial';

/** "8 hr 15 min", as Health writes durations. */

/** A saved bedtime or wake-up as "HH:MM" on this phone's clock (ISO, or "HH:MM" in older entries). */
const clockOf = (v?: string): string | null => {
  if (!v) return null;
  if (/^\d{1,2}:\d{2}$/.test(v)) return v.padStart(5, '0');
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
import { useNav } from '../ui/nav';

const RUN_URL = 'shortcuts://run-shortcut?name=Zoro%20Health';
const INSTALLED_KEY = 'zoro.healthShortcut'; // new name: the old sleep-only shortcut has to be swapped

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

/**
 * Where Zoro Health installs from (it brings in sleep and steps). The signed copy this app serves (scripts/make-health-shortcut.py)
 * is the working one: the old iCloud link (323631b5…) has the Type filter as plain text, so
 * Shortcuts shows it as "Choose" and finds nothing. Swap in a fresh iCloud link here once one is
 * shared from the working copy; iCloud links open Shortcuts' Add Shortcut screen directly.
 */
const SHORTCUT_URL = new URL(`${import.meta.env.BASE_URL}ZoroHealth.shortcut`, location.origin).href;

/** Open Zoro Health in Shortcuts to add it. */
export function addSleepShortcut() {
  setShortcutState('tried');
  // A new window leaves the Home Screen app, so iOS hands the file to Safari and then Shortcuts.
  if (!window.open(SHORTCUT_URL, '_blank')) window.location.href = SHORTCUT_URL;
}

export function LogSleepScreen() {
  const nav = useNav();
  const toast = useToast();
  const [bed, setBed] = useState('23:30');
  const [wake, setWake] = useState('07:00');
  // Logged last night already? Open on those times, to change them; otherwise 11:30 PM to 7:00 AM.
  useEffect(() => {
    let gone = false;
    void db.sleep
      .where('date')
      .equals(today())
      .first()
      .then((e) => {
        const b = clockOf(e?.bedtime);
        const w = clockOf(e?.wakeTime);
        if (gone || !b || !w) return;
        setBed(b);
        setWake(w);
      });
    return () => {
      gone = true;
    };
  }, []);
  const settings = useSettings();
  const span = ((toMin(wake) - toMin(bed) + 1440) % 1440) || 1440;
  // Until you've set up the shortcut, the card offers only that; after, only Copy and Paste.
  const [setUp, setSetUp] = useState(shortcutState() !== 'none');
  const [manualPaste, setManualPaste] = useState(false);
  const [paste, setPaste] = useState('');

  // One paste brings in last night's sleep and the last two days' steps.
  const importText = async (text: string) => {
    const { sleep: s, steps } = parseHealthImport(text);
    for (const d of steps) await saveMetric('steps', d.steps, d.date, db);
    const todaySteps = steps.find((d) => d.date === today())?.steps;
    const stepsNote = todaySteps !== undefined ? `${todaySteps.toLocaleString()} steps` : '';
    if (!s) {
      if (steps.length) {
        setShortcutState('ok');
        setPaste('');
        toast(`${stepsNote || 'Steps saved'}; no sleep in Apple Health yet`);
        return nav.pop();
      }
      // The shortcut ran but Health had nothing (no watch, or no sleep schedule).
      if (/^\s*ZORO-(SLEEP2|HEALTH1)/i.test(text) && !/\d{4}-\d{2}-\d{2}/.test(text)) return toast('Nothing in Apple Health yet');
      return toast(/ZORO-(SLEEP|HEALTH)/i.test(text) ? 'Couldn’t read last night' : 'Run the shortcut first');
    }
    await saveSleep(s, db);
    setShortcutState('ok');
    setPaste('');
    toast(`Saved ${formatMinutes(s.minutes)}${stepsNote ? ` and ${stepsNote}` : ''}`);
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
    if (!s) return toast('Those times don’t work');
    await saveSleep(s, db);
    toast(`Saved ${formatMinutes(s.minutes)}`);
    nav.pop();
  };

  return (
    <Page className="tab-safe">
      <Header title="Log Sleep" onBack={nav.pop} />

      {/* Manual: drag bedtime and wake-up on the dial, as in Health's sleep schedule. */}
      <div className="fit-stack">
        <FitCard title="Last Night" className="is-log sleep-manual">
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
          <div className="sleep-goal">{span >= settings.sleepTargetMin ? 'You met your sleep goal.' : `That’s ${hrMin(settings.sleepTargetMin - span)} short of your sleep goal.`}</div>
          <Btn size="lg" className="sleep-save" onClick={() => void saveManual()}>
            Save
          </Btn>
        </FitCard>
      </div>
      <div className="fit-stack">
        {/* From Apple Health: the shortcut copies last night's sleep, then paste it here. */}
        <FitCard title="Import from Apple Health" className="is-log">
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
        </FitCard>
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
    </Page>
  );
}
