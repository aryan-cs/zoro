import type { ExerciseDef, PrescribedExercise, TemplateId, WorkoutTemplate } from './types';

const ex = (
  id: string,
  name: string,
  kind: ExerciseDef['kind'],
  increment: number,
  muscles: string[],
  extra: Partial<ExerciseDef> = {},
): ExerciseDef => ({ id, name, kind, increment, muscles, ...extra });

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(
  [
    // Chest and pressing
    ex('bench', 'Bench Press', 'barbell', 5, ['chest', 'triceps'], {
      cue: 'Bench inside the rack with safety arms just below your chest.',
    }),
    ex('pausedBench', 'Paused Bench', 'barbell', 5, ['chest', 'triceps'], {
      cue: 'Pause 1 second on your chest.',
    }),
    ex('closeGripBench', 'Close-Grip Bench', 'barbell', 5, ['triceps', 'chest']),
    ex('inclineBarbell', 'Incline Barbell Press', 'barbell', 5, ['chest', 'shoulders'], {
      cue: 'Incline bench set inside the rack.',
    }),
    ex('dips', 'Dips', 'bodyweight', 5, ['chest', 'triceps'], {
      addedLoad: true,
      cue: 'Rig dip handles. No handles? Decline dumbbell press.',
    }),
    ex('cableFly', 'High-to-Low Cable Fly', 'cable', 5, ['chest']),
    ex('dbShoulderPress', 'Seated Dumbbell Shoulder Press', 'dumbbell', 5, ['shoulders']),
    // Back
    ex('pullup', 'Pull-Ups', 'bodyweight', 5, ['back', 'biceps'], {
      addedLoad: true,
      cue: 'Or kneeling cable pulldown from the top pulley.',
    }),
    ex('cableRow', 'Seated Cable Row', 'cable', 5, ['back'], { cue: 'Low pulley, feet braced.' }),
    ex('barbellRow', 'Barbell Row', 'barbell', 5, ['back'], { cue: 'Or single-arm cable row.' }),
    ex('kneelingPulldown', 'Kneeling Single-Arm Pulldown', 'cable', 5, ['back'], { perSide: true }),
    ex('facePull', 'Face Pulls', 'cable', 5, ['rear delts', 'upper back']),
    ex('rearDeltFly', 'Rear-Delt Fly', 'dumbbell', 5, ['rear delts']),
    // Shoulders
    ex('cableLateral', 'Cable Lateral Raise', 'cable', 5, ['side delts'], { perSide: true }),
    ex('lateralRaise', 'Lateral Raise', 'dumbbell', 5, ['side delts']),
    // Arms
    ex('ohTricepsExt', 'Overhead Cable Triceps Extension', 'cable', 5, ['triceps']),
    ex('leaningOhExt', 'Leaning Single-Arm Overhead Extension', 'cable', 5, ['triceps'], { perSide: true }),
    ex('pushdown', 'Triceps Pushdown', 'cable', 5, ['triceps']),
    ex('skullCrusher', 'Skull Crushers', 'barbell', 5, ['triceps']),
    ex('inclineCurl', 'Incline Dumbbell Curl', 'dumbbell', 5, ['biceps']),
    ex('preacherCurl', 'Cable Preacher Curl', 'cable', 5, ['biceps'], { cue: 'Bench at the cable.' }),
    ex('bayesianCurl', 'Bayesian Curl', 'cable', 5, ['biceps'], { perSide: true }),
    ex('hammerCurl', 'Hammer Curl', 'dumbbell', 5, ['biceps', 'forearms']),
    ex('ezCurl', 'EZ-Bar or Dumbbell Curl', 'barbell', 5, ['biceps']),
    // Forearms
    ex('reverseCurl', 'Reverse Curl', 'barbell', 5, ['forearms']),
    ex('wristCurl', 'Wrist Curl', 'barbell', 5, ['forearms'], { cue: 'Full stretch at the bottom.' }),
    ex('reverseWristCurl', 'Reverse Wrist Curl', 'barbell', 5, ['forearms']),
    ex('deadHang', 'Dead Hang', 'bodyweight', 5, ['forearms', 'grip'], { timed: true }),
    // Legs
    ex('squat', 'Barbell Back Squat', 'barbell', 10, ['quads', 'glutes']),
    ex('rdl', 'Barbell Romanian Deadlift', 'barbell', 10, ['hamstrings', 'glutes']),
    ex('walkingLunge', 'Walking Lunges', 'dumbbell', 5, ['quads', 'glutes'], { perSide: true }),
    ex('ballLegCurl', 'Stability-Ball Leg Curl', 'bodyweight', 0, ['hamstrings'], {
      cue: 'Or cable leg curl with an ankle strap.',
    }),
    ex('calfRaise', 'Single-Leg Calf Raise', 'dumbbell', 5, ['calves'], {
      perSide: true,
      cue: 'Stand on a plate, hold a dumbbell.',
    }),
    ex('bulgarian', 'Bulgarian Split Squat', 'dumbbell', 5, ['quads', 'glutes'], { perSide: true }),
    ex('hipThrust', 'Barbell Hip Thrust', 'barbell', 10, ['glutes']),
    ex('cableLegExt', 'Cable Leg Extension', 'cable', 5, ['quads'], {
      perSide: true,
      cue: 'Ankle strap, seated on the bench. Or heels-raised goblet squat.',
    }),
    // Core
    ex('hangingLegRaise', 'Hanging Leg Raise', 'bodyweight', 0, ['abs']),
    ex('woodchopper', 'Cable Woodchopper', 'cable', 5, ['obliques'], { perSide: true }),
    ex('cableCrunch', 'Cable Crunch', 'cable', 5, ['abs']),
    ex('rollout', 'Barbell Rollout', 'bodyweight', 0, ['abs'], { cue: 'Or stability-ball rollout.' }),
    ex('sidePlank', 'Side Plank', 'bodyweight', 0, ['obliques'], { timed: true, perSide: true }),
    ex('plank', 'Plank', 'bodyweight', 0, ['abs'], { timed: true }),
    // Cardio
    ex('inclineWalk', 'Incline Walk or StairMaster', 'machine', 0, ['cardio'], { timed: true }),
  ].map((e) => [e.id, e]),
);

