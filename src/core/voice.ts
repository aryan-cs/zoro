import type { ExerciseDef } from './types';

/**
 * Turn a spoken (dictated) description of lifting sets into structured sets.
 *
 * Pure and offline: no network, no model. It's a small rule-based parser tuned for how
 * people talk between sets and for the quirks of speech-to-text output, e.g.
 *   "I just did 3 sets of 10 at 35 pounds on single arm tricep extension, switching arms"
 *   "135 for 8", "first set 10 at 135, second set 8 at 145", "three by ten at fifty"
 *
 * See docs/voice-logging.md for how the result is meant to be shown and saved.
 */

// ---------- Public types ----------

export type Side = 'left' | 'right' | 'each';

export interface VoiceSet {
  /** Pounds (added load for bodyweight moves). Missing only when nothing was said and there's no lastWeight. */
  weight?: number;
  reps: number;
  side?: Side;
  /** "third set 6 at 155" → 3. Counted from 1, as spoken. */
  setNumber?: number;
  /** Said "bodyweight" / "no weight". */
  bodyweight?: boolean;
  /** The weight wasn't said; it came from `lastWeight`. */
  weightFromLast?: boolean;
}

export interface VoiceGroup {
  exerciseId?: string;
  exerciseName?: string;
  /** 'spoken': named in the text. 'current': fell back to `currentExerciseId`. 'none': unknown. */
  exerciseSource: 'spoken' | 'current' | 'none';
  /** The words that named the exercise, as heard. */
  heard?: string;
  sets: VoiceSet[];
  /** 0–1. See docs/voice-logging.md for thresholds. */
  confidence: number;
  /** Other exercises that matched almost as well (ids). */
  alternatives: string[];
  notes: string[];
}

export interface VoiceContext {
  exercises: Record<string, ExerciseDef>;
  /** Exercise ids in today's workout, preferred when matching. Put unfinished ones first. */
  candidates?: string[];
  /** Used when no exercise is named. */
  currentExerciseId?: string;
  /** Used when no weight is said for the current exercise (or when there's no current exercise). */
  lastWeight?: number;
  /** Per-exercise last weights, for dictations that name other exercises. Wins over `lastWeight`. */
  lastWeights?: Record<string, number>;
  /** For "just the bar" and "two plates". Default 45. */
  barWeight?: number;
}

export interface VoiceParse {
  /** The first (usually only) group, flattened for convenience. */
  exerciseId?: string;
  exerciseName?: string;
  sets: VoiceSet[];
  /** Words and numbers that weren't used. */
  unmatched: string[];
  /** Lowest confidence of all groups, 0–1. */
  confidence: number;
  /** One per exercise dictated. */
  groups: VoiceGroup[];
  notes: string[];
  /** The text after clean-up, for debugging. */
  normalized: string;
}

// ---------- Vocabulary ----------

const SET_WORDS = new Set(['set', 'sets', 'round', 'rounds']);
const REP_WORDS = new Set(['rep', 'reps', 'repetition', 'repetitions', 'wraps', 'raps', 'rips', 'times']);
const SEC_WORDS = new Set(['second', 'seconds', 'sec', 'secs']);
const MIN_WORDS = new Set(['minute', 'minutes', 'min', 'mins']);
const LB_WORDS = new Set(['lb', 'lbs', 'pound', 'pounds']);
const KG_WORDS = new Set(['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']);
const PLATE_WORDS = new Set(['plate', 'plates']);
const UNIT_WORDS = new Set([...LB_WORDS, ...KG_WORDS, ...PLATE_WORDS]);
const AT_WORDS = new Set(['at', 'with', 'using', 'plus', 'added', 'extra']);
const X_WORDS = new Set(['x', 'by', 'times']);
/** Words with a job in the set grammar. They are never part of an exercise name. */
const KEYWORDS = new Set([
  ...SET_WORDS,
  ...REP_WORDS,
  ...SEC_WORDS,
  ...MIN_WORDS,
  ...UNIT_WORDS,
  ...AT_WORDS,
  ...X_WORDS,
  'for',
  'of',
  'and',
  'number',
  'bodyweight',
  'zgap',
]);
/** Filler that's neither grammar nor exercise. */
const STOP = new Set(
  (
    'i ive im id me my mine you we just did do does done doing got get gets the a an on in into to too it its that this ' +
    'these those them was were is are be been so ok okay like know gonna going go went today now also some more another ' +
    'again please log logged record put add in all about around think maybe probably pretty really good great felt feel ' +
    'bit little time same weight up down workout exercise exercises lift lifted lifting work but hey zoro siri ' +
    'alright yeah yes total only no not just then from than as there here what which have had has could would should ' +
    'heavy light hard easy new pr max form rest finished completed complete failure till until failed one more my ' +
    'week session again um uh er hmm well each per oh point half quarter hundred dozen'
  )
    .split(/\s+/)
    .filter(Boolean),
);

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  last: -1,
  final: -1,
};
const DIGIT_ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/**
 * Everyday names for the program's exercises (ids from program.ts). Matching also uses each
 * exercise's own name, so these only need the shorthand people actually say.
 */
const SYNONYMS: Record<string, string[]> = {
  bench: ['bench', 'bench press', 'flat bench', 'flat bench press', 'barbell bench'],
  pausedBench: ['paused bench', 'pause bench', 'paused bench press', 'pause bench press'],
  closeGripBench: ['close grip', 'close grip bench', 'close grip bench press', 'cgbp', 'narrow grip bench'],
  inclineBarbell: ['incline', 'incline bench', 'incline press', 'incline bench press', 'incline barbell'],
  dips: ['dip', 'weighted dip', 'decline dumbbell press'],
  cableFly: ['fly', 'cable fly', 'chest fly', 'cable crossover', 'crossover'],
  dbShoulderPress: ['shoulder press', 'overhead press', 'ohp', 'military press', 'seated press', 'dumbbell shoulder press'],
  pullup: ['pullup', 'chinup', 'weighted pullup'],
  cableRow: ['row', 'cable row', 'seated row', 'low row'],
  barbellRow: ['barbell row', 'bent over row', 'bb row', 'pendlay row'],
  kneelingPulldown: ['pulldown', 'lat pulldown', 'single arm pulldown', 'kneeling pulldown'],
  facePull: ['face pull'],
  rearDeltFly: ['rear delt', 'rear delt fly', 'reverse fly', 'rear fly'],
  cableLateral: ['cable lateral', 'cable lateral raise', 'cable raise'],
  lateralRaise: ['lateral', 'lateral raise', 'side raise', 'side lateral', 'dumbbell lateral raise', 'lat raise'],
  ohTricepsExt: ['tricep extension', 'overhead extension', 'overhead tricep extension', 'cable overhead extension', 'overhead tricep'],
  leaningOhExt: [
    'single arm tricep extension',
    'single arm extension',
    'single arm overhead extension',
    'leaning extension',
    'leaning overhead extension',
  ],
  pushdown: ['pushdown', 'tricep pushdown', 'pressdown', 'rope pushdown', 'tricep pressdown'],
  skullCrusher: ['skull crusher', 'skullcrusher', 'skull', 'lying extension'],
  inclineCurl: ['incline curl', 'incline dumbbell curl'],
  preacherCurl: ['preacher', 'preacher curl'],
  // Dictation often hears "Bayesian" as "Beijing" or "basin".
  bayesianCurl: ['bayesian', 'bayesian curl', 'behind the body curl', 'beijing curl', 'basin curl'],
  hammerCurl: ['hammer', 'hammer curl'],
  ezCurl: ['curl', 'bicep curl', 'ez curl', 'ez bar curl', 'barbell curl', 'dumbbell curl'],
  reverseCurl: ['reverse curl'],
  wristCurl: ['wrist curl'],
  reverseWristCurl: ['reverse wrist curl'],
  deadHang: ['dead hang', 'hang', 'bar hang'],
  squat: ['squat', 'back squat', 'barbell squat'],
  rdl: ['rdl', 'romanian deadlift', 'romanian', 'stiff leg deadlift', 'deadlift'],
  walkingLunge: ['lunge', 'walking lunge'],
  ballLegCurl: ['leg curl', 'hamstring curl', 'ball leg curl'],
  calfRaise: ['calf raise', 'calf'],
  bulgarian: ['bulgarian', 'split squat', 'bulgarian split squat', 'bss'],
  hipThrust: ['hip thrust', 'glute bridge'],
  cableLegExt: ['leg extension', 'quad extension'],
  hangingLegRaise: ['leg raise', 'hanging leg raise', 'knee raise'],
  woodchopper: ['woodchopper', 'wood chop', 'cable chop'],
  cableCrunch: ['crunch', 'cable crunch', 'kneeling crunch'],
  rollout: ['rollout', 'ab wheel', 'ab rollout', 'ab roller'],
  sidePlank: ['side plank'],
  plank: ['plank'],
  inclineWalk: ['incline walk', 'stairmaster', 'treadmill', 'cardio'],
};

