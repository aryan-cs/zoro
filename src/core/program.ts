import type { ExerciseDef, ISODate, PrescribedExercise, TemplateId, WorkoutTemplate } from './types';

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
    // Posture, on rest days: tight hip flexors (pelvic tilt), a rounded upper back and chest, a
    // forward head, then core control. About ten minutes in all.
    ex('hipFlexorStretch', 'Kneeling Hip-Flexor Stretch', 'bodyweight', 0, ['hip flexors'], { timed: true, perSide: true }),
    ex('thoracicExtension', 'Ball Thoracic Extension', 'bodyweight', 0, ['upper back']),
    ex('doorwayChestStretch', 'Doorway Chest Stretch', 'bodyweight', 0, ['chest', 'shoulders'], { timed: true, perSide: true }),
    ex('chinTuck', 'Chin Tucks', 'bodyweight', 0, ['neck']),
    ex('deadBug', 'Dead Bug', 'bodyweight', 0, ['abs'], { perSide: true }),
    // Earlier versions' rest-day block (the moves above in one), kept so old workouts still show.
    ex('postureMobility', 'Posture and Mobility', 'bodyweight', 0, ['posture'], { timed: true }),
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

/**
 * The week: four days of about an hour, warm-ups included (workoutTime.ts times them; the tests
 * keep them there). Mon heavy bench + back + arms, Tue legs + abs + forearms, Thu volume bench +
 * back + shoulders, Fri paused or close-grip bench + legs + arms, Sat an optional short arm day,
 * Sun and Wed rest (steps, an easy walk and posture work).
 *
 * Measured first: the earlier plan's days were 23–31 sets one exercise at a time, about four
 * minutes a set, so 1.5–2 hours. Now nearly everything is paired (exercises sharing a superset
 * label are done in rounds: a set of each, then the rest):
 * - Supersets cut session time by about a third with the same reps, strength and growth
 *   (Zhang 2025, Sports Med meta-analysis; Iversen 2021 "No Time to Lift?"). Pairs are opposing
 *   muscles or ones that don't compete, never the same muscle twice.
 * - Each bench set is paired with a pull (rows or pull-ups): pulling between bench sets keeps or
 *   raises bench reps (Robbins 2010, Paz 2017), with about 3–4 minutes from one bench set to the
 *   next (Behenck 2022: shorter cuts bench volume).
 * - Weekly sets while cutting, per muscle: chest 10–12 (bench three days), biceps and triceps
 *   about 9 each, forearms about 9, back about 11, side delts 6, quads and hamstrings about 5–6,
 *   abs 6. Growth keeps rising with sets but each extra set adds less (Pelland 2026, Schoenfeld
 *   2017), strength needs few sets (Pelland 2026), and in a deficit fewer sets at high effort
 *   keep muscle as well as more (Roth 2023, Bickel 2011, Spiering 2021).
 * - Rest: about 2.5 minutes after a pair with a big lift in it, 60–75 seconds after an
 *   isolation pair (Schoenfeld 2016, Grgic 2018, Singer 2024).
 * Five days wouldn't help: at the same weekly sets, how often you train doesn't change growth
 * (Schoenfeld 2019), and bench already comes three times a week.
 *
 * An exercise that shows up on two days keeps the same rep range, so its weights carry over.
 */
