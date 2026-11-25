import { Dialog, DialogButton, Page } from 'konsta/react';
import { useState } from 'react';
import { formatMinutes } from '../core/calc';
import { parseSleepImport, sleepFromTimes } from '../core/sleep';
import { saveSleep, today } from '../core/store';
import { Btn, Cell, db, Field, Header, Note, Row, Section, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

const SHORTCUT_URL = `${import.meta.env.BASE_URL}ZoroSleep.shortcut`;
const RUN_URL = 'shortcuts://run-shortcut?name=Zoro%20Sleep';
const INSTALLED_KEY = 'zoro.sleepShortcut';

export function shortcutInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Native alert that hands off to Apple's "Add Shortcut" screen. */
export function InstallShortcutDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Dialog
      opened={opened}
      onBackdropClick={onClose}
      title="Add “Zoro Sleep”?"
      content="This shortcut copies last night's sleep from Apple Health so Zoro can read it. Shortcuts will open; tap Add Shortcut, then come back."
      buttons={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton
            strong
            onClick={() => {
              try {
                localStorage.setItem(INSTALLED_KEY, '1');
              } catch {
                // Fine: we'll just offer to add it again next time.
              }
              onClose();
              // A new tab (Safari's sheet in a Home Screen app) can hand the file to Shortcuts.
              window.open(SHORTCUT_URL, '_blank');
            }}
          >
            Add
          </DialogButton>
        </>
      }
    />
  );
}

export function LogSleepScreen() {
  const nav = useNav();
  const toast = useToast();
  const [bed, setBed] = useState('23:30');
  const [wake, setWake] = useState('07:00');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(shortcutInstalled());
  const [manualPaste, setManualPaste] = useState(false);
  const [paste, setPaste] = useState('');

  const importText = async (text: string) => {
    const s = parseSleepImport(text);
    if (!s) return toast("That doesn't look like sleep from the shortcut.");
    await saveSleep(s, db);
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

      <Section title="From Apple Health">
        <Row
          accent
          title="1. Copy last night's sleep"
          onClick={() => {
            // Not added yet: offer to add it first instead of sending you to a Shortcuts error.
            if (!shortcutInstalled()) setInstalling(true);
            else window.location.href = RUN_URL;
          }}
        />
        <Row accent title="2. Paste it here" onClick={() => void pasteFromClipboard()} />
        {manualPaste && (
          <Cell className="space-y-2 py-2.5">
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
              placeholder="Touch and hold, then Paste"
              className="w-full rounded-xl bg-[rgba(118,118,128,0.24)] px-3 py-2 outline-none"
            />
            {paste.trim() && (
              <Btn kind="tint" size="lg" onClick={() => void importText(paste)}>
                Import
              </Btn>
            )}
          </Cell>
        )}
      </Section>
      <Note>
        {installed ? (
          <>
            Shortcut missing?{' '}
            <button type="button" className="text-accent" onClick={() => setInstalling(true)}>
              Add it again
            </button>
            .
          </>
        ) : (
          'Web apps can’t read Apple Health directly, so a small shortcut copies it for you. The first tap adds it.'
        )}
      </Note>

      <Section title="Or Enter It by Hand">
        <Field label="Fell asleep" type="time" value={bed} onChange={setBed} />
        <Field label="Woke up" type="time" value={wake} onChange={setWake} />
        <Row accent title="Save" onClick={() => void saveManual()} />
      </Section>

      <InstallShortcutDialog
        opened={installing}
        onClose={() => {
          setInstalling(false);
          setInstalled(shortcutInstalled());
        }}
      />
    </Page>
  );
}
