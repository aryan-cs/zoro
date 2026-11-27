import Dexie, { type EntityTable } from 'dexie';
import { AiError, type AiErrorKind } from './gemini';
import { logFromPhoto, type PhotoDeps, type PhotoLog, type PhotoRead, type PhotoStep } from './photoLog';
import type { ISODate, Meal } from './types';

/**
 * Photos waiting to be read, read in the background so you can keep using the app (or leave it).
 * Each one is saved on the phone first, so nothing is lost when iOS pauses Zoro in the background
 * or closes it: it picks up when you come back, from the last step that finished. A separate
 * database from your logs, so photos never go into the backup.
 */

/** A photo leaves the queue once it's read: its foods are logged, into Other. */
export type JobStatus = 'waiting' | 'working' | 'failed';

export interface PhotoJob {
  id?: number;
  createdAt: number;
  /** A small JPEG of the photo for its row, as a data URL. */
  thumb: string;
  /** The day you were on (used when the photo has no date printed) and the meal you picked, if any. */
  date: ISODate;
  meal?: Meal;
  status: JobStatus;
  /** While working: the step it's on, and the restaurant once it's known. */
  step?: PhotoStep;
  brand?: string;
  /** Why it's waiting: behind other photos, or for a connection. */
  offline?: boolean;
  /** Step 1's result, kept so a run that's cut short doesn't read the photo again. */
  read?: PhotoRead;
  /** What it found, once it's done (handed to onDone as the photo goes). */
  log?: PhotoLog;
  error?: { title: string; message: string; kind: AiErrorKind | 'empty' };
  /** Runs cut short so far (by iOS pausing the app, say); it gives up after MAX_TRIES. */
  tries: number;
  /** Queued for later (after running out of free quota, say): when it next tries, and how many times it has. */
  retryAt?: number;
  laterTries?: number;
}

/** The photo itself (base64 JPEG), kept apart from its row so lists stay light. */
export interface JobImage {
  id: number;
  mimeType: string;
  data: string;
}

export class PhotoDB extends Dexie {
  jobs!: EntityTable<PhotoJob, 'id'>;
  images!: EntityTable<JobImage, 'id'>;
  constructor(name = 'zoro-photos') {
    super(name);
    this.version(1).stores({ jobs: '++id, status, createdAt', images: 'id' });
  }
}

/** Two photos at a time: quick for a few receipts, gentle on the free quota. */
export const CONCURRENCY = 2;
export const MAX_TRIES = 5;
/** A run that's still going after this long is stuck (a connection iOS dropped): start it again. */
export const STUCK_MS = 4 * 60_000;
/** Queued for later, a photo tries again after 2, 10 and 30 minutes, then every hour until it works. */
export const LATER_MIN = [2, 10, 30, 60];
/** Failures worth waiting out: the free quota, a busy or unreachable Gemini, a hiccup. */
const LATER_KINDS: (AiErrorKind | 'empty')[] = ['quota', 'busy', 'network', 'other'];
export const canWait = (job: Pick<PhotoJob, 'error'>) => !!job.error && LATER_KINDS.includes(job.error.kind);

/** What the queue needs from the app; tests pass fakes. */
export interface QueueEnv {
  db: PhotoDB;
  key: () => string | null;
  deps: (key: string, extra: Partial<PhotoDeps>) => PhotoDeps;
  /** Whether the app is in the background now. */
  hidden: () => boolean;
  online: () => boolean;
  /** Log a read photo's foods. The photo then leaves the queue. */
  add: (log: PhotoLog) => Promise<void>;
  /** A photo was read and its foods added. */
  onDone?: (job: PhotoJob) => void;
}