export const TEMPLATES: Record<TemplateId, WorkoutTemplate> = {
  upperA: {
    id: 'upperA',
    name: 'Heavy Bench, Back, and Arms',
    short: 'Heavy bench with pull-ups, arms, abs',
    exercises: [
      p('bench', 4, 1, 8, 150, { scheme: 'bench-heavy', superset: 'bench' }),
      p('pullup', 4, 4, 8, 150, { superset: 'bench' }), // about 4 now: build reps first, then add weight
      p('ohTricepsExt', 3, 8, 12, 75, { superset: 'arms' }),
      p('inclineCurl', 3, 8, 12, 75, { superset: 'arms' }),
      p('reverseCurl', 3, 10, 15, 60, { superset: 'core' }),
      p('cableCrunch', 3, 10, 15, 60, { superset: 'core' }),
    ],
  },
  lowerA: {
    id: 'lowerA',
    name: 'Legs, Abs, and Forearms',
    short: 'Squat, RDL, abs, forearms',
    exercises: [
      p('squat', 3, 5, 8, 150, { superset: 'squat' }),
      p('hangingLegRaise', 3, 8, 15, 150, { superset: 'squat' }),
      p('rdl', 3, 6, 10, 120, { superset: 'rdl' }),
      p('lateralRaise', 3, 12, 20, 120, { superset: 'rdl' }),
      p('wristCurl', 3, 12, 20, 60, { superset: 'forearms' }),
      p('reverseWristCurl', 3, 12, 20, 60, { superset: 'forearms' }),
    ],
  },
  upperB: {
    id: 'upperB',
    name: 'Bench, Back, and Shoulders',
    short: 'Volume bench with rows, arms, delts',
    exercises: [
      p('bench', 4, 3, 8, 150, { scheme: 'bench-volume', superset: 'bench' }),
      p('cableRow', 4, 8, 12, 150, { superset: 'bench' }),
      p('preacherCurl', 3, 8, 12, 75, { superset: 'arms' }),
      p('pushdown', 3, 10, 15, 75, { superset: 'arms' }),
      p('lateralRaise', 3, 12, 20, 60, { superset: 'delts' }),
      p('rearDeltFly', 3, 12, 20, 60, { superset: 'delts' }),
    ],
  },
  lowerB: {
    id: 'lowerB',
    name: 'Bench, Legs, and Arms',
    short: 'Paused or close-grip bench with rows, legs, arms',
    exercises: [
      p('pausedBench', 3, 3, 6, 150, { scheme: 'bench-variation', superset: 'bench' }),
      p('barbellRow', 3, 8, 12, 150, { superset: 'bench' }),
      p('bulgarian', 3, 8, 12, 90, { superset: 'legs' }),
      p('ballLegCurl', 2, 8, 15, 90, { superset: 'legs' }),
      p('hammerCurl', 3, 8, 12, 60, { superset: 'arms' }),
      p('leaningOhExt', 3, 10, 15, 60, { superset: 'arms' }),
    ],
  },
  arms: {
    id: 'arms',
    name: 'Arms, Shoulders, and Abs',
    short: 'Optional, about half an hour',
    exercises: [
      p('cableLateral', 3, 12, 20, 60, { superset: 'delts' }),
      p('rearDeltFly', 3, 12, 20, 60, { superset: 'delts' }),
      p('ezCurl', 3, 8, 12, 60, { superset: 'arms' }),
      p('pushdown', 3, 10, 15, 60, { superset: 'arms' }),
      p('wristCurl', 2, 12, 20, 45, { superset: 'forearms' }),
      p('reverseWristCurl', 2, 12, 20, 45, { superset: 'forearms' }),
    ],
  },
  pmCardio: {
    id: 'pmCardio',
    name: 'Walk and Posture',
    short: 'Rest day, optional and easy',
    secondary: true,
    exercises: [
      p('inclineWalk', 1, 1200, 1800, 0),
      p('hipFlexorStretch', 2, 45, 45, 15),
      p('thoracicExtension', 2, 10, 10, 30),
      p('doorwayChestStretch', 2, 30, 30, 15),
      p('chinTuck', 2, 10, 10, 30),
      p('deadBug', 2, 8, 8, 30),
    ],
  },
  extra: {
    id: 'extra',
    name: 'Extra Exercises',
    short: 'Added on top of the day',
    secondary: true,
    exercises: [],
  },
  // Earlier versions' second sessions, kept so old workouts still show their names.
  pmForearms: {
    id: 'pmForearms',
    name: 'Forearms & Grip',
    short: '15 min, light',
    secondary: true,
    exercises: [p('reverseCurl', 2, 12, 15, 45), p('wristCurl', 2, 15, 20, 45), p('deadHang', 2, 30, 60, 60)],
  },
  pmAbs: {
    id: 'pmAbs',
    name: 'Abs & Obliques',
    short: '10–15 min',
    secondary: true,
    exercises: [p('hangingLegRaise', 3, 12, 15, 45), p('woodchopper', 2, 12, 12, 45), p('plank', 2, 45, 60, 45)],
  },
  pmArms: {
    id: 'pmArms',
    name: 'Biceps & Triceps',
    short: '15 min, light',
    secondary: true,
    exercises: [p('ezCurl', 2, 15, 20, 45), p('pushdown', 2, 15, 20, 45)],
  },
};

