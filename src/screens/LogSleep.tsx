import { Dialog, DialogButton, ListInput, Page } from 'konsta/react';
import { useEffect, useState } from 'react';
import { formatMinutes } from '../core/calc';
import { parseSleepImport, sleepFromTimes } from '../core/sleep';
import { saveSleep, today } from '../core/store';
import { db, Field, Header, Row, Section, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

const SHORTCUT_URL = `${import.meta.env.BASE_URL}ZoroSleep.shortcut`;
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

/** Load the signed shortcut file ahead of time, so sharing it can happen right on the tap. */
let shortcutFile: Promise<File | null> | null = null;
function loadShortcutFile(): Promise<File | null> {
  shortcutFile ??= fetch(SHORTCUT_URL)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((b) => new File([b], 'Zoro Sleep.shortcut', { type: 'application/octet-stream' }))
    .catch(() => {
      shortcutFile = null;
      return null;
    });
  return shortcutFile;
}

/**
 * Native alert, then the iOS share sheet with the signed shortcut file: pick Shortcuts
 * and Apple's own "Add Shortcut" screen opens. (Opening the file as a page only shows
 * a blank sheet in a Home Screen app.)
 */
export function InstallShortcutDialog({ opened, onClose, onManual }: { opened: boolean; onClose: () => void; onManual?: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (opened) void loadShortcutFile().then(setFile);
  }, [opened]);

  const add = async () => {
    const f = file ?? (await loadShortcutFile());
    const data = f ? { files: [f], title: 'Zoro Sleep' } : null;
    if (!data || !navigator.canShare?.(data)) {
      onClose();
      toast("Set up the shortcut manually.");
      onManual?.();
      return;
    }
    try {
      await navigator.share(data);
      setShortcutState('tried');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast('Could not open the share sheet.');
    }
    onClose();
  };

  return (
    <Dialog
      opened={opened}
      title="Add Zoro Sleep?"
      content="Choose Shortcuts in the share sheet, then Add Shortcut."
      buttons={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton strong onClick={() => void add()}>
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

      <Section title="From Apple Health">
        {!installed && <Row title="Add Zoro Sleep Shortcut" chevron onClick={() => setInstalling(true)} />}
        <Row
          accent
          title="1. Copy Sleep"
          onClick={() => {
            // Not added yet: offer to add it first instead of sending you to a Shortcuts error.
            if (shortcutState() === 'none') setInstalling(true);
            else window.location.href = RUN_URL;
          }}
        />
        <Row accent title="2. Paste Sleep" onClick={() => void pasteFromClipboard()} />
        {manualPaste && (
          <>
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
            {paste.trim() && (
              <Row accent title="Import" onClick={() => void importText(paste)} />
            )}
          </>
        )}
      </Section>

      <Section title="Manual">
        <Field label="Fell Asleep" type="time" value={bed} onChange={setBed} />
        <Field label="Woke Up" type="time" value={wake} onChange={setWake} />
        <Row accent title="Save" onClick={() => void saveManual()} />
      </Section>

      <InstallShortcutDialog
        onManual={() => nav.push({ name: 'sleepSetup' })}
        opened={installing}
        onClose={() => {
          setInstalling(false);
          setInstalled(shortcutInstalled());
        }}
      />
    </Page>
  );
}
