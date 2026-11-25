import { matchesWords, searchBuiltin } from './builtinFoods';
import { addDays, scaleMacros, sumEntries, toISODate } from './calc';
import { getDB, getSettings, TABLES, type ZoroDB } from './db';
import { templateFor, templateForWeekday } from './program';
import { planWorkout, type HistorySession, type WorkoutPlan } from './progression';
import type {
  BodyMetric,
  FoodEntry,
  FoodItem,
  ISODate,
  Macros,
  Meal,
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
export async function loadHistory(db: ZoroDB = getDB(), sinceDays = 400): Promise<HistorySession[]> {
  const since = addDays(today(), -sinceDays);
  const sessions = await db.sessions.where('date').aboveOrEqual(since).toArray();
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
      sets: bySession.get(s.id!) ?? [],
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId - a.sessionId);
}

export async function scheduledTemplate(date: ISODate, db: ZoroDB = getDB()): Promise<TemplateId | null> {
  const settings = await getSettings(db);
  const [y, m, d] = date.split('-').map(Number);
  return templateForWeekday(new Date(y, m - 1, d).getDay(), settings.daysPerWeek);
}

/** Targets for a workout, computed from everything logged before it. */
export async function buildPlan(templateId: TemplateId, date: ISODate = today(), db: ZoroDB = getDB(), excludeSessionId?: number): Promise<WorkoutPlan> {
  const settings = await getSettings(db);
  const history = (await loadHistory(db)).filter((h) => h.sessionId !== excludeSessionId && h.date <= date);
  return planWorkout({ template: templateFor(templateId, settings.daysPerWeek), settings, today: date, history });
}

export async function startSession(plan: WorkoutPlan, date: ISODate = today(), db: ZoroDB = getDB()): Promise<number> {
  const session: WorkoutSession = {
    date,
    templateId: plan.templateId,
    startedAt: Date.now(),
    deload: plan.deload,
    benchStep: plan.benchStep,
  };
  return (await db.sessions.add(session)) as number;
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
  const settings = await getSettings(db);
  await db.sessions.update(sessionId, { finishedAt: Date.now() });
  // A finished max-test week rolls the bench table into a new block.
  const plan = await buildPlan('upperA', addDays(today(), 1), db);
  if (plan.newBenchMax && plan.newBenchMax !== settings.benchMax) {
    await db.settings.put({ ...settings, benchMax: plan.newBenchMax, benchBlockStart: addDays(today(), 1) });
  }
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

export async function saveMetric(type: MetricType, value: number, date: ISODate = today(), db: ZoroDB = getDB()): Promise<void> {
  const existing = await db.metrics.where('[type+date]').equals([type, date]).first();
  await db.metrics.put({ type, value, date, id: existing?.id });
}

export async function metricsOf(type: MetricType, sinceDays = 365, db: ZoroDB = getDB()): Promise<BodyMetric[]> {
  const since = addDays(today(), -sinceDays);
  return (await db.metrics.where('type').equals(type).toArray()).filter((m) => m.date >= since).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Water ----------

export async function addWater(oz: number, date: ISODate = today(), db: ZoroDB = getDB()): Promise<number> {
  return (await db.water.add({ date, oz, at: Date.now() })) as number;
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
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) tables[name] = await db.table(name).toArray();
  return { app: 'zoro', version: 1, exportedAt: new Date().toISOString(), tables };
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
