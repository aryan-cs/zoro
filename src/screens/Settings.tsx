import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page, Toggle } from 'konsta/react';
import { disableRestPush, enableRestPush, restPushError, restPushOn, restPushSupported } from '../ui/restPush';
import { useEffect, useRef, useState } from 'react';
import { carbTarget, nextMonday } from '../core/calc';
import { saveSettings } from '../core/db';
import { exportAll, importAll, metricsOf, saveMetric, today } from '../core/store';
import { GOAL_METRICS, goalMetric, goalOf, progressTo, setGoal, type GoalMetric } from '../core/goals';
import { amount, hrMin, num, rough, sentences, span } from '../core/say';
import { ACTIVITY, defaultRate, timeInBedFor, weeksToGoal, type Activity } from '../core/targets';
import { useLatestWeight, useRecommendation } from '../ui/autoTargets';
import { Sym } from '../ui/Sym';
import type { Phase, Settings } from '../core/types';
import { Btn, db, Field, fmt, Header, Menu, NumberPrompt, Row, Section, Seg, SheetPage, timeAgo, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useHealthSyncedAt } from '../ui/healthSync';
import { backupNow, connect, DEFAULT_REPO, disconnect, resolveConflict, syncConfig, useSync } from '../ui/sync';
import { checkKey } from '../core/gemini';
import { setAiKey, useAiKey } from '../ui/aiKey';

type NumKey = 'benchMax' | 'benchGoal' | 'dumbbellMax' | 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'targetRate' | 'waterTargetOz';
type TargetKey = 'kcalTarget' | 'proteinTarget' | 'fatTarget' | 'fiberTarget' | 'waterTargetOz' | 'waterTrainingOz' | 'sleepTargetMin';

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
  // The bench goal is 225 until you change it.
  const shown = () => String(settings[k] ?? (k === 'benchGoal' ? 225 : ''));
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown()), [settings, k]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field
      label={label}
      inputMode={k === 'targetRate' ? 'text' : 'decimal'}
      value={v}
      onChange={setV}
      onBlur={() => {
        const n = parseFloat(v);
        if (Number.isFinite(n)) void saveSettings({ [k]: n } as Partial<Settings>);
        else setV(shown());
      }}
    />
  );
}

const enc = encodeURIComponent;

