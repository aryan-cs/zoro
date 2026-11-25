import { Page } from 'konsta/react';
import { useState } from 'react';
import { formatMinutes } from '../core/calc';
import { parseSleepImport, sleepFromTimes } from '../core/sleep';
import { saveSleep, today } from '../core/store';
import { Btn, db, Field, Header, Note, Row, Section, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

export function LogSleepScreen() {
  const nav = useNav();
  const toast = useToast();
  const [bed, setBed] = useState('23:30');
  const [wake, setWake] = useState('07:00');
  const [paste, setPaste] = useState('');

  const importText = async (text: string) => {
    const s = parseSleepImport(text);
    if (!s) return toast("That doesn't look like sleep data from the Shortcut.");
    await saveSleep(s, db);
    setPaste('');
    toast(`Saved ${formatMinutes(s.minutes)}`);
    nav.pop();
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
      <Header title="Log sleep" onBack={nav.pop} />

      <Section title="From Apple Health" cardClass="p-3 space-y-2.5">
        <a href="shortcuts://run-shortcut?name=Zoro%20Sleep" className="glass-tint flex h-10 items-center justify-center rounded-full text-[15px] font-semibold text-black">
          1. Run the Zoro Sleep shortcut
        </a>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text) {
              e.preventDefault();
              void importText(text);
            }
          }}
          rows={2}
          placeholder="2. Tap here and paste"
          className="w-full rounded-2xl bg-black/5 px-3 py-2 outline-none dark:bg-white/10"
        />
        {paste.trim() && (
          <Btn kind="tint" size="lg" onClick={() => void importText(paste)}>
            Import
          </Btn>
        )}
      </Section>
      <Note>
        First time?{' '}
        <button type="button" className="text-accent" onClick={() => nav.push({ name: 'sleepSetup' })}>
          Set up the shortcut
        </button>{' '}
        (about 5 minutes).
      </Note>

      <Section title="Or enter it by hand">
        <Field label="Fell asleep" type="time" value={bed} onChange={setBed} />
        <Field label="Woke up" type="time" value={wake} onChange={setWake} />
        <Row accent title="Save" onClick={() => void saveManual()} />
      </Section>
    </Page>
  );
}