// ---------- Text clean-up ----------

/** Phrase rewrites applied to the lower-cased text, in order. */
const REWRITES: [RegExp, string][] = [
  // Speech-to-text and gym shorthand.
  [/\b(?:one|1|single)\s+(?:arm|armed|hand|handed)\b/g, 'single arm'],
  [/\b(?:one|1|single)\s+(?:leg|legged)\b/g, 'single leg'],
  [/\bpull\s*ups?\b/g, 'pullup'],
  [/\bchin\s*ups?\b/g, 'chinup'],
  [/\bpush\s*downs?\b/g, 'pushdown'],
  [/\bpress\s*downs?\b/g, 'pressdown'],
  [/\bpull\s*downs?\b/g, 'pulldown'],
  [/\broll\s*outs?\b/g, 'rollout'],
  [/\bwood\s*chop(?:per)?s?\b/g, 'woodchopper'],
  [/\bskull\s*crush(?:er|ers)?\b/g, 'skull crusher'],
  [/\bstair\s+master\b/g, 'stairmaster'],
  [/\bdead\s+lifts?\b/g, 'deadlift'],
  [/\bbody\s*weight\b/g, 'bodyweight'],
  [/\b(?:no|without(?:\s+any)?)\s+(?:added\s+)?weight\b/g, 'bodyweight'],
  [/\bunweighted\b/g, 'bodyweight'],
  [/\b(?:just|only)\s+(?:the\s+)?(?:empty\s+)?bar\b/g, ' zbar '],
  [/\bempty\s+bar\b/g, ' zbar '],
  [/\be\s?z\b/g, 'ez'],
  [/\beasy\s+(bar|curl)/g, 'ez $1'],
  [/\br\s?d\s?l(s?)\b/g, 'rdl$1'],
  [/\bo\s?h\s?p\b/g, 'ohp'],
  // Fillers.
  [/\b(?:u+m+|u+h+|e+r+m*|a+h+|h+m+|m{2,})\b/g, ' '],
  // Corrections ("no wait, 9 reps").
  [/\bno\s*,?\s*(?:no\s*,?\s*)?wait\b/g, ' zfix '],
  [/\bno\s*,?\s*no\b/g, ' zfix '],
  [/\b(?:scratch that|i mean|or rather|my bad|make (?:that|it))\b/g, ' zfix '],
  [/\b(?:actually|sorry|correction|oops|wait|rather)\b/g, ' zfix '],
  // Separators.
  [/\b(?:and then|after that|and next)\b/g, ' then '],
  // Sides. "35 pounds each hand" is per-hand weight, which is the app's default for dumbbells.
  [/\b(?:each|per|every|in each)\s+hands?\b/g, ' '],
  [/\b(?:each|per|every|on each|on both)\s+(?:arms?|sides?|legs?)\b/g, ' zeach '],
  [/\b(?:switching|switched|switch|alternating|alternated|alternate|both)\s+(?:arms?|sides?|legs?|hands?)\b/g, ' zeach '],
  [/\b(?:alternating|alternated)\b/g, ' zeach '],
  [/\b(?:on\s+)?(?:the\s+|my\s+)?(left|right)\s+(?:arms?|sides?|legs?|hands?)\b/g, ' z$1 '],
  [/\b(?:each|apiece)\b/g, ' zeachbare '],
];

