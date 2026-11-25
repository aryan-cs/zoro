import { Block, BlockTitle, Dialog, DialogButton, List, ListInput, ListItem, Navbar, Page, Segmented, SegmentedButton } from 'konsta/react';
import { useEffect, useRef, useState } from 'react';
import { carbTarget, nextMonday } from '../core/calc';
import { saveSettings } from '../core/db';
import { exportAll, importAll, today } from '../core/store';
import type { Phase, Settings } from '../core/types';
import { fmt, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

type NumKey = 'benchMax' | 'dumbbellMax' | 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'stepsTarget' | 'targetRate';

function NumSetting({ label, k, settings, step }: { label: string; k: NumKey; settings: Settings; step?: string }) {
  const [v, setV] = useState(String(settings[k]));
  useEffect(() => setV(String(settings[k])), [settings, k]);
  return (
    <ListInput
      label={label}
      type="text"
      inputMode={step === 'signed' ? 'text' : 'decimal'}
      value={v}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) void saveSettings({ [k]: n } as Partial<Settings>);
        else setV(String(settings[k]));
      }}
    />
  );
}

export function MoreScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
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
  const phases: [Phase, string][] = [
    ['cut', 'Cut'],
    ['maintain', 'Maintain'],
    ['bulk', 'Bulk'],
  ];

  return (
    <Page className="tab-safe">
      <Navbar large transparent centerTitle title="Settings" />

      <BlockTitle>Plan</BlockTitle>
      <List strong inset className="!my-2">
        <ListInput
          label="Program start (a Monday)"
          type="date"
          value={settings.programStart}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.value && void saveSettings({ programStart: nextMonday(e.target.value) })}
        />
        <ListItem
          title="Days per week"
          after={
            <Segmented strong className="w-32">
              {([4, 5] as const).map((d) => (
                <SegmentedButton key={d} active={settings.daysPerWeek === d} onClick={() => void saveSettings({ daysPerWeek: d })}>
                  {d}
                </SegmentedButton>
              ))}
            </Segmented>
          }
        />
        <NumSetting label="Bench max this block (lb)" k="benchMax" settings={settings} />
        <ListInput
          label="Bench block started"
          type="date"
          value={settings.benchBlockStart}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => e.target.value && void saveSettings({ benchBlockStart: e.target.value })}
        />
        <NumSetting label="Heaviest dumbbells at your gym (lb)" k="dumbbellMax" settings={settings} />
      </List>

      <BlockTitle>Food targets</BlockTitle>
      <List strong inset className="!my-2">
        <ListItem
          title="Phase"
          after={
            <Segmented strong className="w-56">
              {phases.map(([p, label]) => (
                <SegmentedButton
                  key={p}
                  active={settings.phase === p}
                  onClick={() => void saveSettings({ phase: p, targetRate: p === 'cut' ? -0.875 : p === 'bulk' ? 0.375 : 0 })}
                >
                  {label}
                </SegmentedButton>
              ))}
            </Segmented>
          }
        />
        <NumSetting label="Weekly weight change goal (lb, negative to lose)" k="targetRate" settings={settings} step="signed" />
        <NumSetting label="Calories" k="kcalTarget" settings={settings} />
        <NumSetting label="Protein (g)" k="proteinTarget" settings={settings} />
        <NumSetting label="Fat (g)" k="fatTarget" settings={settings} />
        <ListItem title="Carbs (what's left)" after={`${fmt(carbs)} g`} />
      </List>

      <BlockTitle>Food search</BlockTitle>
      <List strong inset className="!my-2">
        <ListInput
          label="USDA API key (free, optional)"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Paste your key"
          value={usda}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsda(e.target.value.trim())}
          onBlur={() => void saveSettings({ usdaApiKey: usda || undefined })}
        />
      </List>
      <Block className="!my-1 text-[13px] text-black/50 dark:text-white/55">
        Adds plain foods like rice and chicken to search. Get a key at{' '}
        <a className="text-[#007aff]" href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
          fdc.nal.usda.gov
        </a>
        . It stays on this phone.
      </Block>

      <BlockTitle>Sleep</BlockTitle>
      <List strong inset className="!my-2">
        <ListItem link title="Set up the Apple Health shortcut" onClick={() => nav.push({ name: 'sleepSetup' })} />
      </List>

      <BlockTitle>Your data</BlockTitle>
      <List strong inset className="!my-2">
        <ListItem title="Stored on this phone" after={persisted === null ? '…' : persisted ? 'Protected' : 'May be cleared'} />
        <ListItem link title="Back up (export)" onClick={() => void exportData()} />
        <ListItem link title="Restore from backup" onClick={() => fileInput.current?.click()} />
      </List>
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickImport(e.target.files?.[0])} />
      <Block className="!my-1 text-[13px] text-black/50 dark:text-white/55">
        Everything stays on this phone. Back up every couple of weeks and save the file to iCloud Drive.
      </Block>

      <Block className="!mt-8 text-center text-[12px] text-black/40 dark:text-white/45">
        Zoro · food data from Open Food Facts (ODbL) and USDA FoodData Central
      </Block>

      <Dialog
        opened={pendingImport !== null}
        onBackdropClick={() => setPendingImport(null)}
        title="Replace everything?"
        content="Restoring a backup replaces all workouts, food, sleep and measurements on this phone."
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
