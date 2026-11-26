import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page, Toggle } from 'konsta/react';
import { useEffect, useRef, useState } from 'react';
import { carbTarget, nextMonday } from '../core/calc';
import { saveSettings } from '../core/db';
import { addSampleWeek, exportAll, importAll, metricsOf, removeSampleData, saveMetric, today } from '../core/store';
import { GOAL_METRICS, goalMetric, goalOf, progressTo, setGoal, type GoalMetric } from '../core/goals';
import { ACTIVITY, defaultRate, weeksToGoal, type Activity } from '../core/targets';
import { useLatestWeight, useRecommendation } from '../ui/autoTargets';
import { Sym } from '../ui/Sym';
import type { Phase, Settings } from '../core/types';
import { Btn, db, Field, fmt, Header, Menu, NumberPrompt, Row, Section, Seg, SheetPage, timeAgo, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { addSleepShortcut } from './LogSleep';
import { backupNow, connect, DEFAULT_REPO, disconnect, resolveConflict, syncConfig, useSync } from '../ui/sync';

type NumKey = 'benchMax' | 'dumbbellMax' | 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'targetRate' | 'waterTargetOz';
type TargetKey = 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'fiberTarget' | 'waterTargetOz' | 'sleepTargetMin';

/** 70 → 5′10″ */
const feetInches = (inches: number) => `${Math.floor(inches / 12)}′${fmt(inches % 12, inches % 1 ? 1 : 0)}″`;

/** A daily target: editing it means you're setting your own (targets stop following the profile). */
function TargetSetting({ label, k, settings, scale = 1 }: { label: string; k: TargetKey; settings: Settings; scale?: number }) {
  const shown = (n: number | undefined) => (n === undefined ? '' : String(Math.round((n / scale) * 100) / 100));
  const [v, setV] = useState(shown(settings[k]));
  useEffect(() => setV(shown(settings[k])), [settings, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field
      label={label}
      inputMode="decimal"
      placeholder="—"
      value={v}
      onChange={setV}
      onBlur={() => {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || shown(settings[k]) === v) return setV(shown(settings[k]));
        void saveSettings({ [k]: Math.round(n * scale), autoTargets: false } as Partial<Settings>);
      }}
    />
  );
}

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
        <Section keep title="1. Create Token">
          <Row accent title="Create Token" chevron onClick={() => window.open(tokenUrl, '_blank')} />
        </Section>
        <ol className="mx-8 mt-2 list-inside list-decimal space-y-1 text-sm text-white/60">
          <li>Repository access: Only select repositories → {repo.split('/')[1] || 'zoro-data'}.</li>
          <li>Contents: Read and write.</li>
          <li>Generate token, then copy it.</li>
        </ol>
        <Section keep title="2. Connect">
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
  const [prompt, setPrompt] = useState<'height' | 'weight' | 'goal' | 'rate' | null>(null);
  const [activityMenu, setActivityMenu] = useState<DOMRect | null>(null);
  const [goalMenu, setGoalMenu] = useState<DOMRect | null>(null);
  const weight = useLatestWeight();
  const { profile, rec } = useRecommendation();

  // Footnotes, like the ones under Apple's Settings groups.
  const profileNote = settings.activity
    ? `${ACTIVITY[settings.activity].detail}. Your targets are worked out from these.`
    : 'Your targets are worked out from these.';
  // The goal: weight by default, or a measurement (waist, arm, forearm, body fat).
  const metric = goalMetric(settings);
  const gm = GOAL_METRICS[metric];
  const goal = goalOf(settings, metric);
  const measured = useLiveQuery(() => (metric === 'weight' ? Promise.resolve([]) : metricsOf(metric, 365, db)), [metric]) ?? [];
  const goalText = (v: number) => `${+v.toFixed(gm.digits)}${gm.unit === '%' ? '%' : ` ${gm.unit}`}`;
  const rate = `${fmt(Math.abs(settings.targetRate), 2)} lb a week`;
  const verb = settings.phase === 'cut' ? 'Lose' : 'Gain';
  let goalNote: string;
  if (metric === 'weight') {
    const weeks = weight && goal ? weeksToGoal(weight, goal, settings.targetRate) : null;
    goalNote =
      settings.phase === 'maintain'
        ? 'Holding your weight steady.'
        : weeks !== null && goal
          ? `About ${weeks} week${weeks === 1 ? '' : 's'} to ${goalText(goal)} at ${rate}.`
          : goal && weight
            ? `${verb} ${rate}. Your goal of ${goalText(goal)} is ${goal < weight ? 'below' : 'above'} your weight now.`
            : `${verb} ${rate}.`;
  } else {
    const p = goal !== undefined ? progressTo(measured, goal) : null;
    const lead = settings.phase === 'maintain' ? 'Holding your weight steady.' : `${verb} ${rate}.`;
    goalNote = !measured.length
      ? `${lead} Log your ${gm.label.toLowerCase()} in History › Body to follow it.`
      : !p
        ? `${lead} ${gm.label} is ${goalText(measured.at(-1)!.value)} now.`
        : `${lead} ${gm.label} is ${goalText(p.current)} now, ${goalText(Math.abs(p.toGo))} to go${p.weeks ? `: about ${p.weeks} week${p.weeks === 1 ? '' : 's'} at your recent pace` : ''}.`;
  }
  const targetsNote = !profile
    ? 'Fill in your profile and weight above and these are set for you.'
    : settings.autoTargets === false
      ? `Set by you. Recommended: ${fmt(rec!.kcal)} kcal, ${fmt(rec!.protein)} g protein.`
      : `Recommended: you burn about ${fmt(rec!.tdee)} kcal a day. Change any to set your own.`;

  return (
    <Page className="tab-safe">
      <Header title="Settings" onBack={nav.pop} />

      {/* You: what the targets are worked out from. */}
      <Section title="Profile" footer={profileNote}>
        <Row
          title="Sex"
          right={
            <Seg<'male' | 'female'>
              className="is-compact w-44"
              value={settings.sex ?? ('' as 'male')}
              onChange={(v) => void saveSettings({ sex: v })}
              options={[
                ['male', 'Male'],
                ['female', 'Female'],
              ]}
            />
          }
        />
        <Field label="Birthday" type="date" value={settings.birthDate ?? ''} onChange={(v) => void saveSettings({ birthDate: v || undefined })} />
        <Row title="Height" right={settings.heightIn ? feetInches(settings.heightIn) : <span className="text-[#8d8d93]">—</span>} chevron onClick={() => setPrompt('height')} />
        <Row title="Weight" right={weight ? `${fmt(weight, 1)} lb` : <span className="text-[#8d8d93]">—</span>} chevron onClick={() => setPrompt('weight')} />
        <Row
          title="Activity"
          right={
            <button type="button" className="row-menu" onClick={(e) => setActivityMenu(e.currentTarget.getBoundingClientRect())}>
              {settings.activity ? ACTIVITY[settings.activity].label : 'Choose'}
              <Sym name="chevron.up.chevron.down" size={12} />
            </button>
          }
        />
      </Section>

      {/* Your goal: the phase, how fast, and where you're headed. */}
      <Section title="Goal" footer={goalNote}>
        <Row
          title="Phase"
          right={
            <Seg<Phase>
              className="is-compact w-60 max-w-full"
              value={settings.phase}
              onChange={(p) => void saveSettings({ phase: p, targetRate: weight ? defaultRate(p, weight) : p === 'cut' ? -1 : p === 'bulk' ? 0.5 : 0 })}
              options={[
                ['cut', 'Cut'],
                ['maintain', 'Maintain'],
                ['bulk', 'Bulk'],
              ]}
            />
          }
        />
        {settings.phase !== 'maintain' && (
          <Row
            title={settings.phase === 'cut' ? 'Lose per Week' : 'Gain per Week'}
            right={`${fmt(Math.abs(settings.targetRate), 2)} lb`}
            chevron
            onClick={() => setPrompt('rate')}
          />
        )}
        <Row
          title="Goal"
          right={
            <button type="button" className="row-menu" onClick={(e) => setGoalMenu(e.currentTarget.getBoundingClientRect())}>
              {gm.label}
              <Sym name="chevron.up.chevron.down" size={12} />
            </button>
          }
        />
        <Row title={`Goal ${gm.label}`} right={goal !== undefined ? goalText(goal) : <span className="text-[#8d8d93]">—</span>} chevron onClick={() => setPrompt('goal')} />
      </Section>

      {/* Daily targets: recommended from the profile until you set your own. */}
      <Section title="Daily Targets" footer={targetsNote}>
        <TargetSetting label="Calories" k="kcalTarget" settings={settings} />
        <TargetSetting label="Protein (g)" k="proteinTarget" settings={settings} />
        <TargetSetting label="Fat (g)" k="fatTarget" settings={settings} />
        <Row title="Carbs (g)" right={fmt(carbs)} />
        <TargetSetting label="Fiber (g)" k="fiberTarget" settings={settings} />
        <TargetSetting label="Water (oz)" k="waterTargetOz" settings={settings} />
        <TargetSetting label="Sleep (hr)" k="sleepTargetMin" settings={settings} scale={60} />
        {settings.autoTargets === false && rec && <Row accent title="Use Recommended" onClick={() => void saveSettings({ autoTargets: true })} />}
      </Section>

      {/* The lifting program. */}
      <Section title="Training" footer="Your lifting program starts on a Monday; bench weights come from your training max.">
        <Field label="Program Start" type="date" value={settings.programStart} onChange={(v) => v && void saveSettings({ programStart: nextMonday(v) })} />
        <Row title="Days per Week" right={<Seg className="is-compact w-28" value={settings.daysPerWeek} onChange={(d) => void saveSettings({ daysPerWeek: d })} options={[[4, '4'], [5, '5']]} />} />
        <NumSetting label="Bench Training Max (lb)" k="benchMax" settings={settings} />
        <Field label="Bench Cycle Start" type="date" value={settings.benchBlockStart} onChange={(v) => v && void saveSettings({ benchBlockStart: v })} />
        <NumSetting label="Dumbbell Max (lb)" k="dumbbellMax" settings={settings} />
      </Section>

      {/* Connections: food search and Apple Health. */}
      <Section title="Connections" footer="A free USDA key adds generic foods to search. The shortcut copies last night's sleep from Apple Health.">
        <Field label="USDA Key" placeholder="Optional" value={usda} onChange={(v) => setUsda(v.trim())} onBlur={() => void saveSettings({ usdaApiKey: usda || undefined })} wide />
        <Row title="Apple Health Shortcut" chevron onClick={addSleepShortcut} />
        <Row title="Shortcut Setup" chevron onClick={() => nav.push({ name: 'sleepSetup' })} />
      </Section>

      <CloudBackup />

      <Section title="Testing" footer="Fills every screen with a sample week. Never backed up; turning it off removes it.">
        <Row
          title="Sample Data"
          right={
            <Toggle
              checked={settings.sampleData !== false}
              onChange={async () => {
                const on = settings.sampleData === false;
                await saveSettings({ sampleData: on });
                if (on) await addSampleWeek();
                else await removeSampleData();
                toast(on ? 'Sample data added' : 'Sample data removed');
              }}
            />
          }
        />
      </Section>

      <Section title="This Phone" footer={<>Food data: USDA FoodData Central · Open Food Facts (ODbL). Build {__BUILD__}</>}>
        <Row title="Storage" right={persisted === null ? '…' : persisted ? 'Protected' : 'May be cleared'} />
        <Row accent title="Export Backup" onClick={() => void exportData()} />
        <Row accent title="Restore Backup" onClick={() => fileInput.current?.click()} />
      </Section>
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickImport(e.target.files?.[0])} />

      <Menu
        anchor={activityMenu}
        onClose={() => setActivityMenu(null)}
        items={(Object.keys(ACTIVITY) as Activity[]).map((a) => ({
          label: ACTIVITY[a].label,
          icon: a === settings.activity ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => void saveSettings({ activity: a }),
        }))}
      />
      <NumberPrompt
        opened={prompt === 'height'}
        title="Height"
        unit="in"
        initial={settings.heightIn ? String(settings.heightIn) : undefined}
        min={36}
        max={96}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          void saveSettings({ heightIn: Math.round(n * 2) / 2 });
          setPrompt(null);
        }}
      />
      <NumberPrompt
        opened={prompt === 'weight'}
        title="Today's Weight"
        unit="lb"
        initial={weight ? fmt(weight, 1) : undefined}
        min={60}
        max={600}
        onCancel={() => setPrompt(null)}
        onSave={async (n) => {
          await saveMetric('weight', Math.round(n * 10) / 10, today(), db);
          setPrompt(null);
          toast('Weight saved');
        }}
      />
      <NumberPrompt
        opened={prompt === 'rate'}
        title={settings.phase === 'cut' ? 'Lose per Week' : 'Gain per Week'}
        unit="lb"
        initial={String(Math.round(Math.abs(settings.targetRate) * 100) / 100)}
        min={0.1}
        max={3}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          const r = Math.round(n * 100) / 100;
          void saveSettings({ targetRate: settings.phase === 'cut' ? -r : r });
          setPrompt(null);
        }}
      />
      <NumberPrompt
        opened={prompt === 'goal'}
        title={`Goal ${gm.label}`}
        unit={gm.unit}
        initial={goal !== undefined ? String(goal) : undefined}
        min={gm.min}
        max={gm.max}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          const step = 10 ** gm.digits;
          void saveSettings(setGoal(settings, metric, Math.round(n * step) / step));
          setPrompt(null);
        }}
      />
      <Menu
        anchor={goalMenu}
        onClose={() => setGoalMenu(null)}
        items={(Object.keys(GOAL_METRICS) as GoalMetric[]).map((m) => ({
          label: GOAL_METRICS[m].label,
          icon: m === metric ? <Sym name="checkmark" size={15} /> : undefined,
          onClick: () => void saveSettings({ goalMetric: m }),
        }))}
      />

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