/** A failure in words for its row and sheet. */
export function explain(err: unknown): NonNullable<PhotoJob['error']> {
  if (err instanceof AiError) {
    if (err.kind === 'key') return { kind: 'key', title: 'Gemini Key Not Accepted', message: 'Google didn’t accept your Gemini key. Check it in Settings › Connect to Gemini.' };
    if (err.kind === 'quota') return { kind: 'quota', title: 'Free Limit Reached', message: 'Your free Gemini quota is used up for now. Try again in a little while.' };
    if (err.kind === 'network') return { kind: 'network', title: 'Can’t Reach Gemini', message: 'Check your connection and try again.' };
    if (err.kind === 'blocked') return { kind: 'blocked', title: 'Couldn’t Read Photo', message: 'Gemini wouldn’t look at this photo. Try another one.' };
    return { kind: err.kind, title: 'Couldn’t Read Photo', message: err.message };
  }
  return { kind: 'other', title: 'Couldn’t Read Photo', message: err instanceof Error ? err.message : 'Something went wrong.' };
}

/** What a finished photo is called in its row: the restaurant, else its food(s). */
export function jobName(job: Pick<PhotoJob, 'log' | 'brand' | 'read'>): string {
  const brand = job.log?.restaurant ?? job.brand ?? job.read?.restaurant;
  if (brand) return brand;
  const foods = job.log?.foods ?? [];
  if (foods.length === 1) return foods[0].food.name;
  if (foods.length > 1) return `${foods[0].food.name} + ${foods.length - 1} More`;
  return 'Photo';
}

