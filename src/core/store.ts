import { matchesWords, searchBuiltin } from './builtinFoods';
import { addDays, scaleMacros, sumEntries, toISODate } from './calc';
import { getDB, getSettings, TABLES, type ZoroDB } from './db';
import { BENCH_STEPS, EXERCISES, templateFor, templateForWeekday } from './program';
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
/**
 * Workouts since `sinceDays` ago, newest first. Sample workouts are left out unless `withSample`
 * (History shows them; planning never sees them, so sample data can't change your real targets).
 */
export async function loadHistory(db: ZoroDB = getDB(), sinceDays = 400, withSample = false): Promise<HistorySession[]> {
  const since = addDays(today(), -sinceDays);
  const sessions = (await db.sessions.where('date').aboveOrEqual(since).toArray()).filter((s) => withSample || !s.sample);
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

/** A week of believable meals ending today, for testing; every entry is marked as sample. */
export async function addSampleWeek(db: ZoroDB = getDB()): Promise<number> {
  const meals: [Meal, string, number, number, number, number][][] = [
    [['breakfast', 'Greek Yogurt (Fage)', 150, 20, 8, 4], ['breakfast', 'Banana', 105, 1.3, 27, 0.4], ['lunch', 'Chicken Rice Bowl', 640, 48, 72, 14], ['dinner', 'Salmon, Rice and Broccoli', 720, 46, 68, 26], ['snack', 'Protein Bar', 210, 20, 22, 8]],
    [['breakfast', 'Eggs and Toast', 420, 26, 32, 20], ['lunch', 'Turkey Sandwich', 520, 38, 48, 16], ['dinner', 'Steak and Potatoes', 860, 62, 58, 38], ['snack', 'Whey Shake', 160, 30, 6, 2]],
    [['breakfast', 'Oatmeal with Berries', 380, 14, 64, 8], ['lunch', 'Chipotle Burrito Bowl', 780, 52, 82, 24], ['snack', 'Apple and Peanut Butter', 290, 8, 30, 16], ['dinner', 'Chicken Pasta', 820, 58, 92, 20]],
    [['breakfast', 'Greek Yogurt (Fage)', 150, 20, 8, 4], ['lunch', 'Tuna Salad Wrap', 560, 42, 46, 22], ['dinner', 'Paneer Tikka with Rice', 780, 40, 84, 30], ['snack', 'Protein Bar', 210, 20, 22, 8]],
    [['breakfast', 'Bagel with Cream Cheese', 450, 14, 66, 14], ['lunch', 'Chicken Caesar Salad', 540, 44, 20, 32], ['dinner', 'Beef Tacos', 820, 46, 70, 38], ['snack', 'Whey Shake', 160, 30, 6, 2]],
    [['breakfast', 'Eggs and Toast', 420, 26, 32, 20], ['lunch', 'Chicken Rice Bowl', 640, 48, 72, 14], ['snack', 'Trail Mix', 300, 8, 28, 18], ['dinner', 'Salmon, Rice and Broccoli', 720, 46, 68, 26]],
    [['breakfast', 'Oatmeal with Berries', 380, 14, 64, 8], ['lunch', 'Turkey Sandwich', 520, 38, 48, 16], ['dinner', 'Chicken Stir Fry', 690, 52, 70, 20]],
  ];
  // Last night first. Bedtime the evening before, wake-up that morning.
  const nights: [string, string][] = [['23:40', '07:00'], ['00:15', '06:50'], ['23:05', '07:10'], ['23:30', '07:20'], ['00:40', '07:05'], ['23:20', '06:55'], ['22:55', '07:05'], ['23:50', '07:15'], ['00:05', '06:40']];
  const waterDays = [64, 112, 96, 128, 104, 88, 120];
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const DAY = 86_400_000;

  // One transaction: a thousand-odd writes land together (and quickly) instead of one by one.
  return db.transaction('rw', [db.entries, db.water, db.sleep, db.metrics, db.sessions, db.sets, db.settings], async () => {
    // Start fresh so tapping it twice doesn't double everything.
    await removeSampleData(db);
    const t = today();
    let n = 0;
    // Two weeks of meals and water.
    for (let d = 0; d < 14; d++) {
      const date = addDays(t, -d);
      for (const [i, [meal, name, kcal, protein, carbs, fat]] of meals[d % 7].entries()) {
        await db.entries.add({ date, meal, name, quantity: 1, unit: 'serving', macros: { kcal, protein, carbs, fat }, loggedAt: Date.now() - d * DAY + i, sample: true });
        n++;
      }
      const oz = waterDays[d % 7];
      for (const [i, part] of [0.3, 0.45, 0.25].entries()) await db.water.add({ date, oz: Math.round(oz * part), at: Date.now() - d * DAY - (3 - i) * 3_600_000, sample: true });
    }
    // A month of sleep, unless that night is already logged.
    const slept = new Set((await db.sleep.toArray()).map((e) => e.date));
    for (let d = 0; d < 30; d++) {
      const date = addDays(t, -d);
      if (slept.has(date)) continue;
      const [bed, wake] = nights[d % nights.length];
      await db.sleep.add({ date, bedtime: bed, wakeTime: wake, minutes: (toMin(wake) - toMin(bed) + 1440) % 1440, source: 'manual', sample: true });
    }
    // Eight weeks of morning weights drifting down about half a pound a week, and a waist, arm
    // and forearm measurement every other week; days already weighed or measured are left alone.
    const measured = new Set((await db.metrics.toArray()).map((m) => `${m.type}:${m.date}`));
    const noise = [0.4, -0.2, 0.6, -0.4, 0.1, 0.5, -0.3, 0.2, -0.5, 0.3, 0, 0.4, -0.1, 0.6];
    for (let d = 55; d >= 0; d--) {
      const date = addDays(t, -d);
      if (!measured.has(`weight:${date}`)) await db.metrics.add({ date, type: 'weight', value: Math.round((185.2 + d * 0.07 + noise[d % noise.length]) * 10) / 10, sample: true });
      if (d % 14 === 0) {
        const w = d / 14;
        const sizes: [MetricType, number][] = [['waist', 34.5 + w * 0.25], ['arm', 16.5 - w * 0.0625], ['forearm', 11.75 - w * 0.0625]];
        for (const [type, value] of sizes) if (!measured.has(`${type}:${date}`)) await db.metrics.add({ date, type, value, sample: true });
      }
    }
    await addSampleWorkouts(db);
    return n;
  });
}

/** Starting working weights (lb) for sample workouts; they climb about 1% a week. */
const SAMPLE_WEIGHT: Record<string, number> = {
  pausedBench: 145, closeGripBench: 145, inclineBarbell: 125, cableFly: 30, dbShoulderPress: 45, cableRow: 110, barbellRow: 135,
  kneelingPulldown: 50, facePull: 40, rearDeltFly: 15, cableLateral: 15, lateralRaise: 20, ohTricepsExt: 45, leaningOhExt: 20, pushdown: 50,
  skullCrusher: 65, inclineCurl: 25, preacherCurl: 35, bayesianCurl: 20, hammerCurl: 30, ezCurl: 60, reverseCurl: 45, wristCurl: 55,
  reverseWristCurl: 25, squat: 205, rdl: 185, walkingLunge: 35, calfRaise: 35, bulgarian: 35, hipThrust: 225, cableLegExt: 30,
  woodchopper: 30, cableCrunch: 70,
};

/**
 * Eight weeks of finished workouts up to yesterday, following the program's weekdays (one day
 * skipped now and then). Monday bench walks the 12-step table from a 195 lb max, so the bench
 * chart climbs; other lifts add about 1% a week.
 */
async function addSampleWorkouts(db: ZoroDB) {
  const settings = await getSettings(db);
  const t = today();
  let mondays = 0;
  for (let d = 55; d >= 1; d--) {
    const date = addDays(t, -d);
    const weekday = new Date(`${date}T12:00`).getDay();
    const id = templateForWeekday(weekday, settings.daysPerWeek);
    if (!id) continue;
    const week = Math.floor((55 - d) / 7);
    const step = id === 'upperA' ? mondays++ % BENCH_STEPS.length : undefined;
    if (d % 11 === 7) continue; // a missed day here and there
    const startedAt = new Date(`${date}T18:00`).getTime();
    const sessionId = (await db.sessions.add({ date, templateId: id, startedAt, finishedAt: startedAt + 70 * 60_000, benchStep: step, sample: true })) as number;
    let minute = 0;
    for (const ex of templateFor(id, settings.daysPerWeek).exercises) {
      const def = EXERCISES[ex.exerciseId];
      const sets: { weight: number; reps: number; target?: number }[] = [];
      if (ex.scheme === 'bench-heavy' && step !== undefined) {
        for (const g of BENCH_STEPS[step].groups) for (let i = 0; i < g.sets; i++) sets.push({ weight: Math.round((195 * g.pct) / 5) * 5, reps: g.reps, target: g.reps });
      } else {
        const base = SAMPLE_WEIGHT[ex.exerciseId] ?? 0;
        const inc = def?.increment || 5;
        const weight = base ? Math.round((base * (1 + 0.01 * week)) / inc) * inc : 0;
        for (let i = 0; i < ex.sets; i++) sets.push({ weight, reps: Math.max(ex.repMin, Math.min(ex.repMax, ex.repMin + week - i)) });
      }
      await db.sets.bulkAdd(
        sets.map((s, i) => ({ sessionId, date, exerciseId: ex.exerciseId, setIndex: i, weight: s.weight, reps: s.reps, targetReps: s.target, completedAt: startedAt + (minute += 3) * 60_000 })),
      );
    }
  }
}

/**
 * Local previews (dev server, Simulator) always have something to look at: a sample week is
 * added on first open and refreshed on each new day. The deployed app never calls this.
 */
export async function ensureSampleData(db: ZoroDB = getDB()): Promise<void> {
  const current = await db.entries.where('date').equals(today()).filter((e) => !!e.sample).count();
  if (!current) await addSampleWeek(db);
}

/** Deletes everything "Add Sample Week" made (foods, water, sleep, body metrics, workouts). Returns how many foods. */
export async function removeSampleData(db: ZoroDB = getDB()): Promise<number> {
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