/**
 * Which main workout falls on each weekday (0 = Sunday). Saturday's arm day is the optional one:
 * part of the week with 5 days, offered on top of a rest day with 4.
 */
export function templateForWeekday(weekday: number, daysPerWeek: 4 | 5): TemplateId | null {
  const week: Record<number, TemplateId> = { 1: 'upperA', 2: 'lowerA', 4: 'upperB', 5: 'lowerB' };
  if (weekday === 6 && daysPerWeek === 5) return 'arms';
  return week[weekday] ?? null;
}

/** A day's main workout: the program's for that weekday, unless you swapped it for another (or a rest). */
export function workoutFor(date: ISODate, settings: { daysPerWeek: 4 | 5; workoutSwaps?: Record<ISODate, TemplateId | 'rest'> }): TemplateId | null {
  const swap = settings.workoutSwaps?.[date];
  if (swap) return swap === 'rest' ? null : swap;
  return templateForWeekday(new Date(`${date}T12:00`).getDay(), settings.daysPerWeek);
}

/** The optional workout offered on a day, if any: the Saturday arm day (with 4 days) or the rest days' walk. */
export function optionalForWeekday(weekday: number, daysPerWeek: 4 | 5): TemplateId | null {
  if (weekday === 6) return daysPerWeek === 4 ? 'arms' : null;
  if (weekday === 0 || weekday === 3) return 'pmCardio';
  return null;
}

/** A workout as planned (the same every week; the number of days only moves Saturday). */
export function templateFor(id: TemplateId, _daysPerWeek: 4 | 5): WorkoutTemplate {
  return TEMPLATES[id];
}

/**
 * How an exercise added by hand is done: as the program does it wherever it has it (the same rep
 * range, so its weights carry over), otherwise three sets in a range that suits the kind of move.
 */
export function prescriptionFor(exerciseId: string): PrescribedExercise {
  for (const t of Object.values(TEMPLATES)) {
    const found = t.exercises.find((x) => x.exerciseId === exerciseId && x.scheme === 'double');
    if (found) return { ...found, superset: undefined };
  }
  const def = EXERCISES[exerciseId];
  if (def?.timed) return p(exerciseId, 3, 30, 60, 60);
  if (def?.kind === 'barbell') return p(exerciseId, 3, 6, 10, 150);
  return p(exerciseId, 3, 10, 15, 90);
}

/** A workout with exercises added to the end of it. */
export function withExtras(template: WorkoutTemplate, extras: string[] | undefined): WorkoutTemplate {
  const more = (extras ?? []).filter((id) => EXERCISES[id]);
  return more.length ? { ...template, exercises: [...template.exercises, ...more.map(prescriptionFor)] } : template;
}

/** Sets at a fraction of the current bench max ("Top set", "Back-off"...). */
export interface BenchGroup {
  sets: number;
  reps: number;
  pct: number;
  label?: string;
}

/**
 * One week of the bench plan: the heavy day (a top set, then back-off sets), the volume day
 * (moderate weight, more reps) and the variation day (paused or close-grip). Percentages are of
 * the current max: the week-1 estimate for weeks 1–11, the week-12 test after that.
 */
export interface BenchStep {
  heavy: BenchGroup[];
  volume?: BenchGroup[];
  variation?: { exerciseId: 'pausedBench' | 'closeGripBench'; groups: BenchGroup[] };
  /** An easy week (deload or taper): it always counts as done. */
  easy?: boolean;
  /** Week 1: the first set is as many reps as you can (stop with one left); it sets the max. */
  calibrate?: boolean;
  /** Ends with a max attempt; the best set becomes the max for what follows. */
  test?: boolean;
  note?: string;
}

const g = (sets: number, reps: number, load: number, base: number, label?: string): BenchGroup => ({ sets, reps, pct: load / base, label });
const A = (sets: number, reps: number, load: number, label?: string) => g(sets, reps, load, 195, label);
const B = (sets: number, reps: number, load: number, label?: string) => g(sets, reps, load, 210, label);
const paused = (groups: BenchGroup[]) => ({ exerciseId: 'pausedBench' as const, groups });
const close = (groups: BenchGroup[]) => ({ exerciseId: 'closeGripBench' as const, groups });

