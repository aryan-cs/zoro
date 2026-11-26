import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_SETTINGS } from './settings';
import type { ActivityEntry, BodyMetric, FoodEntry, FoodItem, LiftEntry, SavedMeal, SetLog, Settings, SleepEntry, WaterEntry, WorkoutSession } from './types';

export class ZoroDB extends Dexie {
  settings!: EntityTable<Settings, 'key'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  sets!: EntityTable<SetLog, 'id'>;
  foods!: EntityTable<FoodItem, 'id'>;
  entries!: EntityTable<FoodEntry, 'id'>;
  meals!: EntityTable<SavedMeal, 'id'>;
  sleep!: EntityTable<SleepEntry, 'id'>;
  metrics!: EntityTable<BodyMetric, 'id'>;
  water!: EntityTable<WaterEntry, 'id'>;
  lifts!: EntityTable<LiftEntry, 'id'>;
  activities!: EntityTable<ActivityEntry, 'id'>;

  constructor(name = 'zoro') {
    super(name);
    const v1 = {
      settings: 'key',
      sessions: '++id, date, templateId',
      sets: '++id, sessionId, exerciseId, date, [exerciseId+date]',
      foods: '++id, barcode, name, lastUsedAt, favorite',
      entries: '++id, date, meal',
      meals: '++id, name',
      sleep: '++id, &date',
      metrics: '++id, date, type, &[type+date]',
    };
    this.version(1).stores(v1);
    this.version(2).stores({ ...v1, water: '++id, date' });
    this.version(3).stores({ ...v1, water: '++id, date', lifts: '++id, date, exerciseId, &[exerciseId+date]' });
    this.version(4).stores({ ...v1, water: '++id, date', lifts: '++id, date, exerciseId, &[exerciseId+date]', activities: '++id, date' });
  }
}

export const TABLES = ['settings', 'sessions', 'sets', 'foods', 'entries', 'meals', 'sleep', 'metrics', 'water', 'lifts', 'activities'] as const;
export type TableName = (typeof TABLES)[number];

let instance: ZoroDB | null = null;

export function getDB(): ZoroDB {
  instance ??= new ZoroDB();
  return instance;
}

/** Swap the database (used by tests). */
export function setDB(db: ZoroDB): void {
  instance = db;
}

export async function getSettings(db = getDB()): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...s, key: 'settings' };
}

export async function saveSettings(patch: Partial<Settings>, db = getDB()): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...patch, key: 'settings' as const };
  await db.settings.put(next);
  return next;
}

/** Ask the browser not to evict our data. Home Screen apps on iOS usually grant this. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