const p = (
  exerciseId: string,
  sets: number,
  repMin: number,
  repMax: number,
  restSec: number,
  extra: Partial<PrescribedExercise> = {},
): PrescribedExercise => ({ exerciseId, sets, repMin, repMax, restSec, scheme: 'double', ...extra });

export const TEMPLATES: Record<TemplateId, WorkoutTemplate> = {
  upperA: {
    id: 'upperA',
    name: 'Upper A',
    short: 'Heavy bench + back',
    exercises: [
      p('bench', 4, 5, 5, 180, { scheme: 'bench-heavy' }),
      p('pullup', 4, 6, 10, 150),
      p('inclineBarbell', 3, 8, 12, 120),
      p('cableRow', 3, 8, 12, 90),
      p('cableLateral', 3, 12, 20, 60),
      p('ohTricepsExt', 3, 10, 15, 60, { superset: 'A' }),
      p('inclineCurl', 3, 8, 12, 60, { superset: 'A' }),
      p('reverseCurl', 3, 8, 12, 60),
    ],
  },
  lowerA: {
    id: 'lowerA',
    name: 'Lower A',
    short: 'Squat + hinge + abs',
    exercises: [
      p('squat', 3, 6, 10, 180),
      p('rdl', 3, 8, 10, 150),
      p('walkingLunge', 2, 10, 10, 90),
      p('ballLegCurl', 3, 10, 15, 60),
      p('calfRaise', 3, 12, 15, 60),
      p('hangingLegRaise', 3, 10, 15, 60),
      p('woodchopper', 3, 12, 12, 60),
    ],
  },
  arms: {
    id: 'arms',
    name: 'Arms + Shoulders',
    short: 'Arms, delts, forearms',
    exercises: [
      p('closeGripBench', 3, 6, 8, 120),
      p('preacherCurl', 3, 10, 15, 60, { superset: 'A' }),
      p('leaningOhExt', 3, 10, 15, 60, { superset: 'A' }),
      p('bayesianCurl', 3, 10, 15, 60, { superset: 'B' }),
      p('pushdown', 3, 10, 15, 60, { superset: 'B' }),
      p('hammerCurl', 3, 8, 12, 60),
      p('lateralRaise', 3, 15, 20, 60),
      p('facePull', 3, 15, 20, 60),
      p('wristCurl', 3, 12, 20, 45, { superset: 'C' }),
      p('reverseWristCurl', 2, 15, 20, 45, { superset: 'C' }),
    ],
  },
  upperB: {
    id: 'upperB',
    name: 'Upper B',
    short: 'Bench volume + chest',
    exercises: [
      p('pausedBench', 4, 6, 8, 150, { startWeight: 135 }),
      p('barbellRow', 3, 8, 12, 120),
      p('dips', 3, 6, 12, 120),
      p('kneelingPulldown', 3, 10, 12, 60),
      p('cableFly', 3, 12, 15, 60),
      p('dbShoulderPress', 3, 8, 10, 90),
      p('rearDeltFly', 3, 15, 20, 60),
      p('skullCrusher', 3, 8, 12, 60, { superset: 'A' }),
      p('ezCurl', 3, 8, 12, 60, { superset: 'A' }),
    ],
  },
  lowerB: {
    id: 'lowerB',
    name: 'Lower B',
    short: 'Single-leg + glutes + abs',
    exercises: [
      p('bulgarian', 3, 8, 12, 90),
      p('hipThrust', 3, 8, 12, 120),
      p('cableLegExt', 3, 12, 15, 60),
      p('ballLegCurl', 2, 10, 15, 60),
      p('calfRaise', 3, 12, 15, 60),
      p('cableCrunch', 3, 10, 15, 60),
      p('rollout', 3, 8, 12, 60),
      p('sidePlank', 2, 30, 45, 45),
    ],
  },
  pmForearms: {
    id: 'pmForearms',
    name: 'Forearms + Grip',
    short: '15 min, light',
    secondary: true,
    exercises: [
      p('reverseCurl', 2, 12, 15, 45),
      p('wristCurl', 2, 15, 20, 45),
      p('deadHang', 2, 30, 60, 60),
    ],
  },
  pmAbs: {
    id: 'pmAbs',
    name: 'Abs + Obliques',
    short: '10–15 min',
    secondary: true,
    exercises: [p('hangingLegRaise', 3, 12, 15, 45), p('woodchopper', 2, 12, 12, 45), p('plank', 2, 45, 60, 45)],
  },
  pmArms: {
    id: 'pmArms',
    name: 'Arm Pump',
    short: '15 min, light',
    secondary: true,
    exercises: [p('ezCurl', 2, 15, 20, 45, { superset: 'A' }), p('pushdown', 2, 15, 20, 45, { superset: 'A' })],
  },
  pmCardio: {
    id: 'pmCardio',
    name: 'Incline Walk',
    short: '20–30 min',
    secondary: true,
    exercises: [p('inclineWalk', 1, 1200, 1800, 0)],
  },
};

