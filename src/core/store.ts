import { matchesWords, searchBuiltin } from './builtinFoods';
import { addDays, scaleMacros, sumEntries, toISODate } from './calc';
import { getDB, getSettings, saveSettings, TABLES, type ZoroDB } from './db';
import { parseHealthImport, type DaySteps } from './sleep';
import { TEMPLATES, templateFor, templateForWeekday, withExtras, workoutFor } from './program';
import { activitySteps } from './activity';
import { planWorkout, type HistorySession, type WorkoutPlan } from './progression';
import type {
  ActivityEntry,
  ActivityKind,
  BodyMetric,
  FoodEntry,
  FoodItem,
  ISODate,
  LiftEntry,
  Macros,
  Meal,
  Settings,
  MetricType,
  SavedMeal,
  SetLog,
  SleepEntry,
  TemplateId,
  WaterEntry,
  WorkoutSession,
} from './types';

export const today = (): ISODate => toISODate(new Date());

// ---------- Workouts ----------

/** All past sessions with their sets, newest first. */
/** Workouts since `sinceDays` ago, newest first. */
export async function loadHistory(db: ZoroDB = getDB(), sinceDays = 400): Promise<HistorySession[]> {
  const since = addDays(today(), -sinceDays);
  const sessions = (await db.sessions.where('date').aboveOrEqual(since).toArray()).filter((s) => !s.sample);
  const sets = await db.sets.where('date').aboveOrEqual(since).toArray();
  const bySession = new Map<number, SetLog[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  return sessions
    .filter((s) => s.id !== undefined)
    .map((s) => ({
      sessionId: s.id!,
      date: s.date,
      templateId: s.templateId,
      deload: s.deload,
      benchStep: s.benchStep,
      sample: s.sample,
      finishedAt: s.finishedAt,
      plannedSets: s.plannedSets,
      sets: bySession.get(s.id!) ?? [],
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId - a.sessionId);
}

/** Sets entered by hand on the Lifts card in the last `sinceDays` days. */
export async function liftEntries(sinceDays = 400, db: ZoroDB = getDB()): Promise<LiftEntry[]> {
  return db.lifts.where('date').aboveOrEqual(addDays(today(), -sinceDays)).toArray();
}

/** Enter (or change) a lift's set for a day by hand: one per lift per day. */
export async function saveLiftEntry(entry: { date: ISODate; exerciseId: string; weight: number; reps: number }, db: ZoroDB = getDB()): Promise<number> {
  const existing = await db.lifts.where('[exerciseId+date]').equals([entry.exerciseId, entry.date]).first();
  const row = { ...entry, loggedAt: Date.now() };
  if (existing?.id !== undefined) {
    await db.lifts.update(existing.id, row);
    return existing.id;
  }
  return (await db.lifts.add(row)) as number;
}

export async function deleteLiftEntry(id: number, db: ZoroDB = getDB()): Promise<void> {
  await db.lifts.delete(id);
}

export async function scheduledTemplate(date: ISODate, db: ZoroDB = getDB()): Promise<TemplateId | null> {
  return workoutFor(date, await getSettings(db));
}

/**
 * Do another workout (or rest) on a day instead of the program's. Picking the program's own
 * workout again takes the swap away.
 */
export async function swapWorkout(date: ISODate, to: TemplateId | 'rest', db: ZoroDB = getDB()): Promise<void> {
  const settings = await getSettings(db);
  const { [date]: _old, ...rest } = settings.workoutSwaps ?? {};
  const own = templateForWeekday(new Date(`${date}T12:00`).getDay(), settings.daysPerWeek) ?? 'rest';
  await saveSettings({ workoutSwaps: to === own ? rest : { ...rest, [date]: to } }, db);
}

/** Targets for a workout, computed from everything logged before it. */
export async function buildPlan(templateId: TemplateId, date: ISODate = today(), db: ZoroDB = getDB(), excludeSessionId?: number, extras?: string[]): Promise<WorkoutPlan> {
  const settings = await getSettings(db);
  const history = (await loadHistory(db, 400)).filter((h) => h.sessionId !== excludeSessionId && h.date <= date);
  return planWorkout({ template: withExtras(templateFor(templateId, settings.daysPerWeek), extras), settings, today: date, history });
}

/**
 * Add an exercise to a day's Extra Exercises (started if there isn't one yet, opened again if it
 * was finished). Returns that session's id.
 */
export async function addExtraExercise(date: ISODate, exerciseId: string, db: ZoroDB = getDB()): Promise<number> {
  const existing = (await db.sessions.where('date').equals(date).toArray())
    .filter((s) => s.templateId === 'extra')
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (existing?.id !== undefined) {
    await addExerciseToSession(existing.id, exerciseId, db);
    return existing.id;
  }
  const id = await startSession(await buildPlan('extra', date, db, undefined, [exerciseId]), date, db);
  await db.sessions.update(id, { extras: [exerciseId] });
  return id;
}

/** Add an exercise to the end of a workout (opening it again if it was finished). */
export async function addExerciseToSession(sessionId: number, exerciseId: string, db: ZoroDB = getDB()): Promise<void> {
  const s = await db.sessions.get(sessionId);
  if (!s) return;
  const extras = s.extras ?? [];
  if (extras.includes(exerciseId)) return;
  await db.sessions.update(sessionId, { extras: [...extras, exerciseId], finishedAt: undefined });
}

/** Take an exercise back out of a session's added ones (its logged sets go with it). */
export async function removeExtraExercise(sessionId: number, exerciseId: string, db: ZoroDB = getDB()): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    await db.sessions.update(sessionId, { extras: (s.extras ?? []).filter((x) => x !== exerciseId) });
    await db.sets.where({ sessionId }).filter((x) => x.exerciseId === exerciseId).delete();
  });
}

