import { Dialog, DialogButton, Page } from 'konsta/react';
import { useEffect, useRef, useState } from 'react';
import { carbTarget, nextMonday } from '../core/calc';
import { saveSettings } from '../core/db';
import { exportAll, importAll, today } from '../core/store';
import type { Phase, Settings } from '../core/types';
import { Btn, Cell, Field, fmt, Header, Note, Row, Section, Seg, SheetPage, timeAgo, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { InstallShortcutDialog } from './LogSleep';
import { backupNow, connect, DEFAULT_REPO, disconnect, resolveConflict, syncConfig, useSync } from '../ui/sync';

type NumKey = 'benchMax' | 'dumbbellMax' | 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'targetRate' | 'waterTargetOz';

function NumSetting({ label, k, settings }: { label: string; k: NumKey; settings: Settings }) {
  const [v, setV] = useState(String(settings[k]));
  useEffect(() => setV(String(settings[k])), [settings, k]);
  return (
    <Field
      label={label}
      inputMode={k === 'targetRate' ? 'text' : 'decimal'}
      value={v}
      onChange={setV}
      onBlur={() => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) void saveSettings({ [k]: n } as Partial<Settings>);
        else setV(String(settings[k]));
      }}
    />
  );
}

const enc = encodeURIComponent;