/** Which main workout falls on each weekday (0 = Sunday). */
export function templateForWeekday(weekday: number, daysPerWeek: 4 | 5): TemplateId | null {
  const five: Record<number, TemplateId> = { 1: 'upperA', 2: 'lowerA', 3: 'arms', 5: 'upperB', 6: 'lowerB' };
  if (daysPerWeek === 4 && weekday === 3) return null;
  return five[weekday] ?? null;
}

/** The 4-day version moves the arms-day work onto the upper days. */
export function templateFor(id: TemplateId, daysPerWeek: 4 | 5): WorkoutTemplate {
  const t = TEMPLATES[id];
  if (daysPerWeek === 5) return t;
  if (id === 'upperA') {
    return { ...t, exercises: [...t.exercises, p('preacherCurl', 3, 10, 15, 60), p('pushdown', 3, 10, 15, 60)] };
  }
  if (id === 'upperB') {
    const [first, ...rest] = t.exercises;
    return {
      ...t,
      exercises: [first, p('closeGripBench', 3, 6, 8, 120), ...rest, p('preacherCurl', 3, 10, 15, 60), p('pushdown', 3, 10, 15, 60)],
    };
  }
  return t;
}

export interface BenchStep {
  /** Each group is a number of sets at a fraction of the block's max. */
  groups: { sets: number; reps: number; pct: number; label?: string }[];
  easy?: boolean;
  test?: boolean;
  note?: string;
}

/** The 12-step Monday bench table. Percentages are of the block's starting max. */
export const BENCH_STEPS: BenchStep[] = [
  { groups: [{ sets: 4, reps: 5, pct: 150 / 195 }] },
  { groups: [{ sets: 4, reps: 5, pct: 155 / 195 }] },
  { groups: [{ sets: 4, reps: 5, pct: 160 / 195 }] },
  { groups: [{ sets: 5, reps: 3, pct: 165 / 195 }] },
  { groups: [{ sets: 5, reps: 3, pct: 170 / 195 }] },
  { groups: [{ sets: 3, reps: 5, pct: 135 / 195 }], easy: true, note: 'Easy week.' },
  { groups: [{ sets: 4, reps: 3, pct: 175 / 195 }] },
  { groups: [{ sets: 4, reps: 2, pct: 180 / 195 }] },
  { groups: [{ sets: 3, reps: 2, pct: 185 / 195 }], note: 'Use the safety arms.' },
  {
    groups: [
      { sets: 1, reps: 1, pct: 1, label: 'Top single' },
      { sets: 3, reps: 3, pct: 165 / 195, label: 'Back-off' },
    ],
    note: 'Use the safety arms.',
  },
  {
    groups: [
      { sets: 1, reps: 1, pct: 1.03, label: 'Top single' },
      { sets: 2, reps: 3, pct: 165 / 195, label: 'Back-off' },
    ],
    note: 'Only go for the top single if last week’s single moved fast.',
  },
  {
    groups: [{ sets: 1, reps: 1, pct: 1.05, label: 'Max attempt' }],
    test: true,
    note: 'Light week, then test. Warm up: bar ×10, then build up in 3–4 sets.',
  },
];

/** Weeks 6 and 12 of each 12-week block are easy weeks. */
export const DELOAD_BLOCK_WEEKS = [6, 12];