export class PhotoQueue {
  private running = new Map<number, { abort: AbortController; hidden: boolean }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private env: QueueEnv) {}

  get db() {
    return this.env.db;
  }

  /** Save a photo to read and start on it. Returns its id. */
  async add(image: { mimeType: string; data: string }, thumb: string, date: ISODate, meal?: Meal): Promise<number> {
    const { db } = this.env;
    const id = await db.transaction('rw', db.jobs, db.images, async () => {
      const id = (await db.jobs.add({ createdAt: Date.now(), thumb, date, meal, status: 'waiting', tries: 0 })) as number;
      await db.images.put({ id, ...image });
      return id;
    });
    void this.pump();
    return id;
  }

  /** Forget a photo (stopping it if it's being read). */
  async remove(id: number): Promise<void> {
    this.running.get(id)?.abort.abort();
    const { db } = this.env;
    await db.transaction('rw', db.jobs, db.images, async () => {
      await db.jobs.delete(id);
      await db.images.delete(id);
    });
  }

  /** Try a photo again now, from the last step that finished (also one queued for later). */
  async retry(id: number): Promise<void> {
    await this.env.db.jobs.update(id, { status: 'waiting', error: undefined, tries: 0, offline: false, retryAt: undefined, laterTries: undefined });
    void this.pump();
  }

  /** Queue a photo for later: it waits, then tries again on its own (LATER_MIN) until it works. */
  async later(id: number): Promise<void> {
    await this.env.db.jobs.update(id, { status: 'waiting', error: undefined, tries: 0, offline: false, retryAt: Date.now() + LATER_MIN[0] * 60_000, laterTries: 0 });
    void this.pump();
  }

  /** The app went to the background: runs going now may be cut off, so they get another go. */
  paused(): void {
    for (const r of this.running.values()) r.hidden = true;
  }

  /** Start photos that are waiting, up to CONCURRENCY at once. Safe to call any time. */
  async pump(): Promise<void> {
    if (this.env.hidden()) return;
    const { db } = this.env;
    const now = Date.now();
    const pending = (await db.jobs.where('status').anyOf('waiting', 'working').sortBy('createdAt')).filter((j) => !this.running.has(j.id!));
    // Photos queued for later wait for their time; the next one due wakes the queue.
    const next = Math.min(...pending.map((j) => (j.retryAt && j.retryAt > now ? j.retryAt : Infinity)));
    clearTimeout(this.timer);
    if (Number.isFinite(next)) this.timer = setTimeout(() => void this.pump(), next - now + 50);
    const todo = pending.filter((j) => !j.retryAt || j.retryAt <= now);
    // Checked and claimed with no await in between, so two pumps never start the same photo.
    for (const job of todo) {
      if (this.running.size >= CONCURRENCY) break;
      if (this.running.has(job.id!)) continue;
      if (job.offline && !this.env.online()) continue;
      const run = { abort: new AbortController(), hidden: this.env.hidden() };
      this.running.set(job.id!, run);
      void this.run(job, run);
    }
  }

  private async run(job: PhotoJob, run: { abort: AbortController; hidden: boolean }): Promise<void> {
    const { db } = this.env;
    const id = job.id!;
    const stuck = setTimeout(() => run.abort.abort(), STUCK_MS);
    const alive = () => !run.abort.signal.aborted;
    try {
      await db.jobs.update(id, { status: 'working', step: job.read ? 'find' : 'read', offline: false, error: undefined });
      const key = this.env.key();
      if (!key) throw new AiError('No key.', 'key');
      const image = await db.images.get(id);
      if (!image) return void (await db.jobs.delete(id));
      const deps = this.env.deps(key, {
        // Meals and dates are guessed from when you took it, not when it finished.
        now: () => new Date(job.createdAt),
        onStep: (step, brand) => void (alive() && db.jobs.update(id, { step, ...(brand ? { brand } : {}) })),
        onRead: (read) => void (alive() && db.jobs.update(id, { read, brand: read.restaurant })),
      });
      const log = await logFromPhoto(image, deps, run.abort.signal, job.read);
      const now = await db.jobs.get(id);
      if (!now) return; // removed while it ran
      // Looking up the restaurant settles for estimates when a search or document fails, as one
      // cut off by iOS pausing the app does: if it was paused, look again (from step 2).
      if ((run.hidden || this.env.hidden()) && log.restaurant && log.foods.some((f) => f.basis === 'estimate') && (now.tries ?? 0) + 1 < MAX_TRIES) {
        await db.jobs.update(id, { status: 'waiting', tries: (now.tries ?? 0) + 1 });
        return;
      }
      if (!log.foods.length) {
        await db.jobs.update(id, { status: 'failed', step: undefined, error: { kind: 'empty', title: 'No Food Found', message: 'Zoro couldn’t find any food in this photo.' } });
        return;
      }
      // A menu lists dishes but says nothing about what you had.
      if (!log.foods.some((f) => f.quantity > 0)) {
        await db.jobs.update(id, { status: 'failed', step: undefined, error: { kind: 'empty', title: 'Nothing to Add', message: 'This looks like a menu. Take a photo of your food, receipt or order instead.' } });
        return;
      }
      // Logged straight away: in Other (or the meal you picked it from), on the day printed on it
      // or else the day you were on. Tap a food there to change it, or drag it to a meal.
      const done: PhotoLog = { ...log, date: log.dated ? log.date : job.date, meal: job.meal && job.meal !== 'unsorted' ? job.meal : 'unsorted' };
      if (!(await db.jobs.get(id))) return;
      await this.env.add(done);
      await this.remove(id);
      this.env.onDone?.({ ...now, log: done });
    } catch (err) {
      const now = await db.jobs.get(id);
      if (!now) return; // removed while it ran
      const tries = (now.tries ?? 0) + 1;
      const cut = run.hidden || this.env.hidden() || run.abort.signal.aborted;
      const kind = err instanceof AiError ? err.kind : undefined;
      if (cut && tries < MAX_TRIES) {
        // iOS paused the app (or a connection hung): go again when it's back.
        await db.jobs.update(id, { status: 'waiting', tries });
      } else if (now.retryAt !== undefined && canWait({ error: explain(err) })) {
        // Queued for later and still not through (the quota hasn't reset yet): wait longer.
        const n = (now.laterTries ?? 0) + 1;
        await db.jobs.update(id, { status: 'waiting', tries: 0, laterTries: n, retryAt: Date.now() + LATER_MIN[Math.min(n, LATER_MIN.length - 1)] * 60_000 });
      } else if (kind === 'network' && !this.env.online()) {
        await db.jobs.update(id, { status: 'waiting', offline: true });
      } else {
        await db.jobs.update(id, { status: 'failed', step: undefined, error: explain(err), tries });
      }
    } finally {
      clearTimeout(stuck);
      this.running.delete(id);
      void this.pump();
    }
  }
}