// ---------- Steps ----------

/** A walk, run or stairs added to a day's steps, with the steps worked out from your height. */
export async function addActivity(
  a: { date: ISODate; kind: ActivityKind; miles?: number; minutes?: number; floors?: number },
  db: ZoroDB = getDB(),
): Promise<number> {
  const settings = await getSettings(db);
  const steps = activitySteps(a, { heightIn: settings.heightIn, sex: settings.sex });
  const row: ActivityEntry = { ...a, steps, loggedAt: Date.now() };
  return (await db.activities.add(row)) as number;
}

export async function deleteActivity(id: number, db: ZoroDB = getDB()): Promise<void> {
  await db.activities.delete(id);
}

/** A day's steps: what Apple Health counted, plus what you added by hand. */
export async function stepsOn(date: ISODate, db: ZoroDB = getDB()): Promise<{ health: number; added: number; total: number; activities: ActivityEntry[] }> {
  const health = (await db.metrics.where('[type+date]').equals(['steps', date]).first())?.value ?? 0;
  const activities = await db.activities.where('date').equals(date).toArray();
  const added = activities.reduce((n, x) => n + x.steps, 0);
  return { health, added, total: health + added, activities };
}

export async function startSession(plan: WorkoutPlan, date: ISODate = today(), db: ZoroDB = getDB()): Promise<number> {
  const session: WorkoutSession = {
    date,
    templateId: plan.templateId,
    startedAt: Date.now(),
    deload: plan.deload,
    benchStep: plan.benchStep,
    plannedSets: plan.exercises.reduce((n, e) => n + e.sets.length, 0),
  };
  return (await db.sessions.add(session)) as number;
}

/**
 * The workout you're doing today, if any: the newest unfinished one dated today. A workout
 * belongs to its day, so one left unfinished yesterday stays on yesterday (where it can still
 * be picked up) and never shows as today's.
 */