function CloudBackup() {
  const toast = useToast();
  const status = useSync();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState(syncConfig()?.repo ?? DEFAULT_REPO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = repo.split('/')[0] || 'aryan-cs';
  const tokenUrl =
    `https://github.com/settings/personal-access-tokens/new?name=${enc('Zoro backup')}` +
    `&description=${enc(`Lets the Zoro app save backups to ${repo}.`)}&target_name=${enc(owner)}&expires_in=none&contents=write`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await connect({ token: token.trim(), repo: repo.trim() });
      setOpen(false);
      setToken('');
      toast(result === 'restored' ? 'Restored your data from GitHub' : result === 'saved' ? 'Connected. Backups are on.' : 'Pick which copy to keep');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const conflict = status.state === 'conflict' ? status : null;

  return (
    <>
      <Section title="Cloud backup">
        {status.state === 'off' ? (
          <Row accent title="Back up to GitHub" sub="A private repo only you can open" chevron onClick={() => setOpen(true)} />
        ) : (
          <>
            <Row
              title="Backup"
              sub={syncConfig()?.repo}
              right={
                status.state === 'saving' ? (
                  'Saving…'
                ) : status.state === 'error' ? (
                  <span className="text-[#ff453a]">Not saved</span>
                ) : status.state === 'conflict' ? (
                  <span className="text-[#ff9f0a]">Needs a choice</span>
                ) : (
                  `Saved ${timeAgo(status.lastSavedAt)}`
                )
              }
            />
            <Row accent title="Back up now" onClick={() => void backupNow()} />
            <Row danger title="Disconnect" onClick={() => disconnect()} />
          </>
        )}
      </Section>
      {status.state === 'error' ? (
        <Note className="!text-[#ff453a]">{status.message}</Note>
      ) : (
        <Note>Saves automatically a few seconds after every change. Connect once; the key stays on this phone.</Note>
      )}

      <SheetPage opened={open} onClose={() => setOpen(false)} title="Back up to GitHub">
        <Note className="mt-3">
          Your data goes to a private repo that only your GitHub account can open. You make a key that can touch only that repo, and paste it here once.
        </Note>
        <Section title="1. Make a key">
          <Row accent title="Open GitHub to create the key" chevron onClick={() => window.open(tokenUrl, '_blank')} />
        </Section>
        <Note>
          Under <b>Repository access</b>, choose <b>Only select repositories</b> → <b>{repo.split('/')[1] || 'zoro-data'}</b>. Check that <b>Contents</b> says{' '}
          <b>Read and write</b>. Tap <b>Generate token</b> and copy it.
        </Note>
        <Section title="2. Paste it">
          <Field label="Key" secret placeholder="github_pat_…" value={token} onChange={setToken} wide />
          <Field label="Repo" value={repo} onChange={setRepo} wide />
        </Section>
        {error && <Note className="!text-[#ff453a]">{error}</Note>}
        <div className="mx-4 mt-4">
          <Btn kind="tint" size="lg" disabled={busy || token.trim().length < 20} onClick={() => void submit()}>
            {busy ? 'Connecting…' : 'Connect'}
          </Btn>
        </div>
      </SheetPage>

      <Dialog
        opened={!!conflict}
        title="Which copy should Zoro keep?"
        content={
          conflict
            ? `GitHub has a copy saved ${new Date(conflict.remote.backup.exportedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} from another device. This phone has different data.`
            : ''
        }
        buttons={
          <>
            <DialogButton onClick={() => void resolveConflict('phone').then(() => toast('Saved this phone to GitHub'))}>This phone's</DialogButton>
            <DialogButton strong onClick={() => void resolveConflict('github').then(() => toast('Restored from GitHub'))}>
              GitHub's
            </DialogButton>
          </>
        }
      />
    </>
  );
}

export function SettingsScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const [installing, setInstalling] = useState(false);
  const [usda, setUsda] = useState(settings.usdaApiKey ?? '');
  useEffect(() => setUsda(settings.usdaApiKey ?? ''), [settings.usdaApiKey]);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const exportData = async () => {
    const data = JSON.stringify(await exportAll(), null, 1);
    const name = `zoro-backup-${today()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    // On iPhone the share sheet lets you save to Files or AirDrop it.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        // Share cancelled; fall through to a download.
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingImport(JSON.parse(await file.text()));
    } catch {
      toast("That file isn't a Zoro backup.");
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);

  return (
    <Page className="tab-safe">
      <Header title="Settings" onBack={nav.pop} />

      <Section title="Plan">
        <Field label="Program start" type="date" value={settings.programStart} onChange={(v) => v && void saveSettings({ programStart: nextMonday(v) })} />
        <Cell className="flex items-center justify-between py-1.5">
          <span className="text-[17px]">Days per week</span>
          <Seg className="!w-28" value={settings.daysPerWeek} onChange={(d) => void saveSettings({ daysPerWeek: d })} options={[[4, '4'], [5, '5']]} />
        </Cell>
        <NumSetting label="Bench max this block (lb)" k="benchMax" settings={settings} />
        <Field label="Bench block started" type="date" value={settings.benchBlockStart} onChange={(v) => v && void saveSettings({ benchBlockStart: v })} />
        <NumSetting label="Heaviest dumbbells (lb)" k="dumbbellMax" settings={settings} />
      </Section>

      <Section title="Food targets">
        <Cell className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-[17px]">Phase</span>
          <Seg<Phase>
            className="!w-52"
            value={settings.phase}
            onChange={(p) => void saveSettings({ phase: p, targetRate: p === 'cut' ? -0.875 : p === 'bulk' ? 0.375 : 0 })}
            options={[
              ['cut', 'Cut'],
              ['maintain', 'Maintain'],
              ['bulk', 'Bulk'],
            ]}
          />
        </Cell>
        <NumSetting label="Weekly change (lb)" k="targetRate" settings={settings} />
        <NumSetting label="Calories" k="kcalTarget" settings={settings} />
        <NumSetting label="Protein (g)" k="proteinTarget" settings={settings} />
        <NumSetting label="Fat (g)" k="fatTarget" settings={settings} />
        <Row title="Carbs (what's left)" right={`${fmt(carbs)} g`} />
        <NumSetting label="Water (oz)" k="waterTargetOz" settings={settings} />
      </Section>

      <Section title="Food data">
        <Field label="Your own USDA key" placeholder="Optional" value={usda} onChange={(v) => setUsda(v.trim())} onBlur={() => void saveSettings({ usdaApiKey: usda || undefined })} wide />
      </Section>
      <Note>Zoro comes with a USDA key for barcode scans and search. Only add your own if lookups start failing.</Note>

      <CloudBackup />

      <Section title="Sleep">
        <Row title="Add the Apple Health shortcut" chevron onClick={() => setInstalling(true)} />
        <Row title="Build it by hand instead" chevron onClick={() => nav.push({ name: 'sleepSetup' })} />
      </Section>

      <Section title="This phone">
        <Row title="Saved on this phone" right={persisted === null ? '…' : persisted ? 'Protected' : 'May be cleared'} />
        <Row accent title="Export a backup file" onClick={() => void exportData()} />
        <Row accent title="Restore from a file" onClick={() => fileInput.current?.click()} />
      </Section>
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickImport(e.target.files?.[0])} />
      <Note className="mb-2 mt-6 text-center">Zoro · food data from USDA FoodData Central and Open Food Facts (ODbL)</Note>

      <InstallShortcutDialog opened={installing} onClose={() => setInstalling(false)} />
      <Dialog
        opened={pendingImport !== null}
        onBackdropClick={() => setPendingImport(null)}
        title="Replace everything?"
        content="Restoring a backup replaces all workouts, food, water, sleep and measurements on this phone."
        buttons={
          <>
            <DialogButton onClick={() => setPendingImport(null)}>Cancel</DialogButton>
            <DialogButton
              strong
              onClick={async () => {
                try {
                  await importAll(pendingImport);
                  toast('Backup restored');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Restore failed.');
                }
                setPendingImport(null);
              }}
            >
              Restore
            </DialogButton>
          </>
        }
      />
    </Page>
  );
}
