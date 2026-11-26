/**
 * How to do each exercise: two photos of it (start and end, shown in turn like a GIF) and one to
 * three short pointers on form, whether to go to failure, and anything else worth knowing.
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
  tips: string[];
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

const LEAVE_TWO = 'Stop a rep or two short of failure.';
const FAIL_OK = 'Fine to take the last set to failure.';

export const GUIDE: Record<string, Guide> = {
  bench: {
    photo: 'barbell-bench-press-medium-grip',
    tips: [
      'Shoulder blades pinched and down, feet planted. Lower the bar to your lower chest with your elbows about 45° from your sides.',
      'Touch your chest without bouncing, then press back up toward your face.',
      `${LEAVE_TWO} A missed rep under a heavy bar is how benching goes wrong.`,
    ],
  },
  pausedBench: {
    photo: 'barbell-bench-press-medium-grip',
    tips: [
      'Lower under control and hold the bar still on your chest for a full second before you press.',
      'Use less than your regular bench: the pause takes away the bounce.',
      LEAVE_TWO,
    ],
  },
  closeGripBench: {
    photo: 'close-grip-barbell-bench-press',
    tips: [
      'Hands about shoulder-width apart, elbows tucked close to your sides on the way down.',
      'Touch a little lower on your chest than a regular bench.',
      'Keep a rep in reserve: your triceps give out quickly.',
    ],
  },
  inclineBarbell: {
    photo: 'barbell-incline-bench-press-medium-grip',
    tips: [
      'Bench at about 30°. Lower the bar to your upper chest, just below your collarbones.',
      'Keep your shoulder blades back and your hips on the bench.',
      LEAVE_TWO,
    ],
  },
  dips: {
    photo: 'dips-chest-version',
    tips: [
      'Lean forward a little and let your elbows flare slightly to work your chest.',
      'Go down until your shoulders are just below your elbows, or as far as your shoulders feel good.',
      'Bodyweight sets can go close to failure. With added weight, leave a rep.',
    ],
  },
  cableFly: {
    photo: 'cable-crossover',
    tips: [
      'Pulleys high, a slight bend in your elbows that stays fixed. Bring your hands together in front of your hips.',
      'Think of hugging a barrel: the movement is at your shoulders, not your elbows.',
      FAIL_OK,
    ],
  },
  dbShoulderPress: {
    photo: 'seated-dumbbell-press',
    tips: [
      'Back against the bench, dumbbells at shoulder height, palms forward.',
      'Press up and slightly in until your arms are straight, and keep your ribs down so your lower back doesn’t arch.',
      LEAVE_TWO,
    ],
  },
  pullup: {
    photo: 'pullups',
    tips: [
      'Start from a dead hang. Pull your chest toward the bar, leading with your elbows.',
      'Lower all the way down, under control, on every rep.',
      'Bodyweight sets can go to failure. With added weight, leave a rep.',
    ],
  },
  cableRow: {
    photo: 'seated-cable-rows',
    tips: [
      'Sit tall with your knees slightly bent and pull the handle to your belly button.',
      'Squeeze your shoulder blades together at the end, then let them stretch forward.',
      'Don’t rock your torso to move the weight.',
    ],
  },
  barbellRow: {
    photo: 'bent-over-barbell-row',
    tips: [
      'Hinge until your torso is close to parallel, back flat, knees soft.',
      'Pull the bar to your lower ribs and lower it under control.',
      `${LEAVE_TWO} Your form gives out before your back does.`,
    ],
  },
  kneelingPulldown: {
    photo: 'one-arm-lat-pulldown',
    tips: [
      'Kneel facing the pulley and pull the handle down to your side, elbow tucked in.',
      'Let your arm reach all the way up at the top for a full stretch.',
      FAIL_OK,
    ],
  },
  facePull: {
    photo: 'face-pull',
    tips: [
      'Rope at face height. Pull it toward your forehead so your hands end up beside your ears.',
      'Elbows high and out, like showing off your biceps at the end.',
      'Light weight and slow reps. Going to failure is fine.',
    ],
  },
  rearDeltFly: {
    photo: 'seated-bent-over-rear-delt-raise',
    tips: [
      'Bend forward at the hips with a flat back and let the dumbbells hang.',
      'Raise them out to the sides with a slight bend in your elbows, leading with your pinkies.',
      'Go light. These can go to failure.',
    ],
  },
  cableLateral: {
    photo: 'cable-seated-lateral-raise',
    tips: [
      'Stand side-on to a low pulley and raise your arm out to the side, up to shoulder height.',
      'Lead with your elbow, keep a small bend in it, and don’t shrug.',
      FAIL_OK,
    ],
  },
  lateralRaise: {
    photo: 'side-lateral-raise',
    tips: [
      'Raise the dumbbells out to your sides, up to shoulder height, elbows slightly bent.',
      'Lead with your elbows and keep your shoulders down, away from your ears.',
      'Use a weight you can control. These can go to failure.',
    ],
  },
  ohTricepsExt: {
    photo: 'cable-rope-overhead-triceps-extension',
    tips: [
      'Face away from the pulley, rope behind your head, elbows pointing forward.',
      'Straighten your arms overhead, then let them bend all the way back for a deep stretch.',
      'Keep your elbows still. Safe to take to failure.',
    ],
  },
  leaningOhExt: {
    photo: 'cable-rope-overhead-triceps-extension',
    tips: [
      'Lean forward with the cable coming from behind you, elbow beside your head and pointing ahead.',
      'Let the cable pull your hand far behind your head, then straighten your arm.',
      'One arm at a time. Safe to take to failure.',
    ],
  },
  pushdown: {
    photo: 'triceps-pushdown',
    tips: [
      'Elbows pinned to your sides. Push down until your arms are straight.',
      'Let the bar rise until your forearms are just past parallel, then push again.',
      FAIL_OK,
    ],
  },
  skullCrusher: {
    photo: 'ez-bar-skullcrusher',
    tips: [
      'Lower the bar toward your forehead, or just behind your head, bending only at your elbows.',
      'Keep your upper arms angled slightly back toward your head.',
      'Stop a rep short of failure: your elbows will thank you.',
    ],
  },
  inclineCurl: {
    photo: 'incline-dumbbell-curl',
    tips: [
      'Bench at about 45°, arms hanging straight down behind your body.',
      'Curl without letting your elbows drift forward, then lower all the way.',
      FAIL_OK,
    ],
  },
  preacherCurl: {
    photo: 'cable-preacher-curl',
    tips: [
      'Upper arm flat on the pad. Curl up, then lower until your arm is almost straight.',
      'Go slowly at the bottom, where the stretch is biggest.',
      FAIL_OK,
    ],
  },
  bayesianCurl: {
    photo: 'standing-one-arm-cable-curl',
    tips: [
      'Face away from a low pulley so the cable pulls your arm back behind you.',
      'Keep your elbow back as you curl; don’t let it swing forward.',
      'One arm at a time. Safe to take to failure.',
    ],
  },
  hammerCurl: {
    photo: 'hammer-curls',
    tips: ['Palms facing each other the whole time. Curl without swinging.', 'Keep your elbows at your sides and lower all the way.', FAIL_OK],
  },
  ezCurl: {
    photo: 'ez-bar-curl',
    tips: ['Elbows at your sides. Curl up and lower under control.', 'No swinging: if you have to lean back, the weight is too heavy.', FAIL_OK],
  },
  reverseCurl: {
    photo: 'reverse-barbell-curl',
    tips: ['Palms facing down, hands about shoulder-width apart. Curl with your elbows at your sides.', 'Go lighter than a regular curl and keep your wrists straight.', FAIL_OK],
  },
  wristCurl: {
    photo: 'palms-up-barbell-wrist-curl-over-a-bench',
    tips: [
      'Forearms on a bench or your thighs, palms up, wrists just past the edge.',
      'Let the bar roll down to your fingertips, then curl it back up with your wrists.',
      'High reps and a burn are the goal. Go to failure.',
    ],
  },
  reverseWristCurl: {
    photo: 'palms-down-wrist-curl-over-a-bench',
    tips: ['Forearms supported, palms facing down.', 'Raise the backs of your hands as high as you can, then lower slowly.', 'Go light. These can go to failure.'],
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
      'Stop two reps short of failure, inside the rack with the safety arms set.',
    ],
  },
  rdl: {
    photo: 'romanian-deadlift',
    tips: [
      'Knees soft. Push your hips back and slide the bar down your thighs.',
      'Go until you feel a strong stretch in your hamstrings, keeping your back flat.',
      `${LEAVE_TWO} Don’t round your back to get lower.`,
    ],
  },
  walkingLunge: {
    photo: 'dumbbell-lunges',
    tips: ['Take a long step and lower your back knee toward the floor.', 'Push through your front heel into the next step, torso upright.', 'Leave a rep in the tank.'],
  },
  ballLegCurl: {
    photo: 'ball-leg-curl',
    tips: ['Lie on your back with your heels on the ball and lift your hips.', 'Roll the ball in toward you with your hips up, then roll it out slowly.', 'Fine to go to failure.'],
  },
  calfRaise: {
    photo: 'standing-dumbbell-calf-raise',
    tips: [
      'On one foot on the edge of a step or plate, holding a dumbbell.',
      'Lower your heel as far as it goes, pause, then rise all the way onto your toes.',
      'Take each set to failure.',
    ],
  },
  bulgarian: {
    photo: 'split-squat-with-dumbbells',
    tips: [
      'Back foot up on a bench, front foot far enough forward that your knee stays over your foot.',
      'Lower straight down until your back knee nearly touches the floor.',
      'Leave a rep in reserve: your balance goes first.',
    ],
  },
  hipThrust: {
    photo: 'barbell-hip-thrust',
    tips: [
      'Upper back on a bench, bar across your hips on a pad.',
      'Drive through your heels until your hips line up with your knees and shoulders, chin tucked.',
      'Pause and squeeze at the top. Stop a rep short of failure.',
    ],
  },
  cableLegExt: {
    photo: 'leg-extensions',
    tips: ['Seated, ankle strap on, starting with your knee bent.', 'Straighten your leg fully and squeeze, then lower slowly.', FAIL_OK],
  },
  hangingLegRaise: {
    photo: 'hanging-leg-raise',
    tips: [
      'Raise your legs by curling your pelvis up, not just lifting your thighs.',
      'Lower slowly without swinging.',
      'Bend your knees if straight legs are too hard. Sets can go to failure.',
    ],
  },
  woodchopper: {
    photo: 'standing-cable-wood-chop',
    tips: [
      'Pulley high, standing side-on. Pull the handle down and across your body to the opposite hip.',
      'Turn through your torso with your arms mostly straight, pivoting on your back foot.',
      'Control it back up. Fine to go to failure.',
    ],
  },
  cableCrunch: {
    photo: 'cable-crunch',
    tips: ['Kneel facing the pulley with the rope beside your head.', 'Crunch your ribs toward your hips, rounding your back, instead of just bending at the hips.', FAIL_OK],
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
