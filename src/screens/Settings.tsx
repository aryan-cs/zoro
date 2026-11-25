import { Dialog, DialogButton, Page } from 'konsta/react';
import { useEffect, useRef, useState } from 'react';
import { carbTarget, nextMonday } from '../core/calc';
import { saveSettings } from '../core/db';
import { addSampleWeek, exportAll, importAll, removeSampleData, today } from '../core/store';
import type { Phase, Settings } from '../core/types';
import { Btn, Field, fmt, Header, Row, Section, Seg, SheetPage, timeAgo, useSettings, useToast } from '../ui/kit';
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
      toast(result === 'restored' ? 'Backup restored' : result === 'saved' ? 'Backup connected' : 'Choose a backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const conflict = status.state === 'conflict' ? status : null;

  return (
    <>
      <Section title="Cloud Backup">
        {status.state === 'off' ? (
          <Row title="GitHub Backup" chevron onClick={() => setOpen(true)} />
        ) : (
          <>
            <Row
              title="Backup"
              right={
                status.state === 'saving' ? (
                  'Saving…'
                ) : status.state === 'error' ? (
                  <span className="text-[#ff453a]">Not saved</span>
                ) : status.state === 'conflict' ? (
                  <span className="text-[#ff9f0a]">Choose backup</span>
                ) : (
                  `Saved ${timeAgo(status.lastSavedAt)}`
                )
              }
            />
            <Row accent title="Back Up Now" onClick={() => void backupNow()} />
            <Row danger title="Disconnect" onClick={() => disconnect()} />
          </>
        )}
      </Section>
      {status.state === 'error' && <p role="alert" className="mx-8 mt-2 text-sm text-[#ff453a]">{status.message}</p>}

      <SheetPage opened={open} onClose={() => setOpen(false)} title="GitHub Backup">
        <Section title="1. Create Token">
          <Row accent title="Create Token" chevron onClick={() => window.open(tokenUrl, '_blank')} />
        </Section>
        <ol className="mx-8 mt-2 list-inside list-decimal space-y-1 text-sm text-white/60">
          <li>Repository access: Only select repositories → {repo.split('/')[1] || 'zoro-data'}.</li>
          <li>Contents: Read and write.</li>
          <li>Generate token, then copy it.</li>
        </ol>
        <Section title="2. Connect">
          <Field label="Key" secret placeholder="github_pat_…" value={token} onChange={setToken} wide />
          <Field label="Repo" value={repo} onChange={setRepo} wide />
        </Section>
        {error && <p role="alert" className="mx-8 mt-2 text-sm text-[#ff453a]">{error}</p>}
        <div className="mx-4 mt-4">
          <Btn kind="tint" size="lg" disabled={busy || token.trim().length < 20} onClick={() => void submit()}>
            {busy ? 'Connecting…' : 'Connect'}
          </Btn>
        </div>
      </SheetPage>

      <Dialog
        opened={!!conflict}
        title="Choose Backup"
        content={
          conflict
            ? `GitHub backup: ${new Date(conflict.remote.backup.exportedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
            : ''
        }
        buttons={
          <>
            <DialogButton onClick={() => void resolveConflict('phone').then(() => toast('Backup saved'))}>This iPhone</DialogButton>
            <DialogButton strong onClick={() => void resolveConflict('github').then(() => toast('Restored from GitHub'))}>
              GitHub
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
      } catch (err) {
        // Cancel means cancel; only fall back to a download if sharing itself failed.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        toast('Could not open the share sheet.');
      }
      return;
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
        <Field label="Program Start" type="date" value={settings.programStart} onChange={(v) => v && void saveSettings({ programStart: nextMonday(v) })} />
        <Row title="Days per Week" right={<Seg className="w-28" value={settings.daysPerWeek} onChange={(d) => void saveSettings({ daysPerWeek: d })} options={[[4, '4'], [5, '5']]} />} />
        <NumSetting label="Bench Training Max (lb)" k="benchMax" settings={settings} />
        <Field label="Bench Cycle Start" type="date" value={settings.benchBlockStart} onChange={(v) => v && void saveSettings({ benchBlockStart: v })} />
        <NumSetting label="Dumbbell Max (lb)" k="dumbbellMax" settings={settings} />
      </Section>

      <Section title="Food Targets">
        <Row title="Phase" right={
          <Seg<Phase>
            className="w-52 max-w-full"
            value={settings.phase}
            onChange={(p) => void saveSettings({ phase: p, targetRate: p === 'cut' ? -0.875 : p === 'bulk' ? 0.375 : 0 })}
            options={[
              ['cut', 'Cut'],
              ['maintain', 'Maintain'],
              ['bulk', 'Bulk'],
            ]}
          />
        } />
        <NumSetting label="Weekly Change (lb)" k="targetRate" settings={settings} />
        <NumSetting label="Calories" k="kcalTarget" settings={settings} />
        <NumSetting label="Protein (g)" k="proteinTarget" settings={settings} />
        <NumSetting label="Fat (g)" k="fatTarget" settings={settings} />
        <Row title="Carbs" right={`${fmt(carbs)} g`} />
        <NumSetting label="Water (oz)" k="waterTargetOz" settings={settings} />
      </Section>

      <Section title="Food Data">
        <Field label="USDA Key" placeholder="Optional" value={usda} onChange={(v) => setUsda(v.trim())} onBlur={() => void saveSettings({ usdaApiKey: usda || undefined })} wide />
      </Section>

      <CloudBackup />

      <Section title="Sleep">
        <Row title="Apple Health Shortcut" chevron onClick={() => setInstalling(true)} />
        <Row title="Shortcut Setup" chevron onClick={() => nav.push({ name: 'sleepSetup' })} />
      </Section>

      <Section title="Testing">
        <Row
          accent
          title="Add Sample Week"
          onClick={async () => {
            const n = await addSampleWeek();
            toast(`Added ${n} sample foods`);
          }}
        />
        <Row
          danger
          title="Remove Sample Data"
          onClick={async () => {
            const n = await removeSampleData();
            toast(n ? `Removed ${n} sample foods` : 'No sample data');
          }}
        />
      </Section>

      <Section title="This Phone">
        <Row title="Storage" right={persisted === null ? '…' : persisted ? 'Protected' : 'May be cleared'} />
        <Row accent title="Export Backup" onClick={() => void exportData()} />
        <Row accent title="Restore Backup" onClick={() => fileInput.current?.click()} />
      </Section>
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickImport(e.target.files?.[0])} />
      <p className="mx-8 mb-2 mt-6 text-center text-[13px] text-white/60">Food data: USDA FoodData Central · Open Food Facts (ODbL)</p>

      <InstallShortcutDialog opened={installing} onClose={() => setInstalling(false)} onManual={() => nav.push({ name: 'sleepSetup' })} />
      <Dialog
        opened={pendingImport !== null}
        title="Replace Everything?"
        content="This replaces all data on this iPhone."
        buttons={
          <>
            <DialogButton onClick={() => setPendingImport(null)}>Cancel</DialogButton>
            <DialogButton
              strong
              className="destructive"
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
              Replace
            </DialogButton>
          </>
        }
      />
    </Page>
  );
}
