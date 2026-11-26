/**
 * How to do each exercise: two photos of it (start and end, shown in turn like a GIF), a couple of
 * short pointers on form, and how hard to push (said for the set you're on: see effortTip).
 *
 * Photos: Free Exercise DB (github.com/yuhonas/free-exercise-db), public domain (Unlicense),
 * resized to 600px WebP in public/exercises/ and precached with the app so they show offline.
 * Where the dataset has no exact match, the closest movement stands in.
 */
export interface Guide {
  /** Photo name in public/exercises/: `${photo}-0.webp` and `${photo}-1.webp`. */
  photo: string;
  /** Show only the first photo (the second is a different movement: a dead hang from a pull-up). */
  still?: boolean;
  /** Form pointers (with the effort line, three at most). */
  tips: string[];
  /** How close to failure to take its sets. Holds and walks have none. */
  effort?: Effort;
  /** A few words after the effort line, saying why. */
  why?: string;
}

/**
 * Animations of each exercise, streamed from RepCount's site (repcountapp.com) when you open it:
 * nothing of theirs is copied into this app. Where RepCount has no animation of the exercise, the
 * nearest one it has stands in; without one at all (dead hang, woodchopper, side plank), or when
 * a video won't load (offline), the photos above show instead.
 */
export const VIDEO_BASE = 'https://www.repcountapp.com/videos/exercises/';
export const VIDEO: Record<string, string> = {
  bench: 'bench-press',
  pausedBench: 'bench-press',
  closeGripBench: 'close-grip-bench-press',
  inclineBarbell: 'incline-bench-press',
  dips: 'dips',
  cableFly: 'cable-crossover',
  dbShoulderPress: 'dumbbell-shoulder-press',
  pullup: 'pull-up',
  cableRow: 'seated-cable-row',
  barbellRow: 'barbell-row',
  kneelingPulldown: 'single-arm-lat-pulldown',
  facePull: 'band-face-pull',
  rearDeltFly: 'rear-delt-fly',
  cableLateral: 'cable-lateral-raise',
  lateralRaise: 'dumbbell-lateral-raise',
  ohTricepsExt: 'overhead-cable-triceps-extension',
  leaningOhExt: 'single-arm-tricep-extension',
  pushdown: 'triceps-pushdown',
  skullCrusher: 'dumbbell-skull-crusher',
  inclineCurl: 'incline-dumbbell-curl',
  preacherCurl: 'preacher-curl',
  bayesianCurl: 'cable-curl',
  hammerCurl: 'hammer-curl',
  ezCurl: 'ez-bar-curl',
  reverseCurl: 'reverse-curl',
  wristCurl: 'dumbbell-wrist-curl',
  reverseWristCurl: 'reverse-wrist-curl',
  squat: 'squat',
  rdl: 'romanian-deadlift',
  walkingLunge: 'walking-lunges',
  ballLegCurl: 'swiss-ball-leg-curl',
  calfRaise: 'standing-dumbbell-calf-raise',
  bulgarian: 'smith-machine-bulgarian-split-squat',
  hipThrust: 'hip-thrust',
  cableLegExt: 'leg-extension',
  hangingLegRaise: 'hanging-leg-raise',
  cableCrunch: 'cable-crunch',
  rollout: 'ab-wheel-rollout',
  plank: 'front-plank',
  inclineWalk: 'treadmill',
};
export const videoUrl = (exerciseId: string) => (VIDEO[exerciseId] ? `${VIDEO_BASE}${VIDEO[exerciseId]}.mp4` : undefined);

/** Fetches a workout's animations ahead of time (once each), so they're cached before you swipe to one. */
const warmed = new Set<string>();
export function warmVideos(exerciseIds: string[]) {
  for (const id of exerciseIds) {
    const url = videoUrl(id);
    if (!url || warmed.has(url)) continue;
    warmed.add(url);
    void fetch(url, { mode: 'no-cors' }).catch(() => warmed.delete(url));
  }
}

/**
 * How hard to push an exercise's sets:
 * - last: stop a rep or two short, and take the last set to failure (isolation work)
 * - every: take every set to failure (calves, wrists)
 * - one / two: stop a rep, or a rep or two, short of failure on every set (heavy or awkward lifts)
 */