export async function openSession(db: ZoroDB = getDB(), day: ISODate = today()): Promise<WorkoutSession | undefined> {
  const sessions = await db.sessions.where('date').equals(day).toArray();
  return sessions.filter((s) => !s.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function logSet(set: Omit<SetLog, 'id' | 'completedAt'>, db: ZoroDB = getDB()): Promise<number> {
  const existing = await db.sets.where({ sessionId: set.sessionId }).filter((s) => s.exerciseId === set.exerciseId && s.setIndex === set.setIndex).first();
  if (existing?.id !== undefined) {
    await db.sets.update(existing.id, { ...set, completedAt: Date.now() });
    return existing.id;
  }
  return (await db.sets.add({ ...set, completedAt: Date.now() })) as number;
}

export async function unlogSet(sessionId: number, exerciseId: string, setIndex: number, db: ZoroDB = getDB()): Promise<void> {
  await db.sets.where({ sessionId }).filter((s) => s.exerciseId === exerciseId && s.setIndex === setIndex).delete();
}

export async function finishSession(sessionId: number, db: ZoroDB = getDB()): Promise<void> {
  // The bench plan reads its max from the logged sets (week 1's estimate, then each test), so
  // there's nothing else to update here.
  await db.sessions.update(sessionId, { finishedAt: Date.now() });
}

export async function deleteSession(sessionId: number, db: ZoroDB = getDB()): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where({ sessionId }).delete();
    await db.sessions.delete(sessionId);
  });
}

// ---------- Food ----------

/** Macros for an amount of a food. */
export function macrosFor(food: FoodItem, quantity: number, unit: 'g' | 'serving'): Macros {
  if (unit === 'serving') {
    if (food.serving) return scaleMacros(food.serving.macros, quantity);
    if (food.per100g) return scaleMacros(food.per100g, quantity); // treat 1 serving as 100 g
  } else {
    if (food.per100g) return scaleMacros(food.per100g, quantity / 100);
    if (food.serving?.grams) return scaleMacros(food.serving.macros, quantity / food.serving.grams);
  }
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

/** Save a food, reusing the stored copy if we already have it (by barcode or source id). */
export async function upsertFood(food: FoodItem, db: ZoroDB = getDB()): Promise<number> {
  let existing: FoodItem | undefined;
  if (food.barcode) existing = await db.foods.where('barcode').equals(food.barcode).first();
  if (!existing && food.sourceId) existing = await db.foods.filter((f) => f.source === food.source && f.sourceId === food.sourceId).first();
  if (existing?.id !== undefined) {
    await db.foods.update(existing.id, { ...food, id: existing.id, favorite: existing.favorite, lastUsedAt: existing.lastUsedAt });
    return existing.id;
  }
  return (await db.foods.add({ ...food, updatedAt: Date.now() })) as number;
}

export async function logFood(
  args: { food: FoodItem; quantity: number; unit: 'g' | 'serving'; meal: Meal; date?: ISODate },
  db: ZoroDB = getDB(),
): Promise<number> {
  const foodId = args.food.id ?? (await upsertFood(args.food, db));
  await db.foods.update(foodId, { lastUsedAt: Date.now() });
  const entry: FoodEntry = {
    date: args.date ?? today(),
    meal: args.meal,
    foodId,
    name: args.food.brand ? `${args.food.name} (${args.food.brand})` : args.food.name,
    quantity: args.quantity,
    unit: args.unit,
    macros: macrosFor(args.food, args.quantity, args.unit),
    loggedAt: Date.now(),
    liquid: args.food.liquid || undefined,
  };
  return (await db.entries.add(entry)) as number;
}

/** A food sent to the backup repo's inbox to log (as Claude does when you ask it to). */
export interface InboxFood {
  kind: 'food';
  date: ISODate;
  meal: Meal;
  /** How many servings. */
  quantity: number;
  food: { name: string; brand?: string; serving: { label: string; grams?: number; macros: Macros } };
  /** The page or PDF its nutrition came from. */
  source?: string;
}

/** Whether `item` is a food to log, in the inbox's shape. */
export function isInboxFood(item: unknown): item is InboxFood {
  const f = item as InboxFood;
  const m = f?.food?.serving?.macros;
  const meals: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return (
    f?.kind === 'food' &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.date) &&
    meals.includes(f.meal) &&
    f.quantity > 0 &&
    !!f.food?.name &&
    !!m &&
    [m.kcal, m.protein, m.carbs, m.fat].every((n) => Number.isFinite(n) && n >= 0)
  );
}