/** Lower-case and clean dictated text so the tokenizer sees one spelling for each thing. */
export function normalizeSpeech(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  s = s.replace(/[’‘`]/g, "'").replace(/[“”"]/g, ' ');
  // Fractions and symbols.
  s = s.replace(/(\d)\s*½/g, '$1.5').replace(/½/g, '.5').replace(/(\d)\s*¼/g, '$1.25').replace(/(\d)\s*¾/g, '$1.75');
  s = s.replace(/(\d+)\s+1\/2\b/g, '$1.5');
  s = s.replace(/×/g, ' x ').replace(/@/g, ' at ').replace(/\+/g, ' plus ').replace(/&/g, ' and ');
  s = s.replace(/(\d)\s*#/g, '$1 lb ');
  // "one thirty five" often comes back from dictation as a time.
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, '$1$2');
  s = s.replace(/:/g, ' , ');
  // "R.D.L." → "r d l".
  s = s.replace(/\b([a-z])\.(?=[a-z]\b|\s|$)/g, '$1 ');
  // 1st, 2nd... → words.
  s = s.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, (m, n: string) => DIGIT_ORDINALS[Number(n)] ?? m);
  // "the 35s" are dumbbells.
  s = s.replace(/\b(\d+(?:\.\d+)?)'?s\b/g, (m, n: string) => (Number(n) >= 5 ? `${n} lb` : m));
  // 3x10, 135lbs, x10.
  s = s.replace(/(\d)\s*x\s*(?=\d)/g, '$1 x ');
  s = s.replace(/(\d)(?=[a-z])/g, '$1 ').replace(/\b([a-z]+)(?=\d)/g, '$1 ');
  // Hyphens and slashes between words become spaces.
  s = s.replace(/([a-z0-9])[-/]+(?=[a-z0-9])/g, '$1 ');
  // Drop everything else except sentence punctuation (decimal points stay with their digits).
  s = s.replace(/[^a-z0-9.,;!?' ]+/g, ' ');
  s = s.replace(/'(?![a-z])|(?<![a-z])'/g, ' ');
  for (const [re, to] of REWRITES) s = s.replace(re, to);
  // Glue spelled-out letters ("r d l"), but not the words a, i and x.
  s = s.replace(/\b(?:[b-hj-wyz] ){1,}[b-hj-wyz]\b/g, (m) => m.replace(/ /g, ''));
  return s.replace(/\s+/g, ' ').trim();
}

// ---------- Tokens ----------

type Tok =
  | { k: 'num'; v: number; raw: string }
  | { k: 'word'; w: string }
  | { k: 'sep'; w: string }
  | { k: 'ord'; n: number; raw: string }
  | { k: 'side'; side: Side | 'eachbare' }
  | { k: 'fix' };

const isNum = (t: Tok | undefined): t is Extract<Tok, { k: 'num' }> => t?.k === 'num';
const wordOf = (t: Tok | undefined): string | undefined => (t?.k === 'word' ? t.w : undefined);
/**
 * "set 2 ..." starts a numbered set. Not in "3 sets", "first set 10" or "1 set 10"; but in
 * "12 set 2 10" the 12 belongs to the set before.
 */
const setIntroAt = (toks: Tok[], i: number): boolean => {
  const w = wordOf(toks[i]);
  if (w !== 'set' && w !== 'round' && w !== 'number') return false;
  const prev = toks[i - 1];
  return isNum(toks[i + 1]) && prev?.k !== 'ord' && wordOf(prev) !== 'set' && !(isNum(prev) && prev.v === 1);
};
const isContent = (t: Tok | undefined): boolean => t?.k === 'word' && !KEYWORDS.has(t.w) && !STOP.has(t.w);

/** Words that make a following/preceding homophone numeric ("for sets" → 4 sets). */
const NUMERIC_NEXT = new Set([...SET_WORDS, 'rep', 'reps', 'wraps', 'raps', 'x', 'by']);

function readSmall(toks: Tok[], i: number): { v: number; end: number; kind: 'unit' | 'teen' | 'tens' } | null {
  const w = wordOf(toks[i]);
  if (w === undefined) return null;
  if (w in TENS) {
    const u = wordOf(toks[i + 1]);
    if (u !== undefined && u in UNITS && UNITS[u] > 0) return { v: TENS[w] + UNITS[u], end: i + 2, kind: 'tens' };
    return { v: TENS[w], end: i + 1, kind: 'tens' };
  }
  if (w in TEENS) return { v: TEENS[w], end: i + 1, kind: 'teen' };
  if (w in UNITS) return { v: UNITS[w], end: i + 1, kind: 'unit' };
  return null;
}

/**
 * Read a spoken number starting at token i: "135", "a hundred and thirty five", "one thirty five" (135),
 * "two twenty five" (225), "one oh five" (105), "thirty seven and a half", "twelve point five".
 * `simple` reads a single small number (after "set", where "set one twelve" is set 1, 12 reps).
 */
function readNumber(toks: Tok[], i: number, simple: boolean): { v: number; end: number } | null {
  const t = toks[i];
  let v: number;
  let end: number;
  if (isNum(t)) {
    v = t.v;
    end = i + 1;
  } else if ((wordOf(t) === 'a' || wordOf(t) === 'one') && wordOf(toks[i + 1]) === 'hundred') {
    v = 100;
    end = i + 2;
    const rest = readSmall(toks, wordOf(toks[end]) === 'and' ? end + 1 : end);
    if (rest) {
      v += rest.v;
      end = rest.end;
    }
  } else if (wordOf(t) === 'hundred') {
    v = 100;
    end = i + 1;
    const rest = readSmall(toks, wordOf(toks[end]) === 'and' ? end + 1 : end);
    if (rest) {
      v += rest.v;
      end = rest.end;
    }
  } else {
    const small = readSmall(toks, i);
    if (!small) return null;
    v = small.v;
    end = small.end;
    if (simple) return { v, end };
    if (wordOf(toks[end]) === 'hundred') {
      v = Math.max(1, v) * 100;
      end++;
      const rest = readSmall(toks, wordOf(toks[end]) === 'and' ? end + 1 : end);
      if (rest) {
        v += rest.v;
        end = rest.end;
      }
    } else if (small.kind === 'unit' && v >= 1) {
      // Gym-speak hundreds: "one thirty five", "two twenty five", "one oh five".
      let tail: { v: number; end: number } | null = null;
      if (wordOf(toks[end]) === 'oh') {
        const u = readSmall(toks, end + 1);
        if (u && u.kind === 'unit') tail = u;
      } else {
        const s2 = readSmall(toks, end);
        if (s2 && s2.kind !== 'unit') tail = s2;
      }
      const after = wordOf(tail ? toks[tail.end] : undefined);
      const prev = toks[i - 1];
      const listy = after !== undefined && (SET_WORDS.has(after) || X_WORDS.has(after));
      const ordinalContext = wordOf(prev) === 'set' || wordOf(prev) === 'number' || prev?.k === 'ord';
      if (tail && !listy && !ordinalContext) {
        v = v * 100 + tail.v;
        end = tail.end;
      }
    }
  }
  // Fractions.
  if (wordOf(toks[end]) === 'and' && wordOf(toks[end + 1]) === 'a' && wordOf(toks[end + 2]) === 'half') {
    v += 0.5;
    end += 3;
  } else if (wordOf(toks[end]) === 'and' && wordOf(toks[end + 1]) === 'a' && wordOf(toks[end + 2]) === 'quarter') {
    v += 0.25;
    end += 3;
  } else if (wordOf(toks[end]) === 'point') {
    const d = toks[end + 1];
    if (isNum(d) && Number.isInteger(d.v)) {
      v += Number(`0.${d.raw}`);
      end += 2;
    } else {
      const w = wordOf(d);
      if (w !== undefined && w in UNITS) {
        v += UNITS[w] / 10;
        end += 2;
      }
    }
  }
  return { v, end };
}

function tokenize(normalized: string, bar: number): Tok[] {
  const raw = normalized.match(/\d+(?:\.\d+)?|\.\d+|[a-z']+|[,;.!?]/g) ?? [];
  // 1. Basic tokens.
  let toks: Tok[] = [];
  for (const r of raw) {
    if (/^[\d.]/.test(r) && r !== '.') toks.push({ k: 'num', v: parseFloat(r), raw: r });
    else if (/^[,;.!?]$/.test(r)) toks.push({ k: 'sep', w: r });
    else if (r === 'then' || r === 'next' || r === 'also') toks.push({ k: 'sep', w: 'then' });
    else if (r === 'zfix') toks.push({ k: 'fix' });
    else if (r === 'zeach') toks.push({ k: 'side', side: 'each' });
    else if (r === 'zeachbare') toks.push({ k: 'side', side: 'eachbare' });
    else if (r === 'zleft' || r === 'zright') toks.push({ k: 'side', side: r === 'zleft' ? 'left' : 'right' });
    else if (r === 'zbar') toks.push({ k: 'num', v: bar, raw: 'bar' }, { k: 'word', w: 'lb' });
    else toks.push({ k: 'word', w: r.replace(/'/g, '') });
  }

  // 2. Ordinal words. "second" after a number is a unit of time; "last time" isn't an ordinal.
  toks = toks.map((t, i) => {
    const w = wordOf(t);
    if (w === undefined || !(w in ORDINALS)) return t;
    if (w === 'second' && isNum(toks[i - 1])) return t;
    if ((w === 'last' || w === 'first') && ['time', 'week', 'workout', 'session', 'exercise'].includes(wordOf(toks[i + 1]) ?? '')) return t;
    return { k: 'ord', n: ORDINALS[w], raw: w };
  });
  // "the last one", "that one" — "one" is a pronoun there.
  toks = toks.filter((t, i) => {
    if (wordOf(t) !== 'one') return true;
    const p = toks[i - 1];
    return !(p?.k === 'ord' || ['this', 'that', 'the', 'each', 'every', 'next'].includes(wordOf(p) ?? ''));
  });

  // 3. Homophones, only where a number is clearly expected.
  toks = toks.map((t, i) => {
    const w = wordOf(t);
    if (w === undefined) return t;
    const next = wordOf(toks[i + 1]) ?? '';
    const prev = wordOf(toks[i - 1]) ?? '';
    const nx = toks[i + 1];
    const nxWord = wordOf(nx) ?? '';
    const afterSet = prev === 'set' && (isNum(nx) || !nx || nx.k === 'sep' || nxWord in UNITS || nxWord in TEENS || nxWord in TENS);
    const num = (v: number): Tok => ({ k: 'num', v, raw: w });
    if ((w === 'for' || w === 'fore') && NUMERIC_NEXT.has(next)) return num(4);
    if ((w === 'to' || w === 'too') && (NUMERIC_NEXT.has(next) || afterSet)) return num(2);
    if (w === 'won' && (NUMERIC_NEXT.has(next) || afterSet)) return num(1);
    if ((w === 'free' || w === 'tree') && NUMERIC_NEXT.has(next)) return num(3);
    if (w === 'ate' && prev !== 'i') return num(8);
    if (w === 'a' && ['reps', 'wraps', 'raps', 'sets'].includes(next)) return num(8);
    if (w === 'a' && ['set', 'rep', 'round', 'plate', 'minute'].includes(next)) return num(1);
    return t;
  });

  // 4. Spoken numbers → one numeric token.
  const merged: Tok[] = [];
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    const w = wordOf(t);
    const startsNumber =
      isNum(t) || (w !== undefined && (w in UNITS || w in TEENS || w in TENS || w === 'hundred' || (w === 'a' && wordOf(toks[i + 1]) === 'hundred')));
    if (startsNumber) {
      const simple = wordOf(toks[i - 1]) === 'set' || wordOf(toks[i - 1]) === 'number';
      const r = readNumber(toks, i, simple);
      if (r && r.end > i) {
        const raw = toks
          .slice(i, r.end)
          .map((x) => (isNum(x) ? x.raw : wordOf(x) ?? ''))
          .join(' ');
        merged.push({ k: 'num', v: Math.round(r.v * 1000) / 1000, raw });
        i = r.end;
        continue;
      }
    }
    merged.push(t);
    i++;
  }

  // 5. "1 minute 30 (seconds)" is one time; "RPE 8" / "RIR 2" isn't a set.
  for (let i = 0; i < merged.length; i++) {
    const t = merged[i];
    const w = wordOf(t);
    if ((w === 'rpe' || w === 'rir') && isNum(merged[i + 1])) {
      merged.splice(i, 2);
      i--;
      continue;
    }
    if (!isNum(t) || !MIN_WORDS.has(wordOf(merged[i + 1]) ?? '')) continue;
    const j = wordOf(merged[i + 2]) === 'and' ? i + 3 : i + 2;
    const sec = merged[j];
    if (isNum(sec) && sec.v < 60) {
      const hasSecWord = SEC_WORDS.has(wordOf(merged[j + 1]) ?? '');
      merged.splice(i, j - i + 1 + (hasSecWord ? 1 : 0), { k: 'num', v: t.v * 60 + sec.v, raw: `${t.raw}:${sec.raw}` }, { k: 'word', w: 'seconds' });
    }
  }

  // 6. "no 9 reps" is a correction; "left 10, right 9" are sides.
  return merged.map((t, i) => {
    const w = wordOf(t);
    const next = merged[i + 1];
    const nextIsNum = isNum(next) || (next?.k === 'sep' && isNum(merged[i + 2]));
    if (w === 'no' && nextIsNum) return { k: 'fix' } as Tok;
    if ((w === 'left' || w === 'right') && isNum(next)) return { k: 'side', side: w } as Tok;
    return t;
  });
}

// ---------- Roles: what each number means ----------

type Role = 'count' | 'reps' | 'weight' | 'ord' | 'skip';

interface ClauseRead {
  roles: (Role | undefined)[];
  vals: number[];
  units: ('lb' | 'kg' | undefined)[];
  /** Roles decided by position alone, without a keyword. */
  guessed: boolean;
  /** Count and reps were tied together ("3 sets of 10", "3x10"), so later clauses don't share the count. */
  bound: boolean;
}

interface LoadInfo {
  /** Bodyweight-only, timed, or no increment: reps only. */
  noLoad: boolean;
  /** Bodyweight move where the weight is extra load (pull-ups, dips): nothing said means none. */
  addedLoad: boolean;
  timed: boolean;
  bar: number;
}

/** Keep the tokens the set grammar cares about; an exercise name becomes one 'zgap' word. */
function roleStream(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (const t of toks) {
    if (t.k === 'word' && !KEYWORDS.has(t.w)) {
      if (STOP.has(t.w)) continue;
      if (wordOf(out[out.length - 1]) !== 'zgap') out.push({ k: 'word', w: 'zgap' });
      continue;
    }
    out.push(t);
  }
  return out;
}

function assignRoles(cl: Tok[], load: LoadInfo): ClauseRead {
  const n = cl.length;
  const roles: (Role | undefined)[] = new Array(n).fill(undefined);
  const vals = cl.map((t) => (isNum(t) ? t.v : NaN));
  const units: ('lb' | 'kg' | undefined)[] = new Array(n).fill(undefined);
  const N = (i: number) => i >= 0 && i < n && isNum(cl[i]) && roles[i] === undefined;
  const W = (i: number) => wordOf(cl[i]);
  let guessed = false;
  let bound = false;

  // "set 2 ..." — an ordinal, unless it's "3 sets" or "first set".
  for (let i = 0; i < n - 1; i++) if (setIntroAt(cl, i) && N(i + 1)) roles[i + 1] = 'ord';

  // Strong cues from the next word.
  for (let i = 0; i < n; i++) {
    if (!N(i)) continue;
    const nx = W(i + 1);
    if (nx === undefined) continue;
    if (SET_WORDS.has(nx)) {
      if (!setIntroAt(cl, i + 1)) roles[i] = 'count';
    }
    else if (nx === 'times' && isNum(cl[i + 2])) continue; // "3 times 10" is handled as N x M
    else if (REP_WORDS.has(nx) || SEC_WORDS.has(nx)) roles[i] = 'reps';
    else if (MIN_WORDS.has(nx)) {
      roles[i] = 'reps';
      vals[i] *= 60;
    } else if (LB_WORDS.has(nx)) {
      roles[i] = 'weight';
      units[i] = 'lb';
    } else if (KG_WORDS.has(nx)) {
      roles[i] = 'weight';
      units[i] = 'kg';
    } else if (PLATE_WORDS.has(nx) && vals[i] <= 8) {
      roles[i] = 'weight';
      vals[i] = load.bar + 90 * vals[i];
      units[i] = 'lb';
    }
  }

  const hasAtWeight = cl.some((t, i) => isNum(t) && AT_WORDS.has(W(i - 1) ?? '')) || roles.includes('weight');

  // N x M (x K): sets × reps, or weight × reps ("135 x 8").
  for (let i = 0; i < n - 2; i++) {
    if (!isNum(cl[i]) || !X_WORDS.has(W(i + 1) ?? '') || !isNum(cl[i + 2])) continue;
    const a = i;
    const b = i + 2;
    const ra = roles[a];
    const rb = roles[b];
    if (ra === undefined && rb === undefined) {
      if (vals[b] > 50 && vals[a] <= 30) {
        roles[a] = 'reps';
        roles[b] = 'weight';
      } else if (vals[a] <= 10 || hasAtWeight) {
        roles[a] = 'count';
        roles[b] = 'reps';
        bound = true;
        if (X_WORDS.has(W(b + 1) ?? '') && N(b + 2)) roles[b + 2] = 'weight';
      } else {
        roles[a] = 'weight';
        roles[b] = 'reps';
      }
    } else if ((ra === 'count' || ra === 'weight') && rb === undefined) roles[b] = 'reps';
    else if (rb === 'reps' && ra === undefined) roles[a] = vals[a] <= 10 ? 'count' : 'weight';
    else if (rb === 'weight' && ra === undefined) roles[a] = 'reps';
  }

  // "3 sets of 10", "3 sets 10".
  for (let i = 0; i < n; i++) {
    if (roles[i] !== 'count' || !SET_WORDS.has(W(i + 1) ?? '')) continue;
    const j = W(i + 2) === 'of' ? i + 3 : i + 2;
    if (N(j)) {
      roles[j] = 'reps';
      if (j === i + 3) bound = true;
    }
  }
  // "... and one of 8".
  for (let i = 0; i < n - 2; i++) {
    if (N(i) && W(i + 1) === 'of' && N(i + 2) && vals[i] <= 10) {
      roles[i] = 'count';
      roles[i + 2] = 'reps';
      bound = true;
    }
  }

  // "at 135", "with 185", "plus 25".
  for (let i = 1; i < n; i++) if (N(i) && AT_WORDS.has(W(i - 1) ?? '')) roles[i] = 'weight';
  // "10 at 135", "8 with 185".
  for (let i = 0; i < n - 2; i++) if (N(i) && AT_WORDS.has(W(i + 1) ?? '') && roles[i + 2] === 'weight') roles[i] = 'reps';

  // "135 for 8", "for 8".
  for (let i = 0; i < n - 1; i++) {
    if (W(i) !== 'for' || !isNum(cl[i + 1])) continue;
    if (N(i - 1) && N(i + 1) && vals[i + 1] > 50 && vals[i - 1] <= 30) {
      // "8 for 185": said backwards.
      roles[i - 1] = 'reps';
      roles[i + 1] = 'weight';
      continue;
    }
    if (roles[i + 1] === undefined) roles[i + 1] = 'reps';
    if (N(i - 1)) roles[i - 1] = 'weight';
  }

  // "135 4 8": that 4 was "for".
  for (let i = 0; i < n - 2; i++) {
    if (!isNum(cl[i]) || !N(i + 1) || !N(i + 2) || vals[i + 1] !== 4 || vals[i] <= 10) continue;
    if (roles[i] !== undefined && roles[i] !== 'weight') continue;
    roles[i] = 'weight';
    roles[i + 1] = 'skip';
    roles[i + 2] = 'reps';
  }

  // Bare numbers: decide by size.
  const open: number[] = [];
  for (let i = 0; i < n; i++) if (N(i)) open.push(i);
  if (open.length) {
    guessed = true;
    const hasReps = roles.includes('reps');
    const hasWeight = roles.includes('weight') || cl.some((t) => wordOf(t) === 'bodyweight');
    const count = roles.findIndex((r) => r === 'count');
    if (load.noLoad) {
      for (const i of open) roles[i] = 'reps';
    } else {
      const heavy = open.filter((i) => vals[i] > 30 || !Number.isInteger(vals[i]));
      const light = open.filter((i) => !heavy.includes(i));
      const repsSoFar = roles.filter((r) => r === 'reps').length;
      if (count >= 0 && hasReps && repsSoFar + light.length === vals[count]) {
        // "3 sets 12 10 8": the rest are reps too.
        for (const i of light) roles[i] = 'reps';
        if (!hasWeight && heavy.length) roles[heavy[0]] = 'weight';
      } else if (!hasReps && !hasWeight) {
        if (light.length && heavy.length) {
          roles[heavy[0]] = 'weight';
          for (const i of light) roles[i] = 'reps';
        } else if (light.length === 2 && count >= 0) {
          roles[light[0]] = 'reps';
          roles[light[1]] = 'weight';
        } else if (light.length) {
          for (const i of light) roles[i] = 'reps';
        } else if (heavy.length) {
          roles[heavy[0]] = 'weight';
        }
      } else if (!hasReps) {
        for (const i of [...light, ...heavy.filter((i) => vals[i] <= 100)]) roles[i] = 'reps';
      } else if (!hasWeight) {
        const pick = heavy[0] ?? light[0];
        if (pick !== undefined) roles[pick] = 'weight';
      }
    }
  }
  return { roles, vals, units, guessed, bound };
}

// ---------- Clauses → sets ----------

interface Spec {
  count?: number;
  reps: number[];
  weight?: number;
  unit?: 'lb' | 'kg';
  bodyweight?: boolean;
  side?: Side;
  ordinal?: number;
  guessed: boolean;
  bound: boolean;
  leftovers: string[];
}

function splitClauses(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  const push = () => {
    if (cur.length) out.push(cur);
    cur = [];
  };
  const curHasNum = () => cur.some((t) => t.k === 'num');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const next = toks[i + 1];
    if (t.k === 'sep') {
      push();
      continue;
    }
    if (t.k === 'ord' || (t.k === 'side' && (t.side === 'left' || t.side === 'right'))) {
      if (!(cur.length && cur.every((x) => x.k === 'ord' || wordOf(x) === 'zgap'))) push();
      cur.push(t);
      continue;
    }
    if (setIntroAt(toks, i)) {
      push();
      cur.push(t);
      continue;
    }
    if (wordOf(t) === 'and' && curHasNum() && (isNum(next) || next?.k === 'ord' || next?.k === 'side')) {
      push();
      continue;
    }
    cur.push(t);
  }
  push();
  return out;
}

/** Side words don't take part in number roles ("12 each arm at 25" is still "12 at 25"). */
const withoutSides = (cl: Tok[]) => cl.filter((t) => t.k !== 'side');

function readClause(cl: Tok[], load: LoadInfo): Spec {
  const core = withoutSides(cl);
  const r = assignRoles(core, load);
  const spec: Spec = { reps: [], guessed: r.guessed, bound: r.bound, leftovers: [] };
  for (let i = 0; i < cl.length; i++) {
    const t = cl[i];
    if (t.k === 'ord') spec.ordinal ??= t.n;
    else if (t.k === 'side') {
      if (t.side !== 'eachbare') spec.side = t.side;
      else {
        // "at 35 pounds each" is per-hand weight; "10 each" is per side.
        const p = cl[i - 1];
        const perHand = UNIT_WORDS.has(wordOf(p) ?? '') || (isNum(p) && r.roles[core.indexOf(p)] === 'weight');
        if (!perHand) spec.side = 'each';
      }
    } else if (wordOf(t) === 'bodyweight') spec.bodyweight = true;
  }
  for (let i = 0; i < core.length; i++) {
    const t = core[i];
    if (isNum(t)) {
      const role = r.roles[i];
      if (role === 'ord') spec.ordinal ??= r.vals[i];
      else if (role === 'count') spec.count ??= r.vals[i];
      else if (role === 'reps') spec.reps.push(r.vals[i]);
      else if (role === 'weight') {
        spec.weight = r.vals[i];
        spec.unit = r.units[i];
      } else if (role === undefined) spec.leftovers.push(t.raw);
    }
  }
  return spec;
}

/** "set 112, set 210, set 38" — dictation glued "set one 12" together. Split when the set numbers count up. */
function splitGluedSetNumbers(toks: Tok[]): Tok[] {
  const isSetNum = (i: number) => wordOf(toks[i]) === 'set' && setIntroAt(toks, i);
  let found = 0;
  for (let i = 0; i < toks.length; i++) if (isSetNum(i)) found++;
  if (found < 2) return toks;
  const out: Tok[] = [];
  let expected = 1;
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    if (!isSetNum(i)) continue;
    const n = toks[i + 1] as Extract<Tok, { k: 'num' }>;
    i++;
    const s = String(n.v);
    const e = String(expected);
    const rest = Number(s.slice(e.length));
    if (n.v >= 10 && Number.isInteger(n.v) && s.startsWith(e) && !isNum(toks[i + 1]) && rest >= 1 && rest <= 50) {
      out.push({ k: 'num', v: expected, raw: e }, { k: 'num', v: rest, raw: String(rest) });
      expected++;
    } else {
      out.push(n);
      expected = n.v + 1;
    }
  }
  return out;
}

const KG_TO_LB = 2.20462;

function buildSets(
  specs: Spec[],
  load: LoadInfo,
  lastWeight: number | undefined,
): { sets: VoiceSet[]; notes: string[]; guessed: boolean; leftovers: string[]; usedLast: boolean } {
  const notes: string[] = [];
  const leftovers = specs.flatMap((s) => s.leftovers);
  const guessed = specs.some((s) => s.guessed);
  const toLb = (s: Spec): number | undefined => {
    if (s.weight === undefined) return s.bodyweight ? 0 : undefined;
    if (s.unit !== 'kg') return s.weight;
    const lb = Math.round(s.weight * KG_TO_LB * 10) / 10;
    notes.push(`Converted ${s.weight} kg to ${lb} lb.`);
    return lb;
  };

  type Item = { set: VoiceSet } | { marker: number };
  const items: Item[] = [];
  let groupEach = false;
  let pendingOrd: number | undefined;
  let pendingSide: Side | undefined;
  let pendingCount: number | undefined;
  const fromCount = new Set<VoiceSet>();

  specs.forEach((spec, k) => {
    if (spec.side === 'each') groupEach = true;
    const side = spec.side === 'left' || spec.side === 'right' ? spec.side : undefined;
    const weight = toLb(spec);
    if (!spec.reps.length) {
      if (weight !== undefined) items.push({ marker: weight });
      if (spec.ordinal !== undefined) pendingOrd = spec.ordinal;
      if (side) pendingSide = side;
      if (spec.count !== undefined) {
        // A lone "3 sets" applies to the next clause only if exactly one clause of reps follows.
        let following = 0;
        for (let j = k + 1; j < specs.length && specs[j].count === undefined; j++) if (specs[j].reps.length) following++;
        if (following === 1) pendingCount = spec.count;
        else if (following > 1 && following !== spec.count) notes.push(`Heard ${spec.count} sets but ${following} rep counts.`);
        else if (following === 0) notes.push(`Heard ${spec.count} sets but no reps.`);
      }
      return;
    }
    let count = spec.count ?? pendingCount;
    pendingCount = undefined;
    if (spec.count !== undefined && spec.reps.length === 1 && !spec.bound) {
      // "3 sets: 12, 10, 8" — the count covers this clause and the ones after it.
      let following = 0;
      for (let j = k + 1; j < specs.length && specs[j].count === undefined && specs[j].reps.length; j++) following++;
      if (following && 1 + following === spec.count) count = undefined;
    }
    const ordinal = spec.ordinal ?? pendingOrd;
    pendingOrd = undefined;
    const s = side ?? pendingSide;
    pendingSide = undefined;
    const times = count && spec.reps.length === 1 ? Math.min(count, 20) : 1;
    if (ordinal !== undefined && spec.reps.length === 1 && times === 1) {
      // "3 sets of 10 ..., last set was 8": fix that set instead of adding one.
      const expanded = items.flatMap((it) => ('set' in it && fromCount.has(it.set) ? [it.set] : []));
      const target = ordinal === -1 ? expanded[expanded.length - 1] : expanded[ordinal - 1];
      if (target) {
        target.reps = spec.reps[0];
        if (weight !== undefined) target.weight = weight;
        if (s) target.side = s;
        fromCount.delete(target);
        return;
      }
    }
    for (const reps of spec.reps) {
      for (let c = 0; c < times; c++) {
        const set: VoiceSet = { reps, weight };
        if (s) set.side = s;
        if (spec.bodyweight) set.bodyweight = true;
        if (ordinal !== undefined && ordinal > 0 && spec.reps.length === 1 && times === 1) set.setNumber = ordinal;
        if (times > 1) fromCount.add(set);
        items.push({ set });
      }
    }
  });

  // Weights carry forward ("first set 10 at 135, second set 8"), and a weight said
  // after the reps covers the sets before it ("set one 12, set two 10, set three 8 at 40").
  const firstWeight = items.map((it) => ('marker' in it ? it.marker : it.set.weight)).find((w) => w !== undefined);
  let cur: number | undefined;
  for (const it of items) {
    if ('marker' in it) cur = it.marker;
    else if (it.set.weight !== undefined) cur = it.set.weight;
    else it.set.weight = cur ?? firstWeight;
  }

  let sets = items.flatMap((it) => ('set' in it ? [it.set] : []));
  let usedLast = false;
  for (const s of sets) {
    if (groupEach && !s.side) s.side = 'each';
    if (load.noLoad) {
      s.weight = 0;
    } else if (s.weight === undefined && lastWeight !== undefined) {
      s.weight = lastWeight;
      s.weightFromLast = true;
      usedLast = true;
    } else if (s.weight === undefined && load.addedLoad) {
      s.weight = 0;
    }
  }
  if (load.noLoad && specs.some((sp) => sp.weight !== undefined && sp.weight > 0)) notes.push('This exercise is logged without weight.');

  // Set numbers: the last mention of "set 2" wins, then sort when every set has one.
  if (sets.length > 1 && sets.every((s) => s.setNumber !== undefined)) {
    const byNum = new Map<number, VoiceSet>();
    for (const s of sets) byNum.set(s.setNumber!, s);
    sets = [...byNum.values()].sort((a, b) => a.setNumber! - b.setNumber!);
  }
  return { sets, notes, guessed, leftovers, usedLast };
}

// ---------- Corrections ----------

function lastClauseWithNumber(toks: Tok[], load: LoadInfo): { clause: Tok[]; read: ClauseRead } | null {
  const clauses = splitClauses(roleStream(toks));
  for (let c = clauses.length - 1; c >= 0; c--) {
    const clause = withoutSides(clauses[c]);
    if (clause.some(isNum)) return { clause, read: assignRoles(clause, load) };
  }
  return null;
}

/** "10 reps at 135, no wait, 9 reps" → "9 reps at 135". The last thing said wins. */
function applyCorrections(toks: Tok[], load: LoadInfo): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].k !== 'fix') {
      out.push(toks[i]);
      continue;
    }
    let j = i + 1;
    while (toks[j]?.k === 'sep') j++;
    const start = j;
    while (j < toks.length && toks[j].k !== 'sep' && toks[j].k !== 'fix') j++;
    const corr = toks.slice(start, j);
    i = j - 1;
    if (!corr.length) continue;

    // A new exercise name replaces the one just said.
    if (corr.some(isContent)) {
      let e = out.length - 1;
      while (e >= 0 && !isContent(out[e]) && !isNum(out[e])) e--;
      if (e >= 0 && isContent(out[e])) {
        let s = e;
        while (s > 0 && (isContent(out[s - 1]) || (out[s - 1].k === 'word' && STOP.has(wordOf(out[s - 1])!)))) s--;
        while (s <= e && !isContent(out[s])) s++;
        out.splice(s, e - s + 1);
      }
    }

    const corrNums = corr.filter(isNum);
    if (!corrNums.length) {
      out.push(...corr);
      continue;
    }
    const prev = lastClauseWithNumber(out, load);
    if (!prev) {
      out.push(...corr);
      continue;
    }
    const corrStream = withoutSides(roleStream(corr));
    const corrRead = assignRoles(corrStream, load);
    const replaced = new Set<Tok>();
    const prevNums = prev.clause.map((t, k) => ({ t, role: prev.read.roles[k] })).filter((x) => isNum(x.t));
    const explicit = corrStream.some((t, k) => isNum(t) && !corrRead.guessed && corrRead.roles[k] !== undefined);
    if (corrNums.length === 1 && !explicit) {
      // A bare number replaces the number it's closest to ("…at 135, make that 145" vs "…for 8, sorry, 9"); ties go to the later one.
      const v = corrNums[0].v;
      let target: Tok | undefined;
      let bestD = Infinity;
      for (const x of prevNums) {
        if (!isNum(x.t) || x.role === 'ord' || x.role === 'skip') continue;
        const d = Math.abs(Math.log(Math.max(v, 0.5) / Math.max(x.t.v, 0.5)));
        if (d <= bestD) {
          bestD = d;
          target = x.t;
        }
      }
      if (isNum(target)) {
        target.v = corrNums[0].v;
        target.raw = corrNums[0].raw;
        replaced.add(corrNums[0]);
      }
    } else {
      corrStream.forEach((t, k) => {
        const role = corrRead.roles[k];
        if (!isNum(t) || role === undefined || role === 'skip') return;
        const target = [...prevNums].reverse().find((x) => x.role === role)?.t;
        if (!isNum(target)) return;
        target.v = t.v;
        target.raw = t.raw;
        replaced.add(t);
        // Carry a changed unit ("40 kilos").
        const unitWord = wordOf(corrStream[k + 1]);
        const at = out.indexOf(target);
        if (unitWord && UNIT_WORDS.has(unitWord) && out[at + 1]?.k === 'word' && UNIT_WORDS.has(wordOf(out[at + 1])!)) out[at + 1] = { k: 'word', w: unitWord };
      });
    }
    if (!replaced.size) {
      out.push(...corr);
      continue;
    }
    // Keep only what the correction added: exercise words, and numbers that replaced nothing with their cue words.
    const keep = new Set<Tok>();
    corr.forEach((t, k) => {
      if (isContent(t) || t.k === 'side' || wordOf(t) === 'bodyweight') keep.add(t);
      if (!isNum(t) || replaced.has(t)) return;
      keep.add(t);
      for (const near of [corr[k - 1], corr[k + 1]]) if (near?.k === 'word' && KEYWORDS.has(near.w)) keep.add(near);
    });
    const added = corr.filter((t) => keep.has(t));
    if (added.some(isNum)) out.push({ k: 'sep', w: ',' });
    out.push(...added);
  }
  return out;
}

// ---------- Exercise matching ----------

function stem(w: string): string {
  const fixed: Record<string, string> = { calves: 'calf', calve: 'calf', triceps: 'tricep', biceps: 'bicep', flies: 'fly', flyes: 'fly', abs: 'ab' };
  if (fixed[w]) return fixed[w];
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function phraseTokens(text: string): string[] {
  return normalizeSpeech(text)
    .split(/[\s,;.!?]+/)
    .filter((w) => w && !STOP.has(w) && w !== 'or' && !/^z(?:each|eachbare|left|right|fix|bar)$/.test(w))
    .map(stem);
}

interface MatchIndex {
  ids: string[];
  aliases: Map<string, string[][]>;
  idf: Map<string, number>;
}

const indexCache = new WeakMap<Record<string, ExerciseDef>, MatchIndex>();

function getIndex(exercises: Record<string, ExerciseDef>): MatchIndex {
  const hit = indexCache.get(exercises);
  if (hit) return hit;
  const ids = Object.keys(exercises);
  const aliases = new Map<string, string[][]>();
  const df = new Map<string, number>();
  for (const id of ids) {
    const name = exercises[id].name;
    const texts = [name, ...(SYNONYMS[id] ?? [])];
    // "EZ-bar or dumbbell curl", "Incline walk or StairMaster": the last option alone is a name too.
    if (/ or /i.test(name)) texts.push(name.split(/ or /i).pop()!);
    const list = [...new Set(texts.map((t) => phraseTokens(t).join(' ')))].filter(Boolean).map((t) => t.split(' '));
    aliases.set(id, list);
    for (const tok of new Set(list.flat())) df.set(tok, (df.get(tok) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [tok, d] of df) idf.set(tok, Math.log(1 + ids.length / d));
  const index = { ids, aliases, idf };
  indexCache.set(exercises, index);
  return index;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  const len = Math.min(a.length, b.length);
  if (len < 4) return 0;
  const d = editDistance(a, b);
  if (d === 1) return 0.85;
  if (d === 2 && len >= 6 && a[0] === b[0]) return 0.7;
  return 0;
}

const UNKNOWN_WEIGHT = 1.2;
const EQUIPMENT = new Set(['dumbbell', 'barbell', 'cable', 'machine', 'bar', 'kettlebell', 'band', 'rope', 'db', 'bb', 'weight', 'plate']);

/** Precision-weighted F-score of a spoken phrase against one alias, using rarer words as stronger evidence. */
function aliasScore(phrase: string[], alias: string[], idf: Map<string, number>): { score: number; recall: number; hits: number[] } {
  const w = (t: string) => idf.get(t) ?? UNKNOWN_WEIGHT;
  let pNum = 0;
  let pDen = 0;
  const hits = phrase.map((t) => Math.max(0, ...alias.map((a) => tokenSim(t, a))));
  phrase.forEach((t, k) => {
    pDen += w(t);
    pNum += w(t) * hits[k];
  });
  let rNum = 0;
  let rDen = 0;
  for (const a of alias) {
    rDen += w(a);
    rNum += w(a) * Math.max(0, ...phrase.map((t) => tokenSim(t, a)));
  }
  const p = pDen ? pNum / pDen : 0;
  const r = rDen ? rNum / rDen : 0;
  const score = p + r ? (1.25 * p * r) / (0.25 * p + r) : 0;
  return { score, recall: r, hits };
}

export interface ExerciseMatch {
  id: string;
  score: number;
  alternatives: string[];
  /** Spoken words that matched the exercise. */
  hits: boolean[];
}

const CANDIDATE_MIN = 0.6;
const GLOBAL_MIN = 0.5;
const TIE = 0.1;

/**
 * Best exercise for some spoken words. Exercises in today's workout (`candidates`) win when they
 * fit reasonably well, so "tricep extension" on arms day means the single-arm one you're doing.
 */
export function matchExercise(
  words: string,
  ctx: Pick<VoiceContext, 'exercises' | 'candidates' | 'currentExerciseId'>,
): ExerciseMatch | null {
  const phrase = phraseTokens(words);
  // "20 kg dumbbells" names equipment, not an exercise.
  if (!phrase.length || phrase.every((t) => EQUIPMENT.has(t))) return null;
  const index = getIndex(ctx.exercises);
  const scored = index.ids.map((id) => {
    let best = { score: 0, recall: 0, hits: phrase.map(() => 0) };
    for (const alias of index.aliases.get(id) ?? []) {
      const s = aliasScore(phrase, alias, index.idf);
      if (s.score > best.score || (s.score === best.score && s.recall > best.recall)) best = s;
    }
    return { id, ...best };
  });
  const candidates = (ctx.candidates ?? []).filter((id) => id in ctx.exercises);
  // Near-ties go to the current exercise, then to today's order, then to the better score.
  const pref = (id: string) => (id === ctx.currentExerciseId ? 0 : candidates.includes(id) ? 1 + candidates.indexOf(id) : 1000);
  const order = (pool: typeof scored) => {
    const top = Math.max(0, ...pool.map((s) => s.score));
    const band = pool.filter((s) => s.score > 0 && s.score >= top - TIE);
    const rest = pool.filter((s) => !band.includes(s)).sort((a, b) => b.score - a.score);
    band.sort((a, b) => pref(a.id) - pref(b.id) || b.score - a.score || b.recall - a.recall);
    return [...band, ...rest];
  };
  const all = order(scored);
  const inWorkout = order(scored.filter((s) => candidates.includes(s.id)));
  const bestAll = all[0];
  const bestCand = inWorkout[0];
  let pick: (typeof scored)[number] | undefined;
  let pool = all;
  if (bestCand && bestCand.score >= CANDIDATE_MIN && bestCand.score >= bestAll.score - 0.35) {
    pick = bestCand;
    pool = inWorkout;
  } else if (bestAll && bestAll.score >= GLOBAL_MIN) pick = bestAll;
  if (!pick) return null;
  const chosen = pick;
  const alternatives = pool.filter((s) => s.id !== chosen.id && s.score >= chosen.score - TIE / 2 && s.score > 0).map((s) => s.id);
  return { id: chosen.id, score: Math.min(1, chosen.score), alternatives, hits: chosen.hits.map((h) => h >= 0.7) };
}

// ---------- Splitting a dictation into exercises ----------

interface Mention {
  start: number;
  end: number;
  words: string[];
  match: ExerciseMatch;
}

/** Runs of exercise-ish words, allowing filler like "the" inside ("extension on the cable"). */
function contentRuns(toks: Tok[]): { start: number; end: number; words: string[] }[] {
  const runs: { start: number; end: number; words: string[] }[] = [];
  let i = 0;
  while (i < toks.length) {
    if (!isContent(toks[i])) {
      i++;
      continue;
    }
    const start = i;
    let end = i + 1;
    let k = end;
    while (k < toks.length) {
      if (isContent(toks[k])) end = k + 1;
      else if (!(toks[k].k === 'word' && (STOP.has(wordOf(toks[k])!) || wordOf(toks[k]) === 'with' || wordOf(toks[k]) === 'of'))) break;
      // A stop word followed by a number ("on 135") ends the run.
      k++;
      if (isNum(toks[k])) break;
    }
    runs.push({ start, end, words: toks.slice(start, end).flatMap((t) => (isContent(t) ? [wordOf(t)!] : [])) });
    i = end;
  }
  return runs;
}

function hasNumberBetween(toks: Tok[], a: number, b: number): boolean {
  for (let i = a; i < b; i++) if (isNum(toks[i])) return true;
  return false;
}

// ---------- Main ----------

const STRONG_SEP = new Set(['.', ';', '!', '?', 'then']);

function loadInfo(def: ExerciseDef | undefined, bar: number): LoadInfo {
  if (!def) return { noLoad: false, addedLoad: false, timed: false, bar };
  return {
    noLoad: (def.kind === 'bodyweight' && !def.addedLoad) || !!def.timed || def.increment === 0,
    addedLoad: !!def.addedLoad,
    timed: !!def.timed,
    bar,
  };
}

/**
 * Parse dictated sets. Returns one group per exercise; the top-level fields mirror the first group.
 * Nothing is saved — show the result for confirmation (see docs/voice-logging.md).
 */
export function parseWorkoutSpeech(text: string, ctx: VoiceContext): VoiceParse {
  const bar = ctx.barWeight ?? 45;
  const normalized = normalizeSpeech(text);
  const current = ctx.currentExerciseId && ctx.exercises[ctx.currentExerciseId] ? ctx.currentExerciseId : undefined;
  // Corrections need to know if bare numbers are reps; use the exercise we'd fall back to.
  const fallbackLoad = loadInfo(current ? ctx.exercises[current] : undefined, bar);
  const toks = applyCorrections(tokenize(normalized, bar), fallbackLoad);
  const unmatched: string[] = [];
  /** Words that looked like an exercise name but matched nothing ("leg press"). */
  const unknownNames: string[] = [];

  // Find exercise names.
  let mentions: Mention[] = [];
  for (const run of contentRuns(toks)) {
    const match = matchExercise(run.words.join(' '), ctx);
    if (!match) {
      if (!run.words.every((w) => EQUIPMENT.has(stem(w)))) {
        unmatched.push(...run.words);
        unknownNames.push(run.words.join(' '));
      }
      continue;
    }
    mentions.push({ ...run, match });
  }
  // Two names with no numbers between them describe one exercise: keep the better match.
  const kept: Mention[] = [];
  for (const m of mentions) {
    const prev = kept[kept.length - 1];
    if (prev && !hasNumberBetween(toks, prev.end, m.start)) {
      const keepNew = m.match.score > prev.match.score + 0.05;
      const drop = keepNew ? prev : m;
      unmatched.push(...drop.words);
      if (keepNew) kept[kept.length - 1] = m;
      continue;
    }
    kept.push(m);
  }
  mentions = kept;
  for (const m of mentions) m.words.forEach((w, k) => k < m.match.hits.length && !m.match.hits[k] && unmatched.push(w));

  // Sentences (split at "then" / full stops), then exercise segments inside them.
  type Segment = { mention?: Mention; toks: Tok[] };
  const segments: Segment[] = [];
  const bounds: [number, number][] = [];
  let s0 = 0;
  toks.forEach((t, i) => {
    if (t.k === 'sep' && STRONG_SEP.has(t.w)) {
      bounds.push([s0, i + 1]);
      s0 = i + 1;
    }
  });
  bounds.push([s0, toks.length]);
  for (const [a, b] of bounds) {
    const ms = mentions.filter((m) => m.start >= a && m.end <= b);
    if (ms.length <= 1) {
      segments.push({ mention: ms[0], toks: toks.slice(a, b) });
      continue;
    }
    const nameFirst = !hasNumberBetween(toks, a, ms[0].start);
    ms.forEach((m, k) => {
      const from = nameFirst ? (k === 0 ? a : m.start) : k === 0 ? a : ms[k - 1].end;
      const to = nameFirst ? (k + 1 < ms.length ? ms[k + 1].start : b) : k === ms.length - 1 ? b : m.end;
      segments.push({ mention: m, toks: toks.slice(from, to) });
    });
  }
  // Sentences without a name join a neighbour: the name before if it has no sets yet, else the name after.
  const hasMaterial = (s: Segment) => s.toks.some(isNum) || s.toks.some((t) => wordOf(t) === 'bodyweight');
  const named: Segment[] = [];
  let orphans: Tok[] = [];
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    if (seg.mention) {
      named.push({ mention: seg.mention, toks: [...orphans, ...seg.toks] });
      orphans = [];
      continue;
    }
    const prev = named[named.length - 1];
    const nextNamed = segments.slice(k + 1).find((x) => x.mention);
    if (prev && (!hasMaterial(prev) || !nextNamed || hasMaterial(nextNamed))) prev.toks.push(...seg.toks);
    else orphans.push(...seg.toks);
  }
  if (orphans.length) {
    const last = named[named.length - 1];
    if (last) last.toks.push(...orphans);
    else named.push({ toks: orphans });
  }
  if (!named.length) named.push({ toks });

  // Same exercise twice → one group.
  const byExercise = new Map<string, { mention?: Mention; toks: Tok[] }>();
  for (const seg of named) {
    const key = seg.mention?.match.id ?? current ?? '';
    const g = byExercise.get(key);
    if (g) g.toks.push({ k: 'sep', w: ',' }, ...seg.toks);
    else byExercise.set(key, { mention: seg.mention, toks: [...seg.toks] });
  }

  const groups: VoiceGroup[] = [];
  const notes: string[] = [];
  for (const [key, seg] of byExercise) {
    const exerciseId = key || undefined;
    const def = exerciseId ? ctx.exercises[exerciseId] : undefined;
    const load = loadInfo(def, bar);
    const stream = splitGluedSetNumbers(roleStream(seg.toks));
    const specs = splitClauses(stream).map((cl) => readClause(cl, load));
    const last = (exerciseId ? ctx.lastWeights?.[exerciseId] : undefined) ??(!exerciseId || !current || exerciseId === current ? ctx.lastWeight : undefined);
    const built = buildSets(specs, load, last);
    unmatched.push(...built.leftovers);
    const source: VoiceGroup['exerciseSource'] = seg.mention ? 'spoken' : exerciseId ? 'current' : 'none';
    const groupNotes = [...built.notes];
    const alternatives = seg.mention?.match.alternatives ?? [];
    if (alternatives.length && def) {
      groupNotes.push(`Picked ${def.name}; could also be ${alternatives.map((id) => ctx.exercises[id].name).join(' or ')}.`);
    }
    if (built.usedLast) groupNotes.push(`No weight heard; used ${last} lb from your last set.`);
    if (source === 'current' && unknownNames.length && def) {
      groupNotes.push(`Didn't recognise "${unknownNames.join('", "')}"; used ${def.name}.`);
    }

    // Confidence.
    let c = 1;
    if (source === 'spoken') c *= (0.6 + 0.4 * seg.mention!.match.score) * (alternatives.length ? 0.85 : 1);
    else if (source === 'current') c *= unknownNames.length ? 0.55 : 0.9;
    else c *= 0.35;
    const sets = built.sets;
    if (!sets.length) c *= 0.25;
    if (built.guessed) c *= 0.85;
    if (built.usedLast) c *= 0.9;
    if (!load.noLoad && sets.some((s) => s.weight === undefined)) c *= 0.6;
    c *= 0.75 ** Math.min(2, built.leftovers.length);
    if (sets.some((s) => s.reps <= 0 || s.reps > (load.timed ? 3600 : 100) || (s.weight ?? 0) > 1200)) c *= 0.4;
    else if (!load.timed && sets.some((s) => s.reps > 30)) c *= 0.85;
    groups.push({
      exerciseId,
      exerciseName: def?.name,
      exerciseSource: source,
      heard: seg.mention?.words.join(' '),
      sets,
      confidence: c,
      alternatives,
      notes: groupNotes,
    });
    notes.push(...groupNotes);
  }

  const unmatchedPenalty = Math.max(0.7, 1 - 0.05 * unmatched.length);
  for (const g of groups) g.confidence = Math.round(g.confidence * unmatchedPenalty * 100) / 100;
  const first = groups[0];
  return {
    exerciseId: first?.exerciseId,
    exerciseName: first?.exerciseName,
    sets: first?.sets ?? [],
    unmatched,
    confidence: groups.length ? Math.min(...groups.map((g) => g.confidence)) : 0,
    groups,
    notes,
    normalized,
  };
}