export type Effort = 'last' | 'every' | 'one' | 'two';

/** What to say about failure for the set you're on (`last`: the exercise's final set). */
export function effortTip(guide: Guide, last: boolean): string | undefined {
  const why = guide.why ? ` ${guide.why}` : '';
  switch (guide.effort) {
    case 'last':
      return last ? 'Take this set to failure.' : 'Stop a rep or two short of failure. Save that for the last set.';
    case 'every':
      return 'Take this set to failure.';
    case 'one':
      return `Stop a rep short of failure.${why}`;
    case 'two':
      return `Stop a rep or two short of failure.${why}`;
    default:
      return undefined;
  }
}

export const GUIDE: Record<string, Guide> = {
  bench: {
    photo: 'barbell-bench-press-medium-grip',
    tips: [
      'Shoulder blades pinched and down, feet planted. Lower the bar to your lower chest with your elbows about 45° from your sides.',
      'Touch your chest without bouncing, then press back up toward your face.',
    ],
    effort: 'two',
    why: 'A missed rep under a heavy bar is how benching goes wrong.',
  },
  pausedBench: {
    photo: 'barbell-bench-press-medium-grip',
    tips: ['Lower under control and hold the bar still on your chest for a full second before you press.', 'Use less than your regular bench: the pause takes away the bounce.'],
    effort: 'two',
  },
  closeGripBench: {
    photo: 'close-grip-barbell-bench-press',
    tips: ['Hands about shoulder-width apart, elbows tucked close to your sides on the way down.', 'Touch a little lower on your chest than a regular bench.'],
    effort: 'one',
    why: 'Your triceps give out quickly.',
  },
  inclineBarbell: {
    photo: 'barbell-incline-bench-press-medium-grip',
    tips: ['Bench at about 30°. Lower the bar to your upper chest, just below your collarbones.', 'Keep your shoulder blades back and your hips on the bench.'],
    effort: 'two',
  },
  dips: {
    photo: 'dips-chest-version',
    tips: [
      'Lean forward a little and let your elbows flare slightly to work your chest.',
      'Go down until your shoulders are just below your elbows, or as far as your shoulders feel good.',
    ],
    effort: 'last',
  },
  cableFly: {
    photo: 'cable-crossover',
    tips: [
      'Pulleys high, a slight bend in your elbows that stays fixed. Bring your hands together in front of your hips.',
      'Think of hugging a barrel: the movement is at your shoulders, not your elbows.',
    ],
    effort: 'last',
  },
  dbShoulderPress: {
    photo: 'seated-dumbbell-press',
    tips: [
      'Back against the bench, dumbbells at shoulder height, palms forward.',
      'Press up and slightly in until your arms are straight, and keep your ribs down so your lower back doesn’t arch.',
    ],
    effort: 'two',
  },
  pullup: {
    photo: 'pullups',
    tips: ['Start from a dead hang. Pull your chest toward the bar, leading with your elbows.', 'Lower all the way down, under control, on every rep.'],
    effort: 'last',
  },
  cableRow: {
    photo: 'seated-cable-rows',
    tips: [
      'Sit tall with your knees slightly bent and pull the handle to your belly button.',
      'Squeeze your shoulder blades together at the end, then let them stretch forward, without rocking your torso.',
    ],
    effort: 'last',
  },
  barbellRow: {
    photo: 'bent-over-barbell-row',
    tips: ['Hinge until your torso is close to parallel, back flat, knees soft.', 'Pull the bar to your lower ribs and lower it under control.'],
    effort: 'two',
    why: 'Your form gives out before your back does.',
  },
  kneelingPulldown: {
    photo: 'one-arm-lat-pulldown',
    tips: ['Kneel facing the pulley and pull the handle down to your side, elbow tucked in.', 'Let your arm reach all the way up at the top for a full stretch.'],
    effort: 'last',
  },
  facePull: {
    photo: 'face-pull',
    tips: [
      'Rope at face height and a light weight. Pull it toward your forehead so your hands end up beside your ears.',
      'Elbows high and out, like showing off your biceps at the end.',
    ],
    effort: 'last',
  },
  rearDeltFly: {
    photo: 'seated-bent-over-rear-delt-raise',
    tips: [
      'Bend forward at the hips with a flat back and let light dumbbells hang.',
      'Raise them out to the sides with a slight bend in your elbows, leading with your pinkies.',
    ],
    effort: 'last',
  },
  cableLateral: {
    photo: 'cable-seated-lateral-raise',
    tips: ['Stand side-on to a low pulley and raise your arm out to the side, up to shoulder height.', 'Lead with your elbow, keep a small bend in it, and don’t shrug.'],
    effort: 'last',
  },
  lateralRaise: {
    photo: 'side-lateral-raise',
    tips: [
      'Raise the dumbbells out to your sides, up to shoulder height, elbows slightly bent.',
      'Lead with your elbows and keep your shoulders down, away from your ears.',
    ],
    effort: 'last',
  },
  ohTricepsExt: {
    photo: 'cable-rope-overhead-triceps-extension',
    tips: [
      'Face away from the pulley, rope behind your head, elbows pointing forward.',
      'Straighten your arms overhead, then let them bend all the way back for a deep stretch, elbows still.',
    ],
    effort: 'last',
  },
  leaningOhExt: {
    photo: 'cable-rope-overhead-triceps-extension',
    tips: [
      'One arm at a time. Lean forward with the cable coming from behind you, elbow beside your head and pointing ahead.',
      'Let the cable pull your hand far behind your head, then straighten your arm.',
    ],
    effort: 'last',
  },
  pushdown: {
    photo: 'triceps-pushdown',
    tips: ['Elbows pinned to your sides. Push down until your arms are straight.', 'Let the bar rise until your forearms are just past parallel, then push again.'],
    effort: 'last',
  },
  skullCrusher: {
    photo: 'ez-bar-skullcrusher',
    tips: [
      'Lower the weight toward your forehead, or just behind your head, bending only at your elbows.',
      'Keep your upper arms angled slightly back toward your head.',
    ],
    effort: 'one',
    why: 'Your elbows will thank you.',
  },
  inclineCurl: {
    photo: 'incline-dumbbell-curl',
    tips: ['Bench at about 45°, arms hanging straight down behind your body.', 'Curl without letting your elbows drift forward, then lower all the way.'],
    effort: 'last',
  },
  preacherCurl: {
    photo: 'cable-preacher-curl',
    tips: ['Upper arm flat on the pad. Curl up, then lower until your arm is almost straight.', 'Go slowly at the bottom, where the stretch is biggest.'],
    effort: 'last',
  },
  bayesianCurl: {
    photo: 'standing-one-arm-cable-curl',
    tips: [
      'One arm at a time. Face away from a low pulley so the cable pulls your arm back behind you.',
      'Keep your elbow back as you curl; don’t let it swing forward.',
    ],
    effort: 'last',
  },
  hammerCurl: {
    photo: 'hammer-curls',
    tips: ['Palms facing each other the whole time. Curl without swinging.', 'Keep your elbows at your sides and lower all the way.'],
    effort: 'last',
  },
  ezCurl: {
    photo: 'ez-bar-curl',
    tips: ['Elbows at your sides. Curl up and lower under control.', 'No swinging: if you have to lean back, the weight is too heavy.'],
    effort: 'last',
  },
  reverseCurl: {
    photo: 'reverse-barbell-curl',
    tips: ['Palms facing down, hands about shoulder-width apart. Curl with your elbows at your sides.', 'Go lighter than a regular curl and keep your wrists straight.'],
    effort: 'last',
  },
  wristCurl: {
    photo: 'palms-up-barbell-wrist-curl-over-a-bench',
    tips: ['Forearms on a bench or your thighs, palms up, wrists just past the edge.', 'Let the bar roll down to your fingertips, then curl it back up with your wrists.'],
    effort: 'every',
  },
  reverseWristCurl: {
    photo: 'palms-down-wrist-curl-over-a-bench',
    tips: ['Forearms supported, palms facing down, and a light weight.', 'Raise the backs of your hands as high as you can, then lower slowly.'],
    effort: 'every',
  },
  deadHang: {
    photo: 'pullups',
    still: true,
    tips: ['Hang from the bar with straight arms, shoulders engaged rather than shrugged up to your ears.', 'Breathe and hold for the full time; drop when your grip gives out.'],
  },
  squat: {
    photo: 'barbell-squat',
    tips: [
      'Bar on your upper back, feet about shoulder-width apart, toes turned out slightly.',
      'Sit down between your heels until your thighs are at least parallel, chest up, knees following your toes.',
    ],
    effort: 'two',
    why: 'Squat inside the rack with the safety arms set.',
  },
  rdl: {
    photo: 'romanian-deadlift',
    tips: ['Knees soft. Push your hips back and slide the bar down your thighs.', 'Go until you feel a strong stretch in your hamstrings, keeping your back flat.'],
    effort: 'two',
    why: 'Don’t round your back to get lower.',
  },
  walkingLunge: {
    photo: 'dumbbell-lunges',
    tips: ['Take a long step and lower your back knee toward the floor.', 'Push through your front heel into the next step, torso upright.'],
    effort: 'one',
  },
  ballLegCurl: {
    photo: 'ball-leg-curl',
    tips: ['Lie on your back with your heels on the ball and lift your hips.', 'Roll the ball in toward you with your hips up, then roll it out slowly.'],
    effort: 'last',
  },
  calfRaise: {
    photo: 'standing-dumbbell-calf-raise',
    tips: ['On one foot on the edge of a step or plate, holding a dumbbell.', 'Lower your heel as far as it goes, pause, then rise all the way onto your toes.'],
    effort: 'every',
  },
  bulgarian: {
    photo: 'split-squat-with-dumbbells',
    tips: [
      'Back foot up on a bench, front foot far enough forward that your knee stays over your foot.',
      'Lower straight down until your back knee nearly touches the floor.',
    ],
    effort: 'one',
    why: 'Your balance goes first.',
  },
  hipThrust: {
    photo: 'barbell-hip-thrust',
    tips: [
      'Upper back on a bench, bar across your hips on a pad.',
      'Drive through your heels until your hips line up with your knees and shoulders, chin tucked. Pause and squeeze at the top.',
    ],
    effort: 'one',
  },
  cableLegExt: {
    photo: 'leg-extensions',
    tips: ['Seated, ankle strap on, starting with your knee bent.', 'Straighten your leg fully and squeeze, then lower slowly.'],
    effort: 'last',
  },
  hangingLegRaise: {
    photo: 'hanging-leg-raise',
    tips: [
      'Raise your legs by curling your pelvis up, not just lifting your thighs.',
      'Lower slowly without swinging. Bend your knees if straight legs are too hard.',
    ],
    effort: 'last',
  },
  woodchopper: {
    photo: 'standing-cable-wood-chop',
    tips: [
      'Pulley high, standing side-on. Pull the handle down and across your body to the opposite hip.',
      'Turn through your torso with your arms mostly straight, pivoting on your back foot, and control it back up.',
    ],
    effort: 'last',
  },
  cableCrunch: {
    photo: 'cable-crunch',
    tips: ['Kneel facing the pulley with the rope beside your head.', 'Crunch your ribs toward your hips, rounding your back, instead of just bending at the hips.'],
    effort: 'last',
  },
  rollout: {
    photo: 'barbell-ab-rollout-on-knees',
    tips: [
      'Start on your knees with the bar under your shoulders.',
      'Roll out as far as you can without your lower back sagging, then pull back with your abs.',
      'End the set when your back starts to arch.',
    ],
  },
  sidePlank: {
    photo: 'side-bridge',
    tips: ['Elbow under your shoulder, body in a straight line from head to feet.', 'Don’t let your hips sag. Hold for the full time on each side.'],
  },
  plank: {
    photo: 'plank',
    tips: ['Elbows under your shoulders, body straight from head to heels.', 'Squeeze your glutes and brace your abs so your hips don’t sag or pike up.'],
  },
  inclineWalk: {
    photo: 'walking-treadmill',
    tips: ['Walk at a pace where you could still hold a conversation.', 'Don’t hold the rails: let your legs do the work.'],
  },
};
