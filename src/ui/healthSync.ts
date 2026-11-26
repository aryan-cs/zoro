import { useSyncExternalStore } from 'react';
import { getDB } from '../core/db';
import { deleteFile, listFolder, readText } from '../core/github';
import { saveHealthImport } from '../core/store';
import { syncConfig, whenChecked } from './sync';

/**
 * Sleep and steps from Apple Health, brought in on their own. On the iPhone, a Shortcuts
 * automation runs the Zoro Health shortcut, which writes what it finds to the backup repo as
 * health/<yyyyMMdd-HHmmss>.txt. Each time Zoro opens or comes back to the front, it brings in any
 * files it hasn't seen, oldest first (so the newest wins), and clears out ones over a week old.
 */

const FOLDER = 'health';
const LAST_KEY = 'zoro.health.last'; // the newest file brought in
const STAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.txt$/;
const KEEP_DAYS = 7;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function keep(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // Storage blocked: files are brought in again next time, which changes nothing.
  }
}

/** When a file was written, from its name (the iPhone's local time). */
export function stampTime(name: string): number | null {
  const m = name.match(STAMP);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}
const stampFor = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`;
};

const listeners = new Set<() => void>();
let lastName = read(LAST_KEY);

/** When the last Health file brought in was written, live (null before the first). */
export function useHealthSyncedAt(): number | null {
  const name = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lastName,
  );
  return name ? stampTime(name) : null;
}

let running: Promise<number> | null = null;
let lastPull = 0;

/** Bring in new Health files. Returns how many. At most every 10 seconds unless `force`. */
export function pullHealth(force = false): Promise<number> {
  const cfg = syncConfig();
  if (!cfg) return Promise.resolve(0);
  if (running) return running;
  if (!force && Date.now() - lastPull < 10_000) return Promise.resolve(0);
  lastPull = Date.now();
  running = (async () => {
    try {
      await whenChecked();
      const files = (await listFolder(cfg, FOLDER)).filter((f) => STAMP.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      const fresh = files.filter((f) => f.name > (lastName ?? '')).slice(-20);
      for (const f of fresh) {
        await saveHealthImport(await readText(cfg, f.path), getDB());
        lastName = f.name;
        keep(LAST_KEY, f.name);
      }
      if (fresh.length) listeners.forEach((l) => l());
      // A week of files is plenty; a few old ones go each time.
      const cutoff = stampFor(Date.now() - KEEP_DAYS * 86_400_000);
      for (const f of files.filter((x) => x.name < cutoff && x.name <= (lastName ?? '')).slice(0, 5)) {
        await deleteFile(cfg, f, 'Remove an old Apple Health upload').catch(() => {});
      }
      return fresh.length;
    } catch {
      return 0; // offline, or GitHub unreachable: try again next time
    } finally {
      running = null;
    }
  })();
  return running;
}

let started = false;
/** Pull now and whenever Zoro comes back to the front. */
export function startHealthSync(): void {
  if (started) return;
  started = true;
  void pullHealth(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pullHealth();
  });
}
