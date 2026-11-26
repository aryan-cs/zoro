import { describe, expect, it } from 'vitest';
import { EXERCISES } from './program';
import { parseSaid } from './sayParse';

const plan = ['closeGripBench', 'preacherCurl', 'pushdown', 'bayesianCurl', 'hammerCurl', 'lateralRaise', 'facePull', 'wristCurl', 'plank', 'pullup'].map((id) => ({ id, name: EXERCISES[id].name }));
const all = Object.values(EXERCISES).map((e) => ({ id: e.id, name: e.name }));
const light = (id?: string) => !!id && (EXERCISES[id].timed || (EXERCISES[id].kind === 'bodyweight' && !EXERCISES[id].addedLoad));
const say = (t: string) => parseSaid(t, plan, all, light);

describe('reading what you did', () => {
  const cases: [string, string | undefined, [number | undefined, number | undefined][]][] = [
    ['I just did 200 pounds on bench press for 3 reps', 'closeGripBench', [[200, 3]]],
    ['bench 200 for 3', 'closeGripBench', [[200, 3]]],
    ['200x3 on bench', 'closeGripBench', [[200, 3]]],
    ['did 3 reps at 200 on the bench', 'closeGripBench', [[200, 3]]],
    ['Bench press, 200 lbs, 3 reps', 'closeGripBench', [[200, 3]]],
    ['3 sets of 8 at 135', undefined, [[135, 8], [135, 8], [135, 8]]],
    ['185 for 5, 5 and 4', undefined, [[185, 5], [185, 5], [185, 4]]],
    ['185x5, 175x6', undefined, [[185, 5], [175, 6]]],
    ['plank 45 seconds', 'plank', [[undefined, 45]]],
    ['plank for a minute', 'plank', [[undefined, 60]]],
    ['pull ups bodyweight 10 reps', 'pullup', [[0, 10]]],
    ['pull-ups plus 25 for 8', 'pullup', [[25, 8]]],
    ['two hundred pounds for three reps', undefined, [[200, 3]]],
    ['one eighty five for eight', undefined, [[185, 8]]],
    ['a hundred and thirty five for ten', undefined, [[135, 10]]],
    ['12 reps', undefined, [[undefined, 12]]],
    ['I did 8', undefined, [[undefined, 8]]],
    ['100 kg for 5', undefined, [[220.5, 5]]],
    ['curls 30 for 10', 'preacherCurl', [[30, 10]]],
    ['hammer curls 35 lbs 12 reps', 'hammerCurl', [[35, 12]]],
    ['face pulls 40 x 15', 'facePull', [[40, 15]]],
    ['3x10 at 50', undefined, [[50, 10], [50, 10], [50, 10]]],
    ['tricep pushdowns 55 for 12', 'pushdown', [[55, 12]]],
    ['Did twelve reps with 25s on lateral raises', 'lateralRaise', [[25, 12]]],
    ['bench 200 3', 'closeGripBench', [[200, 3]]],
    ['155 lb for 6, then 145 for 8', undefined, [[155, 6], [145, 8]]],
  ];
  for (const [text, ex, sets] of cases) {
    it(text, () => {
      const r = say(text);
      expect(r, text).not.toBeNull();
      expect(r!.exerciseId).toBe(ex);
      expect(r!.sets.map((s) => [s.weight, s.reps])).toEqual(sets);
    });
  }
  it('notices an exercise that isn’t in this workout', () => {
    const r = say('squat 225 for 5');
    expect(r?.exerciseId).toBeUndefined();
    expect(r?.elsewhere).toBe('squat');
  });
  it('reads "one" as a word when nothing makes it a number', () => {
    expect(say('that one felt heavy')).toBeNull();
    expect(say('one rep at 225')?.sets.map((x) => [x.weight, x.reps])).toEqual([[225, 1]]);
    expect(say('did one at 225')?.sets.map((x) => [x.weight, x.reps])).toEqual([[225, 1]]);
  });
  it('gives up on words without numbers', () => {
    expect(say('that was hard')).toBeNull();
  });
});