/** A spoken number on its own: "a hundred thirty five" → 135. Undefined if it isn't one. */
export function parseSpokenNumber(text: string): number | undefined {
  const toks = tokenize(normalizeSpeech(text), 45);
  return toks.length === 1 && isNum(toks[0]) ? toks[0].v : undefined;
}

// ---------- Mapping onto the workout's set rows ----------

export interface SetDraft {
  exerciseId: string;
  /** Row on the workout screen (0-based), for logSet's setIndex. */
  setIndex: number;
  weight: number;
  reps: number;
  /** That row was already logged and will be overwritten. */
  replaces: boolean;
  /** Past the planned number of sets; the workout screen has no row for it. */
  extra: boolean;
  /** The weight wasn't said. */
  weightGuessed: boolean;
  note?: string;
}

/**
 * Place a group's sets onto the exercise's rows: "third set" goes to row 3, the rest fill the
 * first open rows in order. Left/right pairs become one row (fewer reps counts, since targets
 * are per side); the split is kept in `note`.
 */
export function toSetDrafts(
  group: Pick<VoiceGroup, 'exerciseId' | 'sets'>,
  opts: {
    totalSets: number;
    /** Rows already logged for this exercise. */
    logged: number[];
    /** Weight for a set where none was said: a number, or per row (e.g. that row's target). */
    fallbackWeight?: number | ((setIndex: number) => number | null | undefined);
  },
): SetDraft[] {
  const exerciseId = group.exerciseId;
  if (!exerciseId) return [];
  type Row = { set: VoiceSet; reps: number; note?: string };
  const rows: Row[] = [];
  for (let i = 0; i < group.sets.length; i++) {
    const a = group.sets[i];
    const b = group.sets[i + 1];
    const pair = b && ((a.side === 'left' && b.side === 'right') || (a.side === 'right' && b.side === 'left'));
    if (pair) {
      const l = a.side === 'left' ? a : b;
      const r = a.side === 'left' ? b : a;
      rows.push({ set: { ...a, weight: a.weight ?? b.weight, setNumber: a.setNumber ?? b.setNumber }, reps: Math.min(a.reps, b.reps), note: `Left ${l.reps}, right ${r.reps}` });
      i++;
    } else rows.push({ set: a, reps: a.reps });
  }
  const taken = new Set(opts.logged);
  const claimed = new Set<number>();
  const drafts: SetDraft[] = [];
  for (const row of rows) {
    let idx: number;
    if (row.set.setNumber !== undefined && !claimed.has(row.set.setNumber - 1)) idx = row.set.setNumber - 1;
    else {
      idx = 0;
      while (taken.has(idx) || claimed.has(idx)) idx++;
    }
    claimed.add(idx);
    const fb = typeof opts.fallbackWeight === 'function' ? opts.fallbackWeight(idx) : opts.fallbackWeight;
    const weight = row.set.weight ?? fb ?? undefined;
    drafts.push({
      exerciseId,
      setIndex: idx,
      weight: weight ?? 0,
      reps: row.reps,
      replaces: taken.has(idx),
      extra: idx >= opts.totalSets,
      weightGuessed: row.set.weight === undefined || !!row.set.weightFromLast,
      ...(row.note ? { note: row.note } : {}),
    });
  }
  return drafts;
}
