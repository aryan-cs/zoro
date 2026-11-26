import Dexie from 'dexie';
import { useSyncExternalStore } from 'react';
import { getDB } from '../core/db';
import { checkRepo, readRemote, SyncError, writeRemote, type GitHubConfig, type Remote } from '../core/github';
import { exportAll, importAll, mergeBackup } from '../core/store';

/**
 * Automatic backup to a private GitHub repo. The token is saved on this phone, so you connect once.
 * Every change is saved to GitHub a few seconds later (and when you leave the app).
 */

const CFG_KEY = 'zoro.github';
const META_KEY = 'zoro.github.meta';
export const DEFAULT_REPO = 'aryan-cs/zoro-data';

interface Meta {
  device: string;
  sha?: string;
  dirty?: boolean;
  lastSavedAt?: number;
}

export type SyncStatus =
  | { state: 'off' }
  | { state: 'idle'; lastSavedAt?: number }
  | { state: 'saving'; lastSavedAt?: number }
  | { state: 'error'; message: string; lastSavedAt?: number }
  | { state: 'conflict'; remote: Remote; lastSavedAt?: number };

function load<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function keep(key: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage blocked; backups still run this session.
  }
}

let cfg: GitHubConfig | null = load<GitHubConfig>(CFG_KEY);
let meta: Meta = load<Meta>(META_KEY) ?? { device: crypto.randomUUID() };
keep(META_KEY, meta);
let status: SyncStatus = cfg ? { state: 'idle', lastSavedAt: meta.lastSavedAt } : { state: 'off' };

const listeners = new Set<() => void>();
function emit(next: SyncStatus): void {
  status = next;
  listeners.forEach((l) => l());
}
function saveMeta(patch: Partial<Meta>): void {
  meta = { ...meta, ...patch };
  keep(META_KEY, meta);
}

export const syncConfig = (): GitHubConfig | null => cfg;

export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

let timer: number | undefined;
let quietUntil = 0;
let changes = 0;
let running: Promise<void> | null = null;

/** A copy set up for you on a computer (profile, goals, starting weights), not another phone's
 * history: it merges into this phone instead of asking which to keep. */
const fromSetup = (r: Remote): boolean => r.backup.device === 'setup';

function schedule(ms: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void backupNow(), ms);
}

function onChange(): void {
  if (Date.now() < quietUntil) return;
  changes++;
  if (!meta.dirty) saveMeta({ dirty: true });
  if (cfg) schedule(8000);
}

