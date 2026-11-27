import { geminiDeps, toInboxFoods } from '../core/photoLog';
import { jobName, PhotoDB, PhotoQueue, type PhotoJob } from '../core/photoQueue';
import { logFoods, today } from '../core/store';
import type { ISODate, Meal } from '../core/types';
import { aiKey } from './aiKey';
import { shrinkPhoto } from './photo';

/** The app's one photo queue (see core/photoQueue). */
export const photoDB = new PhotoDB();

type DoneListener = (job: PhotoJob) => void;
const listeners = new Set<DoneListener>();

/** Hear when a photo is read and its foods added. Returns a function that stops listening. */
export function onPhotoDone(fn: DoneListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** "3 foods · 1,240 kcal" for a photo that was read. */
export function jobSummary(job: PhotoJob): string {
  const foods = job.log?.foods.filter((f) => f.quantity > 0) ?? [];
  const kcal = Math.round(foods.reduce((n, f) => n + f.food.serving.macros.kcal * f.quantity, 0));
  return `${foods.length} ${foods.length === 1 ? 'food' : 'foods'} · ${kcal.toLocaleString()} kcal`;
}

/** "Added Example Teriyaki to Other" (with the day, when it isn't today). */
export function doneMessage(job: PhotoJob): string {
  const date = job.log?.date;
  const day = date && date !== today() ? ` on ${new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : '';
  const where = MEAL_NAMES[job.log?.meal ?? 'unsorted'];
  return `Added ${jobName(job)} to ${where}${day}`;
}
const MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', unsorted: 'Other' };

/** A notification for a photo that finished while Zoro was in the background (if they're allowed). */
async function notify(job: PhotoJob) {
  try {
    if (!document.hidden || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    // iOS adds "from Zoro" under the title, so the title just says what finished.
    await reg?.showNotification(`Finished analyzing ${jobName(job)}`, { body: jobSummary(job), tag: `photo-${job.id}`, icon: 'icon-192.png' });
  } catch {
    /* no notifications here: the row and the badge still show it */
  }
}

export const photoQueue = new PhotoQueue({
  db: photoDB,
  key: aiKey,
  deps: geminiDeps,
  hidden: () => typeof document !== 'undefined' && document.hidden,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  add: async (log) => void (await logFoods(toInboxFoods(log))),
  onDone: (job) => {
    void notify(job);
    listeners.forEach((fn) => fn(job));
  },
});

let started = false;
/** Start reading saved photos, and keep going whenever the app comes back or gets online. */
export function startPhotoQueue(): void {
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', () => (document.hidden ? photoQueue.paused() : void photoQueue.pump()));
  window.addEventListener('pagehide', () => photoQueue.paused());
  window.addEventListener('pageshow', () => void photoQueue.pump());
  window.addEventListener('online', () => void photoQueue.pump());
  void photoQueue.pump();
  // Photos that failed over a bad request ("Unknown name id": a saved photo's id went to Gemini
  // with it, fixed 27 Nov 2026) are read again rather than left for you to retry.
  void photoDB.jobs
    .where('status')
    .equals('failed')
    .toArray()
    .then((jobs) => Promise.all(jobs.filter((j) => j.error?.message?.includes('Unknown name')).map((j) => photoQueue.retry(j.id!))))
    .catch(() => undefined);
}

/** Save picked photos to the queue: each is made small first, then read in the background. */
export async function queuePhotos(files: Iterable<File>, date: ISODate, meal?: Meal): Promise<number> {
  let n = 0;
  for (const file of files) {
    const [image, thumb] = await Promise.all([shrinkPhoto(file), shrinkPhoto(file, 180)]);
    await photoQueue.add(image, `data:${thumb.mimeType};base64,${thumb.data}`, date, meal);
    n++;
  }
  return n;
}
