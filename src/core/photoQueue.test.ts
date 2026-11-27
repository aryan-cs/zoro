import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiError, type GenerateResult } from './gemini';
import type { PhotoDeps, PhotoLog } from './photoLog';
import { canWait, jobName, LATER_MIN, MAX_TRIES, PhotoDB, PhotoQueue, type PhotoJob, type QueueEnv } from './photoQueue';

const reply = (o: unknown): GenerateResult => ({ text: JSON.stringify(o), urls: [], sources: [], model: 'test' });
const image = { mimeType: 'image/jpeg', data: 'AAAA' };
const BOWL = { name: 'Chicken Bowl', quantity: 1, serving: '1 bowl', grams: 500, kcal: 800, protein: 50, carbs: 90, fat: 25, fiber: 3, fromPhoto: false };
const HOMEMADE = { kind: 'meal', items: [BOWL] };
const ORDER = { kind: 'order', restaurant: 'Example Teriyaki', items: [BOWL] };

/** Waits until a job matches (the queue runs on its own); `gone` is a photo that was read and added. */
const gone = (j: PhotoJob | undefined) => j === undefined;
async function until(db: PhotoDB, id: number, ok: (j: PhotoJob | undefined) => boolean): Promise<PhotoJob | undefined> {
  for (let i = 0; i < 200; i++) {
    const j = await db.jobs.get(id);
    if (ok(j)) return j;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`job ${id} never got there: ${JSON.stringify(await db.jobs.get(id))}`);
}

let db: PhotoDB;
let env: QueueEnv & { isHidden: boolean; isOnline: boolean; added: PhotoLog[]; done: PhotoJob[] };
let generate: PhotoDeps['generate'];
let search: PhotoDeps['search'];
let generated: number;

function makeQueue() {
  env = {
    db,
    isHidden: false,
    isOnline: true,
    added: [],
    done: [],
    key: () => 'test-key',
    hidden: () => env.isHidden,
    online: () => env.isOnline,
    add: async (log) => void env.added.push(log),
    onDone: (j) => env.done.push(j),
    deps: (_key, extra) => ({
      generate: (a) => {
        generated++;
        return generate(a);
      },
      search: (a) => search!(a),
      ...extra,
    }),
  };
  return new PhotoQueue(env);
}

beforeEach(() => {
  db = new PhotoDB(`photos-${Math.random()}`);
  generated = 0;
  generate = async () => reply(HOMEMADE);
  search = async () => ({ args: { sources: [], items: [] }, sources: [], transcript: '' });
});

