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

export type Scheme = 'double' | 'bench-heavy' | 'bench-volume' | 'bench-variation';

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
  | 'pmCardio'
  /** Exercises added on top of the day's workout (Lift's + › Add Exercise). */
  | 'extra';

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
  /** For heavy bench sessions, which week of the bench plan this was. */
  benchStep?: number;
  /** How many sets the workout's plan had (all of them logged = done in full). */
  plannedSets?: number;
  /** Exercises added to it by hand, after its own (all of an Extra Exercises session's). */
  extras?: string[];
  notes?: string;
  /** Left by the old sample week (deleted at startup). */
  sample?: boolean;
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

/** A set entered by hand on History's Lifts card, outside any workout: it counts toward that
 * lift's estimated max and best set, not toward a workout or the program's progression. */
export interface LiftEntry {
  id?: number;
  date: ISODate;
  exerciseId: string;
  weight: number;
  reps: number;
  loggedAt: number;
}

/** A walk, run or stair session added by hand to a day's steps (hold Lift's Steps card). */
export interface ActivityEntry {
  id?: number;
  date: ISODate;
  kind: ActivityKind;
  /** Miles, if a distance was given (entered in km, kept in miles). */
  miles?: number;
  minutes?: number;
  /** Floors climbed, for stairs. */
  floors?: number;
  /** The steps it works out to, added to the day's from Apple Health. */
  steps: number;
  loggedAt: number;
}
export type ActivityKind = 'walk' | 'run' | 'stairs';

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
  /** The page or PDF its nutrition came from (foods logged from a photo). */
  url?: string;
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
  /** Position within its meal once you've dragged it (lists sort by this, else by loggedAt). */
  order?: number;
  liquid?: boolean;
  /** Added from the backup repo's inbox (that file's name), so it's never added twice. */
  inboxId?: string;
  /** Left by the old sample week (deleted at startup). */
  sample?: boolean;
}

export interface WaterEntry {
  id?: number;
  date: ISODate;
  oz: number;
  at: number;
  /** Left by the old sample week (deleted at startup). */
  sample?: boolean;
}

export interface SavedMeal {
  id?: number;
  name: string;
  items: Omit<FoodEntry, 'id' | 'date' | 'meal' | 'loggedAt'>[];
}

/** Sleep stages as Apple Health records them ('asleep' when the source doesn't say which). */
export type SleepStage = 'awake' | 'rem' | 'core' | 'deep' | 'asleep';
/** One stretch of a night: [start, end] in minutes from falling asleep (negative before it), and its stage. */
export type StageSpan = [number, number, SleepStage];

export interface SleepEntry {
  id?: number;
  /** The morning you woke up. */
  date: ISODate;
  /** When you fell asleep (ISO, or "HH:MM" for older manual entries). */
  bedtime?: string;
  wakeTime?: string;
  /** Time actually asleep. */
  minutes: number;
  /** How you felt waking up: 1 tired, 3 OK, 5 rested. */
  quality?: 1 | 2 | 3 | 4 | 5;
  /** The night's stages from Apple Health, including time awake in bed before and during it. */
  stages?: StageSpan[];
  source: 'manual' | 'shortcut';
  /** Left by the old sample week (deleted at startup). */
  sample?: boolean;
}

export type MetricType = 'weight' | 'waist' | 'arm' | 'forearm' | 'bodyfat' | 'steps';

export interface BodyMetric {
  id?: number;
  date: ISODate;
  type: MetricType;
  value: number;
  /** Left by the old sample week (deleted at startup). */
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
  /** First name for Today's greeting. */
  name?: string;
  /** The bench number you're working toward (History's Bench card); 225 until changed. */
  benchGoal?: number;
  /** Goals for the other tracked lifts (History), by exercise id; none until you set one. */
  liftGoals?: Record<string, number>;
  /** Daily fiber target (History › Food); none until you set one. */
  fiberTarget?: number;
  /** Profile (Settings › first group), used to recommend the targets. */
  sex?: 'male' | 'female';
  birthDate?: ISODate;
  heightIn?: number;
  activity?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very';
  /** Body weight you're working toward, lb. */
  goalWeight?: number;
  /** What the goal is measured by (weight unless chosen otherwise). */
  goalMetric?: 'weight' | 'waist' | 'arm' | 'forearm' | 'bodyfat';
  /** Goals for the other measurements (in, or % for body fat). */
  goalValues?: Partial<Record<'waist' | 'arm' | 'forearm' | 'bodyfat', number>>;
  /** Boxes pinned to the top or hidden, per page (History's sections). */
  boxes?: Record<string, { pinned: string[]; hidden: string[] }>;
  /** Targets follow the profile's recommendation until you set one yourself (then false). */
  autoTargets?: boolean;
  dumbbellMax: number;
  barWeight: number;
  plates: number[];
  usdaApiKey?: string;
  /** Per-exercise starting weights the user entered. */
  startWeights: Record<string, number>;
}
