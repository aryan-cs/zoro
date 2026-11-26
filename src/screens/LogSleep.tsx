import { Page } from 'konsta/react';
import { useEffect, useState } from 'react';
import { formatMinutes } from '../core/calc';
import { sleepFromTimes } from '../core/sleep';
import { saveSleep, today } from '../core/store';
import { hrMin } from '../core/say';
import { Btn, db, FitCard, Header, useSettings, useToast } from '../ui/kit';
import { useHealthSyncedAt } from '../ui/healthSync';
import { whenWas } from './HealthSetup';
import { useSync } from '../ui/sync';
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
  // Apple Health comes in on its own once the shortcut and its automation are set up.
  const connected = useSync().state !== 'off';
  const syncedAt = useHealthSyncedAt();

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
        {/* From Apple Health, on its own: an automation sends last night's sleep and the last two
            days' steps through the backup repo (see HealthSetup). */}
        <FitCard title="Apple Health" className="is-log">
          {!connected ? (
            <>
              <p className="health-note">Turn on Cloud Backup in Settings first. Your iPhone sends your sleep and steps to Zoro through it.</p>
              <Btn size="lg" onClick={() => nav.push({ name: 'settings' })}>
                Open Settings
              </Btn>
            </>
          ) : (
            <>
              <p className="health-note">
                {syncedAt
                  ? `Your sleep and steps come in on their own. Last brought in ${whenWas(syncedAt)}.`
                  : 'Set up the Apple Health automation once and your sleep and steps come in on their own.'}
              </p>
              <Btn size="lg" onClick={() => nav.push({ name: 'healthSetup' })}>
                {syncedAt ? 'Automation' : 'Set Up'}
              </Btn>
            </>
          )}
        </FitCard>
      </div>
    </Page>
  );
}