/** Connect to USDA: a free FoodData Central key, so search finds generic foods too. */
function UsdaSheet({ opened, onClose, saved }: { opened: boolean; onClose: () => void; saved?: string }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (opened) {
      setKey('');
      setError(null);
    }
  }, [opened]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key.trim())}&query=apple&pageSize=1`);
      if (res.status === 401 || res.status === 403) throw new Error('That key didn’t work. Check it and try again.');
      await saveSettings({ usdaApiKey: key.trim() });
      toast('USDA is connected');
      onClose();
    } catch (err) {
      setError(err instanceof TypeError ? 'Couldn’t reach USDA. Check your connection.' : err instanceof Error ? err.message : 'Couldn’t check the key.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetPage opened={opened} onClose={onClose} title="Connect to USDA" closeLabel={saved ? 'Done' : 'Cancel'}>
      {saved ? (
        <Section title="Key" footer="Search includes USDA’s generic foods.">
          <Row title="USDA Key" right="Saved" />
          <Row
            danger
            title="Remove Key"
            onClick={() => {
              void saveSettings({ usdaApiKey: undefined });
              toast('Key removed');
            }}
          />
        </Section>
      ) : (
        <>
          <Section keep title="1. Create Key">
            <Row accent title="Get a Free Key" chevron onClick={() => window.open('https://fdc.nal.usda.gov/api-key-signup/', '_blank')} />
          </Section>
          <ol className="mx-8 mt-2 list-inside list-decimal space-y-1 text-sm text-white/60">
            <li>Enter your name and email.</li>
            <li>The key arrives by email; copy it.</li>
          </ol>
          <Section keep title="2. Paste Key" footer="Search then includes USDA’s generic foods, like raw chicken or rice.">
            <Field label="Key" secret placeholder="Paste Key" value={key} onChange={setKey} wide />
          </Section>
          {error && <p role="alert" className="mx-8 mt-2 text-sm text-[#ff453a]">{error}</p>}
          <div className="mx-4 mt-4">
            <Btn kind="tint" size="lg" disabled={busy || key.trim().length < 20} onClick={() => void save()}>
              {busy ? 'Checking…' : 'Save Key'}
            </Btn>
          </div>
        </>
      )}
    </SheetPage>
  );
}

/**
 * Photo Logging: your free Gemini key, pasted once. Kept on this phone only (aiKey.ts), so it's
 * never in a backup.
 */
function PhotoLoggingSheet({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const toast = useToast();
  const saved = useAiKey();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (opened) {
      setKey('');
      setError(null);
    }
  }, [opened]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await checkKey(key.trim());
      setAiKey(key.trim());
      toast('Photo logging is on');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t check the key.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetPage opened={opened} onClose={onClose} title="Connect to Gemini" closeLabel={saved ? 'Done' : 'Cancel'}>
      {saved ? (
        <Section title="Key" footer="Your Gemini key is saved on this iPhone only. It isn’t part of your backup.">
          <Row title="Gemini Key" right="Saved" />
          <Row
            danger
            title="Remove Key"
            onClick={() => {
              setAiKey(null);
              toast('Key removed');
            }}
          />
        </Section>
      ) : (
        <>
          <Section keep title="1. Create Key">
            <Row accent title="Get a Free Key" chevron onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')} />
          </Section>
          <ol className="mx-8 mt-2 list-inside list-decimal space-y-1 text-sm text-white/60">
            <li>Sign in to Google AI Studio.</li>
            <li>Create API Key, then copy it.</li>
            <li>The free tier is enough; no card needed.</li>
          </ol>
          <Section keep title="2. Paste Key" footer="Saved on this iPhone only, never in your backup. Photos go to Google’s Gemini to read.">
            <Field label="Key" secret placeholder="Paste Key" value={key} onChange={setKey} wide />
          </Section>
          {error && <p role="alert" className="mx-8 mt-2 text-sm text-[#ff453a]">{error}</p>}
          <div className="mx-4 mt-4">
            <Btn kind="tint" size="lg" disabled={busy || key.trim().length < 20} onClick={() => void save()}>
              {busy ? 'Checking…' : 'Save Key'}
            </Btn>
          </div>
        </>
      )}
    </SheetPage>
  );
}

/**
 * Connect to GitHub: off, it walks you through making a token and connecting; on, it shows the
 * last backup with Back Up Now and Disconnect. The choose-a-backup alert lives here too.
 */
function GitHubSheet({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const toast = useToast();
  const status = useSync();
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
      onClose();
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
      <SheetPage opened={opened} onClose={onClose} title="Connect to GitHub" closeLabel={status.state === 'off' ? 'Cancel' : 'Done'}>
        {status.state !== 'off' ? (
          <>
            <Section title="Backup" footer={`Everything you log is saved to ${syncConfig()?.repo ?? repo} on its own.`}>
              <Row
                title="Last Backup"
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
            </Section>
            {status.state === 'error' && <p role="alert" className="mx-8 mt-2 text-sm text-[#ff453a]">{status.message}</p>}
          </>
        ) : (
          <>
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
          </>
        )}
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
  const healthSyncedAt = useHealthSyncedAt();
  const toast = useToast();
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const gemini = useAiKey();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [usdaSheet, setUsdaSheet] = useState(false);
  const [githubSheet, setGithubSheet] = useState(false);
  // Rest notifications, on this phone (a tap turns them on: iOS asks for permission then).
  const [restPush, setRestPush] = useState(() => restPushOn());
  const backup = useSync();
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
        toast('Couldn’t open the share sheet');
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
      toast('That file isn’t a Zoro backup');
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const [prompt, setPrompt] = useState<'height' | 'weight' | 'goal' | 'rate' | null>(null);
  const [activityMenu, setActivityMenu] = useState<DOMRect | null>(null);
  const [goalMenu, setGoalMenu] = useState<DOMRect | null>(null);
  const weight = useLatestWeight();
  const { profile, rec, measured: burnMeasured } = useRecommendation();

  // Footnotes, like the ones under Apple's Settings groups.
  // Footnotes, like the ones under Apple's Settings groups, written from your numbers.
  const profileNote = sentences(settings.activity && ACTIVITY[settings.activity].detail, 'Your daily targets are based on this.');

  // The goal: weight by default, or a measurement (waist, arm, forearm, body fat).
  const metric = goalMetric(settings);
  const gm = GOAL_METRICS[metric];
  const goal = goalOf(settings, metric);
  const measured = useLiveQuery(() => (metric === 'weight' ? Promise.resolve([]) : metricsOf(metric, 365, db)), [metric]) ?? [];
  const what = gm.label.toLowerCase();
  const rate = rough(settings.targetRate, 'lb');
  const aim =
    settings.phase === 'maintain' ? 'You’re keeping your weight steady.' : `You’re aiming to ${settings.phase === 'cut' ? 'lose' : 'gain'} about ${rate} a week.`;
  let goalNote: string;
  if (metric === 'weight') {
    const weeks = weight && goal ? weeksToGoal(weight, goal, settings.targetRate) : null;
    goalNote =
      settings.phase === 'maintain' || !goal || !weight
        ? aim
        : weeks !== null
          ? `At about ${rate} a week, you’ll reach ${amount(goal, 'lb')} in ${span(weeks)}.`
          : Math.abs(goal - weight) < 0.5
            ? `You’re at your goal of ${amount(goal, 'lb')}.`
            : `${aim} Your goal of ${amount(goal, 'lb')} is ${goal < weight ? 'below' : 'above'} your current weight, so you won’t get there this way.`;
  } else {
    const p = goal !== undefined ? progressTo(measured, goal) : null;
    const at = (v: number) => amount(v, gm.unit, gm.digits);
    goalNote = sentences(
      aim,
      !measured.length
        ? `Log your ${what} in History › Body to track it here.`
        : !p
          ? `Your ${what} is ${at(measured.at(-1)!.value)}.`
          : Math.abs(p.toGo) < 10 ** -gm.digits
            ? `Your ${what} is at your goal of ${at(goal!)}.`
            : `Your ${what} is ${at(p.current)}, ${at(Math.abs(p.toGo))} from your goal${p.weeks ? `, which you’ll reach in ${span(p.weeks)} at your recent pace` : ''}.`,
    );
  }
  const plan = settings.phase === 'maintain' ? 'stay at your weight' : `${settings.phase === 'cut' ? 'lose' : 'gain'} about ${rate} a week`;
  const targetsNote = !profile
    ? 'Fill in your profile above and these will be set for you.'
    : settings.autoTargets === false
      ? `You set these yourself. For your profile, we’d suggest ${num(rec!.kcal, 0)} kcal with ${amount(rec!.protein, 'g')} of protein.`
      : `${burnMeasured ? 'Your last four weeks of food and weigh-ins show you burn' : 'You burn'} about ${num(Math.round(rec!.tdee / 10) * 10, 0)} kcal a day, so these are set to help you ${plan}. Sleeping ${hrMin(settings.sleepTargetMin)} takes about ${hrMin(timeInBedFor(settings.sleepTargetMin))} in bed. Change any of them to set your own.`;

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
        <Row title={`Goal ${gm.label}`} right={goal !== undefined ? amount(goal, gm.unit, gm.digits) : <span className="text-[#8d8d93]">—</span>} chevron onClick={() => setPrompt('goal')} />
      </Section>

      {/* Daily targets: recommended from the profile until you set your own. */}
      <Section title="Daily Targets" footer={targetsNote}>
        <TargetSetting label="Calories" k="kcalTarget" settings={settings} />
        <TargetSetting label="Protein (g)" k="proteinTarget" settings={settings} />
        <TargetSetting label="Fat (g)" k="fatTarget" settings={settings} />
        <Row title="Carbs (g)" right={fmt(carbs)} />
        <TargetSetting label="Fiber (g)" k="fiberTarget" settings={settings} />
        <TargetSetting label="Water (oz)" k="waterTargetOz" settings={settings} />
        <TargetSetting label="Lifting Days, Extra (oz)" k="waterTrainingOz" settings={settings} />
        <TargetSetting label="Sleep (hr)" k="sleepTargetMin" settings={settings} scale={60} />
        {settings.autoTargets === false && rec && <Row accent title="Use Recommended" onClick={() => void saveSettings({ autoTargets: true })} />}
      </Section>

      {/* The lifting program. */}
      <Section
        title="Training"
        footer="Your program starts on a Monday. Week 1’s first bench set works out your real max, and each test day raises it. With 4 days a week, Saturday’s arm day is optional; with 5 it’s part of the week."
      >
        <Field label="Program Start" type="date" value={settings.programStart} onChange={(v) => v && void saveSettings({ programStart: nextMonday(v) })} />
        <Row title="Days per Week" right={<Seg className="is-compact w-28" value={settings.daysPerWeek} onChange={(d) => void saveSettings({ daysPerWeek: d })} options={[[4, '4'], [5, '5']]} />} />
        <NumSetting label="Bench Starting Max (lb)" k="benchMax" settings={settings} />
        <NumSetting label="Bench Goal (lb)" k="benchGoal" settings={settings} />
        <Field label="Bench Plan Start" type="date" value={settings.benchBlockStart} onChange={(v) => v && void saveSettings({ benchBlockStart: v })} />
        <NumSetting label="Heaviest Dumbbells (lb)" k="dumbbellMax" settings={settings} />
      </Section>

      {/* Connections: each row opens its own page to connect, or to see and undo it. */}
      <Section
        title="Connections"
        footer="A free USDA key adds generic foods to search. A free Gemini key lets Zoro read receipts, orders and plates from a photo. Apple Health sends your sleep and steps to Zoro on its own. GitHub keeps a backup of everything in your private repo."
      >
        <Row title="Connect to USDA" right={settings.usdaApiKey ? 'On' : 'Off'} chevron onClick={() => setUsdaSheet(true)} />
        <Row title="Connect to Gemini" right={gemini ? 'On' : 'Off'} chevron onClick={() => setPhotoSheet(true)} />
        <Row title="Connect to Apple Health" right={healthSyncedAt ? 'On' : 'Off'} chevron onClick={() => nav.push({ name: 'healthSetup' })} />
        <Row
          title="Connect to GitHub"
          right={backup.state === 'off' ? 'Off' : backup.state === 'error' ? <span className="text-[#ff453a]">Not Saved</span> : backup.state === 'conflict' ? <span className="text-[#ff9f0a]">Choose</span> : 'On'}
          chevron
          onClick={() => setGithubSheet(true)}
        />
      </Section>
      <UsdaSheet opened={usdaSheet} onClose={() => setUsdaSheet(false)} saved={settings.usdaApiKey} />
      <PhotoLoggingSheet opened={photoSheet} onClose={() => setPhotoSheet(false)} />
      <GitHubSheet opened={githubSheet} onClose={() => setGithubSheet(false)} />

      <Section
        title="Notifications"
        footer={
          restPushSupported()
            ? 'When a rest ends while you’re in another app, Zoro tells you: “Your rest is over!” It reminds you 30 seconds, 1 minute and 2 minutes later if you haven’t started the next set.'
            : 'Open Zoro from your Home Screen to get a notification when a rest ends.'
        }
      >
        <Row
          title="Rest Timer"
          right={
            <Toggle
              checked={restPush}
              onChange={() => {
                if (restPush) {
                  disableRestPush();
                  setRestPush(false);
                  return;
                }
                void enableRestPush().then((r) => {
                  setRestPush(r === 'on');
                  if (r === 'denied') toast('Allow notifications for Zoro in Settings › Notifications');
                  else if (r === 'unsupported') toast('Open Zoro from your Home Screen first');
                  else if (r === 'failed') toast(`Couldn’t turn on notifications (${restPushError})`);
                });
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