/**
 * 27 weeks from about 195 to 225 (late November to the end of May), built from the research:
 * a heavy top set plus back-off sets (Androulakis-Korakakis 2021), heavier loads for strength
 * (Schoenfeld 2017), bench two or three times a week for practice and volume (Ralston 2018,
 * Grgic 2018), RPE caps on singles (Helms 2018), and a slow cut that keeps strength (Garthe 2011).
 * Loads written for a 195 max (weeks 1–12) and a 210 max (weeks 13–27); they scale to yours.
 */
export const BENCH_STEPS: BenchStep[] = [
  // Block 1: find the real max, then build toward heavy singles.
  {
    heavy: [A(1, 8, 165, 'As many as you can'), A(3, 5, 145, 'Back-off')],
    volume: [A(4, 8, 125)],
    variation: paused([A(3, 5, 125)]),
    calibrate: true,
    note: 'First set: as many good reps as you can, stopping with one left. That sets your max.',
  },
  { heavy: [A(1, 3, 155, 'Top set'), A(4, 5, 145, 'Back-off')], volume: [A(4, 8, 130)], variation: paused([A(3, 5, 130)]) },
  { heavy: [A(1, 3, 160, 'Top set'), A(4, 5, 145, 'Back-off')], volume: [A(4, 8, 135)], variation: paused([A(3, 5, 135)]) },
  { heavy: [A(1, 3, 165, 'Top set'), A(4, 5, 150, 'Back-off')], volume: [A(4, 7, 140)], variation: close([A(3, 6, 135)]) },
  { heavy: [A(1, 3, 170, 'Top set'), A(4, 4, 155, 'Back-off')], volume: [A(4, 6, 145)], variation: close([A(3, 6, 140)]) },
  { heavy: [A(3, 3, 145)], volume: [A(3, 5, 125)], easy: true, note: 'Easy week.' },
  { heavy: [A(1, 1, 175, 'Top single'), A(3, 4, 155, 'Back-off')], volume: [A(4, 6, 145)], variation: paused([A(3, 4, 145)]) },
  { heavy: [A(1, 1, 180, 'Top single'), A(3, 3, 165, 'Back-off')], volume: [A(4, 5, 150)], variation: paused([A(3, 3, 150)]) },
  { heavy: [A(1, 1, 185, 'Top single'), A(3, 3, 165, 'Back-off')], volume: [A(4, 5, 155)], variation: close([A(3, 5, 145)]), note: 'Use the safety arms.' },
  { heavy: [A(1, 1, 190, 'Top single'), A(3, 2, 170, 'Back-off')], volume: [A(3, 5, 155)], variation: close([A(3, 5, 150)]), note: 'Single: leave a rep in the tank.' },
  { heavy: [A(1, 1, 175, 'Top single'), A(2, 3, 155, 'Back-off')], volume: [A(3, 3, 145)], easy: true, note: 'Light week before the test. Move the bar fast.' },
  {
    heavy: [A(1, 5, 135, 'Warm-up'), A(1, 3, 155, 'Warm-up'), A(1, 1, 175, 'Warm-up'), A(1, 1, 190, 'Warm-up'), A(1, 1, 200, 'Warm-up'), A(1, 1, 210, 'Max attempt')],
    volume: [A(3, 5, 0.7 * 195)],
    variation: paused([A(3, 5, 0.65 * 195)]),
    test: true,
    note: 'Test day. Use the safety arms; go for the last single only if 200 moved well.',
  },
  // Block 2: from the tested max to 225.
  { heavy: [B(1, 3, 175, 'Top set'), B(4, 5, 155, 'Back-off')], volume: [B(4, 8, 140)], variation: paused([B(3, 5, 145)]) },
  { heavy: [B(1, 3, 180, 'Top set'), B(4, 5, 165, 'Back-off')], volume: [B(4, 7, 145)], variation: paused([B(3, 5, 150)]) },
  { heavy: [B(1, 3, 185, 'Top set'), B(4, 4, 170, 'Back-off')], volume: [B(4, 6, 150)], variation: close([B(3, 6, 145)]) },
  { heavy: [B(1, 2, 190, 'Top set'), B(4, 4, 170, 'Back-off')], volume: [B(4, 6, 155)], variation: close([B(3, 5, 155)]) },
  { heavy: [B(1, 1, 195, 'Top single'), B(3, 3, 180, 'Back-off')], volume: [B(4, 5, 165)], variation: close([B(3, 5, 165)]) },
  { heavy: [B(3, 3, 155)], volume: [B(3, 5, 135)], easy: true, note: 'Easy week.' },
  { heavy: [B(1, 1, 195, 'Top single'), B(3, 3, 180, 'Back-off')], volume: [B(4, 5, 165)], variation: paused([B(3, 4, 155)]) },
  { heavy: [B(1, 1, 200, 'Top single'), B(3, 3, 180, 'Back-off')], volume: [B(4, 4, 170)], variation: paused([B(3, 3, 165)]) },
  { heavy: [B(1, 1, 205, 'Top single'), B(3, 2, 185, 'Back-off')], volume: [B(3, 4, 175)], variation: close([B(3, 4, 165)]), note: 'Use the safety arms.' },
  { heavy: [B(1, 1, 210, 'Top single'), B(3, 2, 185, 'Back-off')], volume: [B(3, 4, 175)], variation: close([B(3, 4, 170)]), note: 'Single: leave a rep in the tank.' },
  { heavy: [B(1, 1, 180, 'Top single'), B(2, 3, 155, 'Back-off')], volume: [B(3, 4, 145)], easy: true, note: 'Easy week.' },
  { heavy: [B(1, 1, 205, 'Single'), B(1, 1, 215, 'Top single'), B(3, 2, 185, 'Back-off')], volume: [B(3, 4, 175)], variation: paused([B(3, 3, 165)]), note: 'Leave a rep in the tank on both singles.' },
  { heavy: [B(1, 1, 210, 'Single'), B(1, 1, 217.5, 'Top single'), B(2, 2, 190, 'Back-off')], volume: [B(3, 3, 180)], variation: close([B(2, 4, 170)]), note: 'Leave a rep in the tank on both singles.' },
  { heavy: [B(1, 1, 200, 'Single'), B(2, 2, 180, 'Back-off')], volume: [B(3, 3, 155)], easy: true, note: 'Light week before the test. Move the bar fast.' },
  {
    heavy: [B(1, 5, 135, 'Warm-up'), B(1, 3, 165, 'Warm-up'), B(1, 1, 185, 'Warm-up'), B(1, 1, 200, 'Warm-up'), B(1, 1, 210, 'Warm-up'), B(1, 1, 225, 'Max attempt')],
    test: true,
    note: 'Test day: 225. Use the safety arms.',
  },
];
/** After the last week, the plan carries on from here (block 2) with the newly tested max. */
export const BENCH_REPEAT_FROM = 12;