/** Log one inbox-shaped food (as one serving's worth times its quantity). */
function logInboxShaped(f: InboxFood, db: ZoroDB): Promise<number> {
  const food: FoodItem = { name: f.food.name, brand: f.food.brand, serving: f.food.serving, source: 'custom', url: f.source, updatedAt: Date.now() };
  return logFood({ food, quantity: f.quantity, unit: 'serving', meal: f.meal, date: f.date }, db);
}

/**
 * Log a food from the inbox, once: `id` (the file's name) is kept on the entry, so a file seen
 * again adds nothing. Returns whether it added it; throws if it isn't an inbox food.
 */
export async function logInboxFood(id: string, item: unknown, db: ZoroDB = getDB()): Promise<boolean> {
  if (!isInboxFood(item)) throw new Error('Not an inbox food.');
  if (await db.entries.filter((e) => e.inboxId === id).first()) return false;
  const entryId = await logInboxShaped(item, db);
  await db.entries.update(entryId, { inboxId: id });
  return true;
}

/** Log the foods read off a photo (photoLog.ts), the way inbox foods are logged. Returns their entry ids. */
export async function logFoods(items: InboxFood[], db: ZoroDB = getDB()): Promise<number[]> {
  if (!items.every(isInboxFood)) throw new Error('Not a food to log.');
  const ids: number[] = [];
  for (const f of items) ids.push(await logInboxShaped(f, db));
  return ids;
}

/** Takes back what an earlier inbox file logged (say, an order that never came). */
export interface InboxUnlog {
  kind: 'unlog';
  /** The name of the inbox file that logged it. */
  inboxId: string;
}

/** Apply one inbox file: log a food, or take one back. Throws if it's neither. */
export async function applyInboxItem(id: string, item: unknown, db: ZoroDB = getDB()): Promise<boolean> {
  const u = item as InboxUnlog;
  if (u?.kind !== 'unlog') return logInboxFood(id, item, db);
  if (typeof u.inboxId !== 'string' || !u.inboxId) throw new Error('Not an inbox item.');
  return (await db.entries.filter((e) => e.inboxId === u.inboxId).delete()) > 0;
}

export async function quickAdd(name: string, macros: Macros, meal: Meal, date: ISODate = today(), db: ZoroDB = getDB()): Promise<number> {
  return (await db.entries.add({ date, meal, name, quantity: 1, unit: 'serving', macros, loggedAt: Date.now() })) as number;
}

export async function entriesFor(date: ISODate, db: ZoroDB = getDB()): Promise<FoodEntry[]> {
  return db.entries.where('date').equals(date).sortBy('loggedAt');
}

export async function dayTotals(date: ISODate, db: ZoroDB = getDB()): Promise<Macros> {
  return sumEntries(await entriesFor(date, db));
}

