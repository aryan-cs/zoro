import { describe, expect, it } from 'vitest';
import { EXERCISES, TEMPLATES } from './program';
import { matchExercise, normalizeSpeech, parseSpokenNumber, parseWorkoutSpeech, toSetDrafts, type VoiceContext, type VoiceSet } from './voice';

const parse = (text: string, ctx: Partial<VoiceContext> = {}) => parseWorkoutSpeech(text, { exercises: EXERCISES, ...ctx });
const times = (n: number, set: Partial<VoiceSet>) => Array.from({ length: n }, () => set);
const ids = (t: keyof typeof TEMPLATES) => TEMPLATES[t].exercises.map((e) => e.exerciseId);

describe('spoken numbers', () => {
  it.each([
    ['135', 135],
    ['ninety nine', 99],
    ['a hundred thirty five', 135],
    ['a hundred and thirty five', 135],
    ['one hundred five', 105],
    ['one thirty five', 135],
    ['two twenty five', 225],
    ['one oh five', 105],
    ['three fifteen', 315],
    ['two hundred and twenty five', 225],
    ['thirty seven and a half', 37.5],
    ['twelve point five', 12.5],
    ['37.5', 37.5],
    ['37½', 37.5],
    ['1:35', 135],
  ])('%s → %d', (text, value) => {
    expect(parseSpokenNumber(text)).toBe(value);
  });

  it('is not fooled by words that are not numbers', () => {
    expect(parseSpokenNumber('bench')).toBeUndefined();
  });
});