describe('photo queue', () => {
  it('reads a photo in the background and logs its foods into Other', async () => {
    const q = makeQueue();
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    expect(await db.images.get(id)).toMatchObject(image);
    await until(db, id, gone);
    // No date on the photo: the day you were on.
    expect(env.added).toMatchObject([{ date: '2026-11-20', meal: 'unsorted', foods: [{ quantity: 1, food: { name: 'Chicken Bowl' } }] }]);
    expect(env.done.map((j) => j.id)).toEqual([id]);
    expect(await db.images.count()).toBe(0);
  });

  it('logs into the meal you picked the photo from', async () => {
    const q = makeQueue();
    const id = await q.add(image, 'data:thumb', '2026-11-20', 'dinner');
    await until(db, id, gone);
    expect(env.added[0].meal).toBe('dinner');
  });

  it('adds nothing from a menu', async () => {
    const q = makeQueue();
    generate = async () => reply({ kind: 'menu', items: [{ ...BOWL, quantity: 0 }] });
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    expect((await until(db, id, (j) => j?.status === 'failed'))?.error?.title).toBe('Nothing to Add');
    expect(env.added).toEqual([]);
  });

  it('picks up from the last step when iOS pauses it, without reading the photo again', async () => {
    const q = makeQueue();
    generate = async () => reply(ORDER);
    let searches = 0;
    search = async () => {
      // The app goes to the background mid-search, which cuts the search off.
      if (++searches === 1) q.paused();
      return { args: { sources: [], items: [] }, sources: [], transcript: '' };
    };
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    await until(db, id, gone);
    expect(searches).toBe(2); // looked again
    expect(generated).toBe(1); // but read the photo only once
    expect(env.done[0]).toMatchObject({ brand: 'Example Teriyaki', tries: 1 });
    expect(jobName(env.done[0])).toBe('Example Teriyaki');
  });

  it('stops retrying a photo that keeps getting cut off', async () => {
    const q = makeQueue();
    generate = async () => {
      q.paused();
      throw new AiError('Can’t reach Gemini.', 'network');
    };
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    const job = await until(db, id, (j) => j?.status === 'failed');
    expect(generated).toBe(MAX_TRIES);
    expect(job?.error?.title).toBe('Can’t Reach Gemini');
  });

  it('says why one failed, and tries again when asked', async () => {
    const q = makeQueue();
    generate = async () => {
      throw new AiError('quota', 'quota');
    };
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    const failed = await until(db, id, (j) => j?.status === 'failed');
    expect(failed?.error).toMatchObject({ kind: 'quota', title: 'Free Limit Reached' });
    generate = async () => reply(HOMEMADE);
    await q.retry(id);
    await until(db, id, gone);
    expect(env.added).toHaveLength(1);
  });

  it('queues a photo for later, waiting out the quota until it goes through', async () => {
    const q = makeQueue();
    generate = async () => {
      throw new AiError('quota', 'quota');
    };
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    const failed = await until(db, id, (j) => j?.status === 'failed');
    expect(canWait(failed!)).toBe(true);
    await q.later(id);
    const queued = await db.jobs.get(id);
    expect(queued).toMatchObject({ status: 'waiting', laterTries: 0 });
    expect(queued!.retryAt! - Date.now()).toBeGreaterThan(LATER_MIN[0] * 60_000 - 5_000);
    await q.pump();
    expect(generated).toBe(1); // not before its time
    // Its time comes, and the quota is still out: it waits longer instead of failing.
    await db.jobs.update(id, { retryAt: Date.now() - 1 });
    await q.pump();
    const again = await until(db, id, (j) => j?.laterTries === 1);
    expect(again).toMatchObject({ status: 'waiting' });
    expect(again!.retryAt! - Date.now()).toBeGreaterThan(LATER_MIN[1] * 60_000 - 5_000);
    // Then the quota resets.
    generate = async () => reply(HOMEMADE);
    await db.jobs.update(id, { retryAt: Date.now() - 1 });
    await q.pump();
    await until(db, id, gone);
    expect(env.added).toHaveLength(1);
  });

  it('doesn’t offer to wait out a bad key or a photo with no food', () => {
    expect(canWait({ error: { kind: 'key', title: '', message: '' } })).toBe(false);
    expect(canWait({ error: { kind: 'empty', title: '', message: '' } })).toBe(false);
    expect(canWait({ error: { kind: 'network', title: '', message: '' } })).toBe(true);
  });

  it('calls a photo with no food a failure', async () => {
    const q = makeQueue();
    generate = async () => reply({ kind: 'other', items: [] });
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    expect((await until(db, id, (j) => j?.status === 'failed'))?.error?.title).toBe('No Food Found');
  });

  it('waits for a connection, then carries on', async () => {
    const q = makeQueue();
    env.isOnline = false;
    generate = async () => {
      throw new AiError('Can’t reach Gemini.', 'network');
    };
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    await until(db, id, (j) => j?.status === 'waiting' && !!j.offline);
    env.isOnline = true;
    generate = async () => reply(HOMEMADE);
    await q.pump();
    await until(db, id, gone);
  });

  it('reads two photos at a time, the rest in turn', async () => {
    const q = makeQueue();
    let open = 0;
    let most = 0;
    generate = async () => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 20));
      open--;
      return reply(HOMEMADE);
    };
    const ids = await Promise.all([1, 2, 3, 4].map(() => q.add(image, 'data:thumb', '2026-11-20')));
    for (const id of ids) await until(db, id, gone);
    expect(most).toBe(2);
  });

  it('stops reading a photo you delete', async () => {
    const q = makeQueue();
    let release = () => {};
    generate = (a) =>
      new Promise((resolve, reject) => {
        release = () => resolve(reply(HOMEMADE));
        a.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    await until(db, id, (j) => j?.status === 'working');
    await q.remove(id);
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(await db.jobs.get(id)).toBeUndefined();
    expect(env.added).toEqual([]);
  });

  it('starts again on photos left mid-read when the app was closed', async () => {
    const id = (await db.jobs.add({ createdAt: Date.now(), thumb: 'data:thumb', date: '2026-11-20', status: 'working', step: 'read', tries: 0 })) as number;
    await db.images.put({ id, ...image });
    const q = makeQueue();
    await q.pump();
    await until(db, id, gone);
  });

  it('waits while the app is in the background', async () => {
    const q = makeQueue();
    env.isHidden = true;
    const id = await q.add(image, 'data:thumb', '2026-11-20');
    await new Promise((r) => setTimeout(r, 20));
    expect((await db.jobs.get(id))?.status).toBe('waiting');
    env.isHidden = false;
    await q.pump();
    await until(db, id, gone);
  });
});

describe('jobName', () => {
  const food = (name: string) => ({ quantity: 1, basis: 'estimate' as const, food: { name, serving: { label: '1', macros: { kcal: 1, protein: 0, carbs: 0, fat: 0 } } } });
  it('names a photo by its restaurant, else its foods', () => {
    expect(jobName({ brand: 'Blaze' })).toBe('Blaze');
    expect(jobName({ log: { kind: 'meal', date: '2026-11-20', meal: 'lunch', dated: false, timed: false, foods: [food('Salad')] } })).toBe('Salad');
    expect(jobName({ log: { kind: 'meal', date: '2026-11-20', meal: 'lunch', dated: false, timed: false, foods: [food('Salad'), food('Soup'), food('Bread')] } })).toBe('Salad + 2 More');
    expect(jobName({})).toBe('Photo');
  });
});