export function backupNow(): Promise<void> {
  if (!cfg || status.state === 'conflict') return Promise.resolve();
  if (running) return running;
  const current = cfg;
  running = (async () => {
    const seen = changes;
    emit({ state: 'saving', lastSavedAt: meta.lastSavedAt });
    try {
      let backup = { ...(await exportAll(getDB())), device: meta.device };
      let sha: string;
      try {
        sha = await writeRemote(current, backup, meta.sha);
      } catch (err) {
        if (!(err instanceof SyncError) || err.kind !== 'conflict') throw err;
        const remote = await readRemote(current);
        if (remote && fromSetup(remote)) {
          await mergeBackup(remote.backup, getDB());
          backup = { ...(await exportAll(getDB())), device: meta.device };
        } else if (remote && remote.backup.device !== meta.device) {
          // Someone else's copy (another phone, or Safari instead of the Home Screen app): ask first.
          emit({ state: 'conflict', remote, lastSavedAt: meta.lastSavedAt });
          return;
        }
        sha = await writeRemote(current, backup, remote?.sha);
      }
      saveMeta({ sha, lastSavedAt: Date.now(), dirty: changes !== seen });
      emit({ state: 'idle', lastSavedAt: meta.lastSavedAt });
      if (changes !== seen) schedule(4000);
    } catch (err) {
      emit({ state: 'error', message: err instanceof Error ? err.message : 'Backup failed.', lastSavedAt: meta.lastSavedAt });
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Anything logged on this phone (an empty, never-started workout doesn't count). */
async function hasLoggedData(): Promise<boolean> {
  const db = getDB();
  const counts = await Promise.all([db.sets.count(), db.entries.count(), db.sleep.count(), db.metrics.count(), db.water.count(), db.lifts.count(), db.activities.count()]);
  return counts.some((n) => n > 0);
}

/**
 * On open: if GitHub has a newer copy written somewhere else (another phone, or set up for you on
 * a computer), take it when this phone has nothing logged yet; otherwise ask which to keep.
 */
async function checkRemote(): Promise<void> {
  const current = cfg;
  if (!current) return;
  try {
    const remote = await readRemote(current);
    if (!remote || remote.sha === meta.sha) return;
    if (remote.backup.device === meta.device) {
      saveMeta({ sha: remote.sha });
      return;
    }
    if (fromSetup(remote)) await mergeSetup(remote);
    else if (!(await hasLoggedData())) await restore(remote);
    else emit({ state: 'conflict', remote, lastSavedAt: meta.lastSavedAt });
  } catch (err) {
    // Offline: check again next time. Anything else (an expired key, say) shows in Settings.
    if (err instanceof SyncError && err.kind !== 'network') emit({ state: 'error', message: err.message, lastSavedAt: meta.lastSavedAt });
  }
}

async function hasLocalData(): Promise<boolean> {
  const db = getDB();
  const counts = await Promise.all([db.sessions.count(), db.entries.count(), db.sleep.count(), db.metrics.count(), db.water.count()]);
  return counts.some((n) => n > 0);
}

/** Merge a set-up copy in, then save the result as this phone's backup. */
async function mergeSetup(remote: Remote): Promise<void> {
  await mergeBackup(remote.backup, getDB());
  saveMeta({ sha: remote.sha, dirty: true });
  await backupNow();
}

async function restore(remote: Remote): Promise<void> {
  quietUntil = Date.now() + 3000;
  await importAll(remote.backup, getDB());
  saveMeta({ sha: remote.sha, dirty: false, lastSavedAt: Date.now() });
  emit({ state: 'idle', lastSavedAt: meta.lastSavedAt });
}

/**
 * Connect a repo. Restores from GitHub if this phone is empty, saves to GitHub if GitHub is empty,
 * and otherwise asks which copy to keep (status becomes 'conflict').
 */
export async function connect(next: GitHubConfig): Promise<'saved' | 'restored' | 'choose'> {
  await checkRepo(next);
  const remote = await readRemote(next);
  cfg = next;
  keep(CFG_KEY, cfg);
  if (!remote) {
    saveMeta({ sha: undefined });
    await backupNow();
    return 'saved';
  }
  if (fromSetup(remote)) {
    await mergeSetup(remote);
    return 'restored';
  }
  if (!(await hasLocalData())) {
    await restore(remote);
    return 'restored';
  }
  if (remote.backup.device === meta.device) {
    saveMeta({ sha: remote.sha });
    await backupNow();
    return 'saved';
  }
  emit({ state: 'conflict', remote, lastSavedAt: meta.lastSavedAt });
  return 'choose';
}

export async function resolveConflict(choice: 'phone' | 'github'): Promise<void> {
  if (status.state !== 'conflict') return;
  const remote = status.remote;
  if (choice === 'github') {
    await restore(remote);
    return;
  }
  saveMeta({ sha: remote.sha });
  emit({ state: 'idle', lastSavedAt: meta.lastSavedAt });
  await backupNow();
}

export function disconnect(): void {
  cfg = null;
  keep(CFG_KEY, null);
  saveMeta({ sha: undefined });
  window.clearTimeout(timer);
  emit({ state: 'off' });
}

let started = false;
let checked: Promise<void> = Promise.resolve();
/** Resolves once the startup check of GitHub's copy is done (it may have restored it). */
export const whenChecked = (): Promise<void> => checked;
export function startSync(): void {
  if (started) return;
  started = true;
  Dexie.on('storagemutated', onChange);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cfg && meta.dirty) {
      window.clearTimeout(timer);
      void backupNow();
    }
  });
  if (cfg && meta.dirty) schedule(3000);
  checked = checkRemote();
}