export async function dailyIntake(days: number, db: ZoroDB = getDB()): Promise<{ date: ISODate; kcal: number }[]> {
  const since = addDays(today(), -days + 1);
  const entries = await db.entries.where('date').aboveOrEqual(since).toArray();
  const byDay = new Map<ISODate, number>();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.macros.kcal);
  return [...byDay.entries()].map(([date, kcal]) => ({ date, kcal })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Everything you've logged lately, newest first: saved foods plus Quick Add entries (which have
 * no saved food, so they're offered back as one serving of the same calories and macros).
 */
export async function recentFoods(limit = 20, db: ZoroDB = getDB()): Promise<FoodItem[]> {
  const saved = (await db.foods.orderBy('lastUsedAt').reverse().limit(limit * 2).toArray()).filter((f) => f.lastUsedAt);
  const quick = (await db.entries.where('date').aboveOrEqual(addDays(today(), -60)).toArray())
    .filter((e) => e.foodId === undefined)
    .map<FoodItem>((e) => ({
      name: e.name,
      serving: { label: '1 serving', macros: e.macros },
      source: 'custom',
      sourceId: `quick:${e.name.trim().toLowerCase()}`,
      updatedAt: e.loggedAt,
      lastUsedAt: e.loggedAt,
    }));
  const seen = new Set<string>();
  return [...saved, ...quick]
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .filter((f) => {
      const k = f.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** Foods you've used before plus the built-in list, without hitting the network. */
export async function searchLocalFoods(q: string, db: ZoroDB = getDB()): Promise<FoodItem[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const saved = await db.foods.filter((f) => matchesWords(`${f.name} ${f.brand ?? ''}`, needle)).limit(25).toArray();
  const savedIds = new Set(saved.map((f) => `${f.source}:${f.sourceId ?? f.name}`));
  const builtin = searchBuiltin(needle).filter((f) => !savedIds.has(`builtin:${f.sourceId}`));
  return [...saved, ...builtin];
}

export async function saveMeal(meal: SavedMeal, db: ZoroDB = getDB()): Promise<number> {
  return (await db.meals.put(meal)) as number;
}

export async function logSavedMeal(mealId: number, meal: Meal, date: ISODate = today(), db: ZoroDB = getDB()): Promise<void> {
  const saved = await db.meals.get(mealId);
  if (!saved) return;
  await db.entries.bulkAdd(saved.items.map((item) => ({ ...item, date, meal, loggedAt: Date.now() })));
}

// ---------- Sleep and body ----------

export async function saveSleep(entry: SleepEntry, db: ZoroDB = getDB()): Promise<void> {
  const existing = await db.sleep.where('date').equals(entry.date).first();
  await db.sleep.put({ ...entry, id: existing?.id });
}

/**
 * Save what the Apple Health automation sends: the nights in it (two days' worth) and each day's
 * steps. A night you logged yourself stays as you set it. Returns what it found.
 */
export async function saveHealthImport(text: string, db: ZoroDB = getDB()): Promise<{ sleep: SleepEntry | null; nights: SleepEntry[]; steps: DaySteps[] }> {
  const found = parseHealthImport(text);
  for (const d of found.steps) await saveMetric('steps', d.steps, d.date, db);
  for (const night of found.nights) {
    const existing = await db.sleep.where('date').equals(night.date).first();
    if (existing?.source !== 'manual') await saveSleep(night, db);
  }
  return found;
}

export async function saveMetric(type: MetricType, value: number, date: ISODate = today(), db: ZoroDB = getDB()): Promise<void> {
  const existing = await db.metrics.where('[type+date]').equals([type, date]).first();
  await db.metrics.put({ type, value, date, id: existing?.id });
}

export async function metricsOf(type: MetricType, sinceDays = 365, db: ZoroDB = getDB()): Promise<BodyMetric[]> {
  const since = addDays(today(), -sinceDays);
  return (await db.metrics.where('type').equals(type).toArray()).filter((m) => m.date >= since).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Water ----------

/** A day's water goal: the daily target, plus the lifting-day extra on a day with a lifting workout. */
export function waterGoalOn(date: ISODate, settings: Pick<Settings, 'waterTargetOz' | 'waterTrainingOz' | 'daysPerWeek' | 'workoutSwaps'>): number {
  const id = workoutFor(date, settings);
  return settings.waterTargetOz + (id && !TEMPLATES[id].secondary ? (settings.waterTrainingOz ?? 0) : 0);
}

export async function addWater(oz: number, date: ISODate = today(), db: ZoroDB = getDB()): Promise<number> {
  return (await db.water.add({ date, oz, at: Date.now() })) as number;
}

/** Takes `oz` back off the day's water, newest drinks first (never below zero). */
export async function removeWater(oz: number, date: ISODate = today(), db: ZoroDB = getDB()): Promise<void> {
  let left = oz;
  const newest = (await db.water.where('date').equals(date).toArray()).sort((a, b) => b.at - a.at);
  for (const e of newest) {
    if (left <= 0 || e.id === undefined) break;
    if (e.oz <= left) {
      left -= e.oz;
      await db.water.delete(e.id);
    } else {
      await db.water.update(e.id, { oz: e.oz - left });
      left = 0;
    }
  }
}

export async function waterFor(date: ISODate, db: ZoroDB = getDB()): Promise<WaterEntry[]> {
  return db.water.where('date').equals(date).sortBy('at');
}

/** Total ounces per day for the last `days` days (days with nothing logged are left out). */
export async function dailyWater(days: number, db: ZoroDB = getDB()): Promise<{ date: ISODate; oz: number }[]> {
  const since = addDays(today(), -days + 1);
  const rows = await db.water.where('date').aboveOrEqual(since).toArray();
  const byDay = new Map<ISODate, number>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.oz);
  return [...byDay.entries()].map(([date, oz]) => ({ date, oz })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Backup ----------

export interface Backup {
  app: 'zoro';
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportAll(db: ZoroDB = getDB()): Promise<Backup> {
  // Backups (file and GitHub) hold only real data: sample rows, and sets of sample workouts, stay out.
  const sampleSessions = new Set((await db.sessions.filter((x) => !!x.sample).primaryKeys()) as number[]);
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    const rows = (await db.table(name).toArray()) as { sample?: boolean; sessionId?: number }[];
    tables[name] = rows.filter((r) => !r.sample && !(name === 'sets' && r.sessionId !== undefined && sampleSessions.has(r.sessionId)));
  }
  return { app: 'zoro', version: 1, exportedAt: new Date().toISOString(), tables };
}

/**
 * Bring in a copy that was set up for you on a computer (your profile, goals and starting weights,
 * maybe a few measurements) without touching what this phone has logged. Its settings win; a
 * measurement comes in unless this phone already has that kind for that day; any other table
 * comes in only if it's empty here.
 */
export async function mergeBackup(backup: unknown, db: ZoroDB = getDB()): Promise<void> {
  const b = backup as Backup;
  if (!b || b.app !== 'zoro' || typeof b.tables !== 'object') throw new Error('That file is not a Zoro backup.');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const name of TABLES) {
      const rows = b.tables[name];
      if (!Array.isArray(rows) || !rows.length) continue;
      if (name === 'settings') {
        await db.settings.put({ ...(await getSettings(db)), ...(rows[0] as Partial<Settings>), key: 'settings' });
      } else if (name === 'metrics') {
        for (const { id: _id, ...m } of rows as BodyMetric[]) {
          if (!(await db.metrics.where('[type+date]').equals([m.type, m.date]).first())) await db.metrics.add(m);
        }
      } else if ((await db.table(name).count()) === 0) {
        await db.table(name).bulkPut(rows);
      }
    }
  });
}

/** Replace everything with a backup. Throws if the file isn't a Zoro backup. */
export async function importAll(backup: unknown, db: ZoroDB = getDB()): Promise<void> {
  const b = backup as Backup;
  if (!b || b.app !== 'zoro' || typeof b.tables !== 'object') throw new Error('That file is not a Zoro backup.');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const name of TABLES) {
      await db.table(name).clear();
      const rows = b.tables[name];
      if (Array.isArray(rows) && rows.length) await db.table(name).bulkPut(rows);
    }
  });
}

/**
 * The app used to fill itself with a sample week for testing. That's gone: this deletes anything
 * it left on a phone (foods, water, sleep, body metrics, workouts). Run at startup; cheap when
 * there's nothing. Returns how many foods it removed.
 */
export async function purgeSampleData(db: ZoroDB = getDB()): Promise<number> {
  const ids = (await db.entries.filter((e) => !!e.sample).primaryKeys()) as number[];
  await db.entries.bulkDelete(ids);
  await db.water.bulkDelete((await db.water.filter((e) => !!e.sample).primaryKeys()) as number[]);
  await db.sleep.bulkDelete((await db.sleep.filter((e) => !!e.sample).primaryKeys()) as number[]);
  await db.metrics.bulkDelete((await db.metrics.filter((e) => !!e.sample).primaryKeys()) as number[]);
  const sessions = (await db.sessions.filter((e) => !!e.sample).primaryKeys()) as number[];
  if (sessions.length) await db.sets.bulkDelete((await db.sets.where('sessionId').anyOf(sessions).primaryKeys()) as number[]);
  await db.sessions.bulkDelete(sessions);
  return ids.length;
}
