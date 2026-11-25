/** Calendar date in local time, formatted YYYY-MM-DD. */
export type ISODate = string;

export type EquipmentKind = 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'machine';

export interface ExerciseDef {
  id: string;
  name: string;
  kind: EquipmentKind;
  /** Smallest weight jump, in lb (per hand for dumbbells). */
  increment: number;
  muscles: string[];
  /** Target is seconds held instead of reps (planks, hangs). */
  timed?: boolean;
  /** Reps are counted per side (lunges, split squats). */
  perSide?: boolean;
  /** For bodyweight moves, the logged weight is added load. */
  addedLoad?: boolean;
  cue?: string;
}

export type Scheme = 'double' | 'bench-heavy';

export interface PrescribedExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  scheme: Scheme;
  /** Weight to use the first time, if known. */
  startWeight?: number;
  restSec: number;
  /** Exercises sharing a label are done as a superset. */
  superset?: string;
  note?: string;
}

export type TemplateId =
  | 'upperA'
  | 'lowerA'
  | 'arms'
  | 'upperB'
  | 'lowerB'
  | 'pmForearms'
  | 'pmAbs'
  | 'pmArms'
  | 'pmCardio';

export interface WorkoutTemplate {
  id: TemplateId;
  name: string;
  short: string;
  /** Second sessions are optional add-ons. */
  secondary?: boolean;
  exercises: PrescribedExercise[];
}

export interface SetTarget {
  weight: number | null;
  reps: number;
  /** Upper bound shown to the user, e.g. "8–12". */
  repMax?: number;
  label?: string;
}

export interface ExercisePlan {
  exerciseId: string;
  name: string;
  sets: SetTarget[];
  restSec: number;
  superset?: string;
  notes: string[];
  /** What happened last time, for "beat last time". */
  last?: { date: ISODate; sets: { weight: number; reps: number }[] };
}

export interface WorkoutSession {
  id?: number;
  date: ISODate;
  templateId: TemplateId;
  startedAt: number;
  finishedAt?: number;
  deload?: boolean;
  /** For heavy bench sessions, which step of the 12-step table this was. */
  benchStep?: number;
  notes?: string;
}

export interface SetLog {
  id?: number;
  sessionId: number;
  date: ISODate;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  targetWeight?: number | null;
  targetReps?: number;
  completedAt: number;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export type FoodSource = 'off' | 'usda' | 'custom' | 'builtin';

export interface FoodItem {
  id?: number;
  barcode?: string;
  name: string;
  brand?: string;
  per100g?: Macros;
  serving?: { label: string; grams?: number; macros: Macros };
  source: FoodSource;
  sourceId?: string;
  updatedAt: number;
  lastUsedAt?: number;
  favorite?: boolean;
  /** Drinks: amounts are in ml instead of grams. */
  liquid?: boolean;
}

/** 'unsorted' holds scanned foods until they're dragged into a meal. */
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unsorted';

export interface FoodEntry {
  id?: number;
  date: ISODate;
  meal: Meal;
  foodId?: number;
  name: string;
  quantity: number;
  unit: 'g' | 'serving';
  /** Macros for this entry, frozen at log time. */
  macros: Macros;
  loggedAt: number;
  liquid?: boolean;
  /** Made by "Add Sample Week" for testing; "Remove Sample Data" deletes these. */
  sample?: boolean;
}

export interface WaterEntry {
  id?: number;
  date: ISODate;
  oz: number;
  at: number;
  /** Made by Settings › Add Sample Week. */
  sample?: boolean;
}

export interface SavedMeal {
  id?: number;
  name: string;
  items: Omit<FoodEntry, 'id' | 'date' | 'meal' | 'loggedAt'>[];
}

export interface SleepEntry {
  id?: number;
  /** The morning you woke up. */
  date: ISODate;
  bedtime?: string;
  wakeTime?: string;
  minutes: number;
  quality?: 1 | 2 | 3 | 4 | 5;
  source: 'manual' | 'shortcut';
  /** Made by Settings › Add Sample Week. */
  sample?: boolean;
}

export type MetricType = 'weight' | 'waist' | 'arm' | 'forearm' | 'bodyfat' | 'steps';

export interface BodyMetric {
  id?: number;
  date: ISODate;
  type: MetricType;
  value: number;
  /** Made by Settings › Add Sample Week. */
  sample?: boolean;
}

export type Phase = 'cut' | 'maintain' | 'bulk';

export interface Settings {
  key: 'settings';
  programStart: ISODate;
  daysPerWeek: 4 | 5;
  /** Bench max the current 12-step block is based on. */
  benchMax: number;
  benchBlockStart: ISODate;
  phase: Phase;
  /** Target change in lb per week (negative to lose). */
  targetRate: number;
  kcalTarget: number;
  proteinTarget: number;
  fatTarget: number;
  stepsTarget: number;
  sleepTargetMin: number;
  /** Daily water goal in fluid ounces. */
  waterTargetOz: number;
  /** The four quick-add amounts on the Water tab, in ounces (hold one to change it). */
  waterPresets?: number[];
  dumbbellMax: number;
  barWeight: number;
  plates: number[];
  usdaApiKey?: string;
  /** Per-exercise starting weights the user entered. */
  startWeights: Record<string, number>;
}