describe('the headline example', () => {
  it('3 sets of 10 at 35 on single arm tricep extension, switching arms', () => {
    const r = parse('I just did 3 sets of 10 at 35 pounds on single arm tricep extension, switching arms');
    expect(r.exerciseId).toBe('leaningOhExt');
    expect(r.sets).toEqual(times(3, { reps: 10, weight: 35, side: 'each' }));
    expect(r.groups).toHaveLength(1);
    expect(r.unmatched).toEqual([]);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('survives dictation spelling it all out and dropping the comma', () => {
    const r = parse('I just did three sets of ten at thirty five pounds on single-arm tricep extension switching arms');
    expect(r.exerciseId).toBe('leaningOhExt');
    expect(r.sets).toEqual(times(3, { reps: 10, weight: 35, side: 'each' }));
  });
});

describe('one set at a time', () => {
  const ctx = { currentExerciseId: 'bench' };

  it.each([
    ['10 reps at 135', 10, 135],
    ['did 8 with 185', 8, 185],
    ['135 for 8', 8, 135],
    ['8 for 185', 8, 185],
    ['135 x 8', 8, 135],
    ['one thirty five for eight', 8, 135],
    ['a hundred thirty five for 8', 8, 135],
    ['um, uh, so I did like 6 reps with 155', 6, 155],
  ])('%s', (text, reps, weight) => {
    const r = parse(text, ctx);
    expect(r.exerciseId).toBe('bench');
    expect(r.sets).toEqual([{ reps, weight }]);
  });

  it('uses the last weight when only reps are said', () => {
    const r = parse('8 reps', { ...ctx, lastWeight: 135 });
    expect(r.sets).toEqual([{ reps: 8, weight: 135, weightFromLast: true }]);
    expect(r.notes.join(' ')).toMatch(/135 lb/);
  });

  it('only uses the last weight for the exercise it belongs to', () => {
    expect(parse('curls 8 reps', { ...ctx, lastWeight: 135 }).sets).toEqual([{ reps: 8 }]);
    expect(parse('curls 8 reps', { ...ctx, lastWeight: 135, lastWeights: { ezCurl: 30 } }).sets).toEqual([{ reps: 8, weight: 30, weightFromLast: true }]);
  });

  it('leaves the weight empty (and confidence low) when there is no last weight', () => {
    const r = parse('8 reps', ctx);
    expect(r.sets).toEqual([{ reps: 8 }]);
    expect(r.confidence).toBeLessThan(0.6);
  });
});

describe('sets × reps', () => {
  const ctx = { currentExerciseId: 'cableRow' };

  it.each(['3 by 10 at 50', '3x10 @ 50', '3 × 10 at 50 lbs', 'three by ten at fifty', 'three sets of ten at fifty', '3 sets, 10 reps, 50 pounds'])('%s', (text) => {
    expect(parse(text, ctx).sets).toEqual(times(3, { reps: 10, weight: 50 }));
  });

  it('5 x 5 at 225 is five sets', () => {
    expect(parse('5 x 5 at 225', { currentExerciseId: 'squat' }).sets).toEqual(times(5, { reps: 5, weight: 225 }));
  });

  it('"three sets of ten" with no weight falls back to the last weight', () => {
    const r = parse('three sets of ten', { ...ctx, lastWeight: 70 });
    expect(r.sets).toMatchObject(times(3, { reps: 10, weight: 70, weightFromLast: true }));
  });

  it('a count followed by a list of reps is one set per rep count', () => {
    expect(parse('3 sets: 12, 10, 8 at 40', { currentExerciseId: 'hammerCurl' }).sets).toEqual([
      { reps: 12, weight: 40 },
      { reps: 10, weight: 40 },
      { reps: 8, weight: 40 },
    ]);
    expect(parse('did 12 10 and 8 with the 25s', { currentExerciseId: 'hammerCurl' }).sets).toEqual([
      { reps: 12, weight: 25 },
      { reps: 10, weight: 25 },
      { reps: 8, weight: 25 },
    ]);
  });
});

describe('set by set', () => {
  it('first set 10 at 135, second set 8 at 145, third set 6 at 155', () => {
    const r = parse('first set 10 at 135, second set 8 at 145, third set 6 at 155', { currentExerciseId: 'bench' });
    expect(r.sets).toEqual([
      { reps: 10, weight: 135, setNumber: 1 },
      { reps: 8, weight: 145, setNumber: 2 },
      { reps: 6, weight: 155, setNumber: 3 },
    ]);
  });

  it.each(['set one 12, set two 10, set three 8 at 40', 'set one twelve set two ten set three eight at forty', 'Set 112, set 210, set 38 at 40'])(
    'a weight said at the end covers every set: %s',
    (text) => {
      expect(parse(text, { currentExerciseId: 'hammerCurl' }).sets).toEqual([
        { reps: 12, weight: 40, setNumber: 1 },
        { reps: 10, weight: 40, setNumber: 2 },
        { reps: 8, weight: 40, setNumber: 3 },
      ]);
    },
  );

  it('"last set was 8" fixes the last of the counted sets instead of adding one', () => {
    expect(parse('I did 3 sets of 10 with 135 on bench, last set was 8').sets).toEqual([
      { reps: 10, weight: 135 },
      { reps: 10, weight: 135 },
      { reps: 8, weight: 135 },
    ]);
  });

  it('two sets of 10 and one of 8', () => {
    expect(parse('two sets of 10 and one of 8 at 135', { currentExerciseId: 'bench' }).sets).toEqual([
      { reps: 10, weight: 135 },
      { reps: 10, weight: 135 },
      { reps: 8, weight: 135 },
    ]);
  });

  it('a weight carries forward to later sets', () => {
    expect(parse('10 at 135 and 8 at 145, then 6', { currentExerciseId: 'bench' }).sets).toEqual([
      { reps: 10, weight: 135 },
      { reps: 8, weight: 145 },
      { reps: 6, weight: 145 },
    ]);
  });
});

describe('units and load', () => {
  it('converts kilos to pounds and says so', () => {
    const r = parse('3 sets of 8 at 60 kilos', { currentExerciseId: 'bench' });
    expect(r.sets).toEqual(times(3, { reps: 8, weight: 132.3 }));
    expect(r.notes).toContain('Converted 60 kg to 132.3 lb.');
  });

  it('reads pounds in every spelling', () => {
    for (const unit of ['pounds', 'pound', 'lbs', 'lb', '#']) {
      expect(parse(`10 reps at 95 ${unit}`, { currentExerciseId: 'bench' }).sets).toEqual([{ reps: 10, weight: 95 }]);
    }
  });

  it('bodyweight / no weight logs zero added load', () => {
    expect(parse('pull ups bodyweight 3 sets of 8').sets).toEqual(times(3, { reps: 8, weight: 0, bodyweight: true }));
    expect(parse('dips 10 reps no weight').sets).toEqual([{ reps: 10, weight: 0, bodyweight: true }]);
    expect(parse('pull ups 3 sets of 6 plus 25').sets).toEqual(times(3, { reps: 6, weight: 25 }));
  });

  it('knows bars and plates', () => {
    expect(parse('just the bar for 10', { currentExerciseId: 'bench' }).sets).toEqual([{ reps: 10, weight: 45 }]);
    expect(parse('bench 2 plates for 5').sets).toEqual([{ reps: 5, weight: 225 }]);
  });

  it('logs no weight for moves that take none, with seconds for timed ones', () => {
    expect(parse('hanging leg raises 3 sets of 15').sets).toEqual(times(3, { reps: 15, weight: 0 }));
    expect(parse('plank for 45 seconds').sets).toEqual([{ reps: 45, weight: 0 }]);
    expect(parse('dead hang a minute').sets).toEqual([{ reps: 60, weight: 0 }]);
    expect(parse('plank 1 minute 30 seconds').sets).toEqual([{ reps: 90, weight: 0 }]);
  });

  it('"35 pounds each" means per hand, not per side', () => {
    expect(parse('3 sets of 10 at 35 pounds each', { currentExerciseId: 'hammerCurl' }).sets).toEqual(times(3, { reps: 10, weight: 35 }));
  });
});

describe('sides', () => {
  it('each arm / each side / per leg', () => {
    expect(parse('12 each arm at 25', { currentExerciseId: 'bayesianCurl' }).sets).toEqual([{ reps: 12, weight: 25, side: 'each' }]);
    expect(parse('walking lunges 2 sets of 10 each leg with 40s').sets).toEqual(times(2, { reps: 10, weight: 40, side: 'each' }));
  });

  it('left arm 10, right arm 9', () => {
    const r = parse('left arm 10, right arm 9', { currentExerciseId: 'leaningOhExt', lastWeight: 30 });
    expect(r.sets).toMatchObject([
      { reps: 10, weight: 30, side: 'left' },
      { reps: 9, weight: 30, side: 'right' },
    ]);
  });
});

describe('exercise names', () => {
  it.each([
    ['skull crushers 3 by 10 at 60', 'skullCrusher'],
    ['bench 5 at 185', 'bench'],
    ['incline 3 by 10 at 135', 'inclineBarbell'],
    ['incline curls 3 by 10 at 25', 'inclineCurl'],
    ['RDL 3x8 at 185', 'rdl'],
    ['R.D.L. 3x8 at 185', 'rdl'],
    ['pull-ups 3 sets of 8', 'pullup'],
    ['chin ups 3 sets of 8', 'pullup'],
    ['curls 3 by 12 at 30', 'ezCurl'],
    ['overhead extension 3 sets of 15 at 30', 'ohTricepsExt'],
    ['basian curls 12 at 20', 'bayesianCurl'],
    ['Beijing curls 12 at 20', 'bayesianCurl'],
    ['deadlift 3x5 at 225', 'rdl'],
    ['Three sets of eight on the incline bench at one fifteen', 'inclineBarbell'],
  ])('%s → %s', (text, id) => {
    const r = parse(text);
    expect(r.exerciseId).toBe(id);
    expect(r.exerciseName).toBe(EXERCISES[id].name);
  });

  it("prefers today's exercises", () => {
    // Arms day has the single-arm extension, not the overhead cable one.
    expect(parse('tricep extension 3 by 12 at 40', { candidates: ids('arms') }).exerciseId).toBe('leaningOhExt');
    expect(parse('tricep extension 3 by 12 at 40').exerciseId).toBe('ohTricepsExt');
    // Upper B's bench is the paused one.
    expect(matchExercise('bench', { exercises: EXERCISES, candidates: ids('upperB') })?.id).toBe('pausedBench');
  });

  it('an ambiguous name picks the first unfinished candidate and lowers confidence', () => {
    const r = parse('curls 3 by 12 at 30', { candidates: ids('arms') });
    expect(r.exerciseId).toBe('preacherCurl');
    expect(r.groups[0].alternatives).toContain('hammerCurl');
    expect(r.confidence).toBeLessThan(0.85);
    // The exercise you're on wins a tie.
    expect(parse('curls 3 by 12 at 30', { candidates: ids('arms'), currentExerciseId: 'hammerCurl' }).exerciseId).toBe('hammerCurl');
  });

  it('uses the current exercise when none is named', () => {
    const r = parse('10 reps at 135', { currentExerciseId: 'bench' });
    expect(r.groups[0].exerciseSource).toBe('current');
  });

  it('treats "dumbbells" as equipment, not an exercise', () => {
    const r = parse('20 kg dumbbells for 10', { currentExerciseId: 'hammerCurl' });
    expect(r.exerciseId).toBe('hammerCurl');
    expect(r.sets).toEqual([{ reps: 10, weight: 44.1 }]);
  });
});

describe('corrections: the last thing said wins', () => {
  const ctx = { currentExerciseId: 'bench' };
  it.each([
    ['10 reps at 135, no wait, 9 reps', 9, 135],
    ['135 for 8, sorry, 9', 9, 135],
    ['10 reps at 135 no wait 145', 10, 145],
    ['10 reps at 135, make that 9', 9, 135],
    ['8 reps at 135 actually 9 reps', 9, 135],
    ['10 reps no 9 reps at 135', 9, 135],
  ])('%s', (text, reps, weight) => {
    expect(parse(text, ctx).sets).toEqual([{ reps, weight }]);
  });

  it('corrects a weight inside a sets × reps phrase', () => {
    expect(parse('3 sets of 10 at 25, no wait, 30', { currentExerciseId: 'hammerCurl' }).sets).toEqual(times(3, { reps: 10, weight: 30 }));
  });

  it('corrects the exercise', () => {
    const r = parse('bench, no wait, incline, 3 by 10 at 135');
    expect(r.exerciseId).toBe('inclineBarbell');
    expect(r.groups).toHaveLength(1);
    expect(r.sets).toHaveLength(3);
  });
});

describe('speech-to-text quirks', () => {
  it.each([
    ['for sets of ten at 50', 4, 10, 50], // "four"
    ['to sets of 12 at 50', 2, 12, 50], // "two"
    ['a reps at 135', 1, 8, 135], // "8 reps"
    ['did ate with 185', 1, 8, 185],
    ['135 4 8', 1, 8, 135], // "135 for 8"
  ])('%s', (text, count, reps, weight) => {
    expect(parse(text, { currentExerciseId: 'cableRow' }).sets).toEqual(times(count, { reps, weight }));
  });

  it('"set to" is set two', () => {
    expect(parse('set to 10 at 50', { currentExerciseId: 'cableRow' }).sets).toEqual([{ reps: 10, weight: 50, setNumber: 2 }]);
  });

  it('keeps "for" and "a" as words when no number is meant', () => {
    expect(parse('a set of 10 at 135 for bench').sets).toEqual([{ reps: 10, weight: 135 }]);
  });

  it('normalizes symbols and shorthand', () => {
    expect(normalizeSpeech('3x10 @ 135lbs')).toBe('3 x 10 at 135 lbs');
    expect(normalizeSpeech('Pull-ups, R.D.L.s')).toContain('pullup');
  });
});

describe('several exercises in one go', () => {
  it('name first: "bench 5 at 185, then incline 3 by 10 at 135"', () => {
    const r = parse('bench 5 at 185, then incline 3 by 10 at 135');
    expect(r.groups.map((g) => g.exerciseId)).toEqual(['bench', 'inclineBarbell']);
    expect(r.groups[0].sets).toEqual([{ reps: 5, weight: 185 }]);
    expect(r.groups[1].sets).toEqual(times(3, { reps: 10, weight: 135 }));
    // Top level mirrors the first group.
    expect(r.exerciseId).toBe('bench');
  });

  it('name last: "3 sets of 10 at 35 on tricep extension and 3 sets of 12 at 25 on hammer curls"', () => {
    const r = parse('3 sets of 10 at 35 on tricep extension and 3 sets of 12 at 25 on hammer curls');
    expect(r.groups.map((g) => g.exerciseId)).toEqual(['ohTricepsExt', 'hammerCurl']);
    expect(r.groups[1].sets).toEqual(times(3, { reps: 12, weight: 25 }));
  });

  it('sentence by sentence', () => {
    const r = parse('3x10 at 35. Tricep extension. 3x12 at 25. Curls.');
    expect(r.groups.map((g) => [g.exerciseId, g.sets.length, g.sets[0].weight])).toEqual([
      ['ohTricepsExt', 3, 35],
      ['ezCurl', 3, 25],
    ]);
  });
});

describe('confidence and leftovers', () => {
  it('is high for a clean, complete phrase', () => {
    expect(parse('bench 3 sets of 5 at 185').confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('is low for speech that has nothing to log', () => {
    const r = parse('the weather is nice today');
    expect(r.sets).toEqual([]);
    expect(r.confidence).toBeLessThan(0.3);
    expect(r.unmatched).toEqual(['weather', 'nice']);
  });

  it('is low when only an exercise is named', () => {
    const r = parse('bench');
    expect(r.exerciseId).toBe('bench');
    expect(r.sets).toEqual([]);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('an exercise name it does not know lowers confidence instead of silently using the current one', () => {
    const r = parse('leg press 3x10 at 200', { currentExerciseId: 'bench' });
    expect(r.exerciseId).toBe('bench');
    expect(r.unmatched).toEqual(['leg', 'press']);
    expect(r.confidence).toBeLessThan(0.55);
    expect(r.notes.join(' ')).toMatch(/Didn't recognise "leg press"/);
  });

  it('ignores RPE', () => {
    const r = parse('bench 185 for 5 RPE 8');
    expect(r.sets).toEqual([{ reps: 5, weight: 185 }]);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('reports words it could not place without losing the sets', () => {
    const r = parse('I did 8 reps at 185 bench press and my form felt great');
    expect(r.exerciseId).toBe('bench');
    expect(r.sets).toEqual([{ reps: 8, weight: 185 }]);
  });
});

describe('placing sets on the workout rows', () => {
  it('fills open rows in order and skips logged ones', () => {
    const group = parse('3 by 10 at 50', { currentExerciseId: 'cableRow' }).groups[0];
    expect(toSetDrafts(group, { totalSets: 3, logged: [0] })).toEqual([
      { exerciseId: 'cableRow', setIndex: 1, weight: 50, reps: 10, replaces: false, extra: false, weightGuessed: false },
      { exerciseId: 'cableRow', setIndex: 2, weight: 50, reps: 10, replaces: false, extra: false, weightGuessed: false },
      { exerciseId: 'cableRow', setIndex: 3, weight: 50, reps: 10, replaces: false, extra: true, weightGuessed: false },
    ]);
  });

  it('honours "third set" and flags an overwrite', () => {
    const group = parse('third set 6 at 155', { currentExerciseId: 'bench' }).groups[0];
    expect(toSetDrafts(group, { totalSets: 4, logged: [0, 1, 2] })).toMatchObject([{ setIndex: 2, reps: 6, weight: 155, replaces: true }]);
  });

  it('merges a left/right pair into one row with the lower reps', () => {
    const group = parse('left arm 10, right arm 9 at 30', { currentExerciseId: 'leaningOhExt' }).groups[0];
    expect(toSetDrafts(group, { totalSets: 3, logged: [] })).toEqual([
      { exerciseId: 'leaningOhExt', setIndex: 0, weight: 30, reps: 9, replaces: false, extra: false, weightGuessed: false, note: 'Left 10, right 9' },
    ]);
  });

  it("uses the row's target weight when none was said", () => {
    const group = parse('8 reps', { currentExerciseId: 'bench' }).groups[0];
    expect(toSetDrafts(group, { totalSets: 4, logged: [], fallbackWeight: 155 })).toMatchObject([{ setIndex: 0, weight: 155, weightGuessed: true }]);
    const targets = [135, 145, 155];
    expect(toSetDrafts(group, { totalSets: 3, logged: [0, 1], fallbackWeight: (i) => targets[i] })).toMatchObject([{ setIndex: 2, weight: 155 }]);
  });
});