/**
 * Easy weeks (half the sets, lighter effort), lined up with the bench plan's: weeks 6, 12 (the
 * first test), 18 and 23 of the 27, then every sixth week after.
 */
export const DELOAD_WEEKS = [6, 12, 18, 23];

/**
 * How far through the day's workouts you are, 0–100: each workout counts the share of its
 * exercises with at least one set logged (finished counts as all), averaged over the workouts.
 * On exercise 3 of 10 is 30%; one done and one halfway is 75%. Null with nothing planned.
 */
export function workoutDayPercent(
  planned: TemplateId[],
  sessions: { id?: number; templateId: TemplateId; finishedAt?: number }[],
  sets: { sessionId: number; exerciseId: string }[],
  daysPerWeek: 4 | 5,
): number | null {
  // Extra exercises are on top of the day's workouts: they don't make it more or less done.
  const ids = [...new Set([...planned, ...sessions.map((x) => x.templateId)])].filter((id) => id !== 'extra');
  if (!ids.length) return null;
  let sum = 0;
  for (const id of ids) {
    const runs = sessions.filter((x) => x.templateId === id);
    if (runs.some((x) => x.finishedAt)) {
      sum += 1;
      continue;
    }
    const total = templateFor(id, daysPerWeek).exercises.length;
    const started = new Set(sets.filter((x) => runs.some((r) => r.id === x.sessionId)).map((x) => x.exerciseId)).size;
    sum += total ? Math.min(1, started / total) : 0;
  }
  return Math.round((sum / ids.length) * 100);
}
