/**
 * Reads what you say you did ("I just did 200 pounds on bench press for 3 reps", "bench 200x3",
 * "3 sets of 8 at 135", "185 for 5, 5 and 4", "plank 45 seconds") into sets: which exercise (if
 * you named one) and each set's weight and reps. Plain rules, no network: dictation on the
 * keyboard turns speech into text, and this turns text into sets.
 */

export interface SaidSet {
  /** In lb (kg are converted). 0 for bodyweight. Missing: use the set's target. */
  weight?: number;
  /** Reps, or seconds for a timed exercise. Missing: use the set's target. */
  reps?: number;
}
export interface Said {
  /** The exercise you named, if any (matched against `exercises`). */
  exerciseId?: string;
  /** Named, but not one of `exercises`: its id among `all`, so the caller can say so. */
  elsewhere?: string;
  sets: SaidSet[];
}
export interface Nameable {
  id: string;
  name: string;
}

const ONES: Record<string, number> = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const ONE_AS_NUMBER_NEXT = /^\s*(?:rep|reps|set|sets|pound|pounds|lb|lbs|kg|kilo|kilos|minute|minutes|min|second|seconds|sec|time|times|x|by|hundred|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\d)\b/i;
const ONE_AS_NUMBER_PREV = /\b(?:for|at|did|got|x|of|with|plus|just)\s*$/i;

/** "two hundred and five" → 205, "one eighty five" → 185, "a hundred" → 100, "twelve" → 12. */
function wordsToDigits(text: string): string {
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let num: number | null = null;
  let pendingSpace = '';
  const flush = () => {
    if (num !== null) out.push(String(num));
    num = null;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\s+$/.test(w)) {
      pendingSpace = w;
      continue;
    }
    const lw = w.toLowerCase().replace(/-/g, ' ');
    const parts = lw.split(' ');
    let consumed = true;
    for (const p of parts) {
      // "that one felt heavy": a lone "one" is a word, not a number, unless a number or a unit is
      // around it ("one rep", "one eighty five", "for one").
      const loneOne = p === 'one' && num === null && !ONE_AS_NUMBER_NEXT.test(words.slice(i + 1).join('')) && !ONE_AS_NUMBER_PREV.test(words.slice(0, i).join(''));
      if (!loneOne && (p in ONES || p in TEENS || p in TENS)) {
        const v = ONES[p] ?? TEENS[p] ?? TENS[p];
        if (num === null) {
          out.push(pendingSpace);
          num = v;
        }
        else if (num % 100 === 0 && num >= 100) num += v; // two hundred five
        else if (num < 10 && v >= 10) num = num * 100 + v; // one eighty (five)
        else if (num % 10 === 0 && num >= 20 && v < 10) num += v; // eighty five
        else if (num >= 100 && num % 10 === 0 && v < 10) num += v; // one eighty five
        else {
          flush();
          out.push(pendingSpace);
          num = v;
        }
      } else if (p === 'hundred') {
        if (num === null) out.push(pendingSpace);
        num = (num ?? 1) * 100;
      } else if ((p === 'a' || p === 'an') && num === null && /^\s*hundred/i.test(words.slice(i + 1).join(''))) {
        out.push(pendingSpace);
        num = 1;
      }
      else if (p === 'and' && num !== null && num >= 100 && /^\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/i.test(words.slice(i + 1).join(''))) {
        // "hundred and five": part of the number
      } else consumed = false;
    }
    if (consumed) {
      pendingSpace = '';
      continue;
    }
    flush();
    out.push(pendingSpace, w);
    pendingSpace = '';
  }
  flush();
  return out.join('').replace(/(\d)(?=[a-z])/g, '$1 ');
}

function normalize(text: string): string {
  let t = ` ${wordsToDigits(text.toLowerCase())} `;
  t = t.replace(/[“”"’']/g, '');
  t = t.replace(/(\d)\s*(?:x|×|\*)\s*(\d)/g, '$1 x $2').replace(/(\d)\s+by\s+(\d)/g, '$1 x $2');
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?|#)(?=\W)/g, '$1 lb ');
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*(?:kilos?|kilograms?|kgs?)(?=\W)/g, '$1 kg ');
  t = t.replace(/\b(?:repetitions?|reps?|times)\b/g, ' reps ');
  t = t.replace(/\b(\d+)\s*(?:minutes?|mins?)\b/g, (_, m) => `${+m * 60} sec`);
  t = t.replace(/\b(?:a|one)\s+minute\b/g, '60 sec');
  t = t.replace(/\bhalf\s+a\s+minute\b/g, '30 sec');
  t = t.replace(/\b(\d+)\s*(?:seconds?|secs?)\b/g, '$1 sec');
  // "25s": 25 lb dumbbells, or 25 seconds of a hold (decided once the exercise is known).
  t = t.replace(/\b(\d+)s\b/g, '$1 s ');
  t = t.replace(/\b(?:body\s*weight|bw|no\s+weight|no\s+added\s+weight)\b/g, ' bw ');
  t = t.replace(/\+\s*(\d)/g, ' plus $1');
  t = t.replace(/\bsets?\b/g, ' sets ');
  t = t.replace(/@/g, ' at ');
  // "5 and 4" in a list of reps: a comma.
  t = t.replace(/(\d)\s+(?:and|then)\s+(\d)/g, '$1, $2');
  return t.replace(/\s+/g, ' ');
}

interface Seg {
  weight?: number;
  reps?: number;
  sets?: number;
  bw?: boolean;
}

/** One stretch between commas: its weight, reps and set count, by what's around each number. */
function readSegment(seg: string, light: boolean): Seg {
  const tok = seg.match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
  const isNum = (s?: string) => !!s && /^\d/.test(s);
  const out: Seg = {};
  const loose: number[] = [];
  for (let k = 0; k < tok.length; k++) {
    if (tok[k] === 'bw') out.bw = true;
    if (!isNum(tok[k])) continue;
    const n = parseFloat(tok[k]);
    const next = tok[k + 1];
    const prev = tok[k - 1];
    if (next === 'x' && isNum(tok[k + 2])) {
      const m = parseFloat(tok[k + 2]);
      // 3x10 (sets × reps) when there's a weight elsewhere or the first is tiny; else weight × reps.
      const hasWeight = /\d\s*(lb|kg)\b|\b(at|with)\s+\d/.test(seg);
      if (hasWeight || (n <= 5 && m <= 30)) {
        out.sets = n;
        out.reps = m;
      } else if (n <= 30 && m > 30) {
        out.reps = n;
        out.weight = m;
      } else {
        out.weight = n;
        out.reps = m;
      }
      k += 2;
      continue;
    }
    if (next === 'lb') out.weight = n;
    else if (next === 'kg') out.weight = Math.round(n * 2.20462 * 2) / 2;
    else if (next === 'reps' || next === 'sec') out.reps = n;
    else if (next === 's') {
      if (light) out.reps = n;
      else out.weight = n;
    }
    else if (next === 'sets') out.sets = n;
    else if (prev === 'plus') out.weight = n;
    else if (prev === 'of' && tok[k - 2] === 'sets') out.reps = n;
    else if (prev === 'for' || prev === 'did' || prev === 'got') loose.unshift(n), (out as { forReps?: number }).forReps = n;
    else if (prev === 'at' || prev === 'with' || prev === 'of' || prev === 'using') out.weight = n;
    else loose.push(n);
  }
  const forReps = (out as { forReps?: number }).forReps;
  delete (out as { forReps?: number }).forReps;
  // Numbers with nothing around them: fill whatever's missing.
  if (forReps !== undefined && out.reps === undefined && out.weight !== undefined) {
    out.reps = forReps;
    loose.splice(loose.indexOf(forReps), 1);
  }
  const rest = loose.filter((n) => n !== out.reps && n !== out.weight || loose.length > 1);
  if (out.weight === undefined && out.reps === undefined) {
    if (rest.length >= 2) {
      // "bench 200 3": the bigger one is the weight (unless you said "for" before one of them).
      const [a, b] = rest;
      if (forReps !== undefined) {
        out.reps = forReps;
        out.weight = a === forReps ? b : a;
      } else {
        out.weight = Math.max(a, b);
        out.reps = Math.min(a, b);
      }
    } else if (rest.length === 1) {
      if (forReps !== undefined || light || rest[0] <= 30) out.reps = rest[0];
      else out.weight = rest[0];
    }
  } else if (out.weight === undefined && rest.length) out.weight = rest.find((n) => n !== out.reps);
  else if (out.reps === undefined && rest.length) out.reps = rest.find((n) => n !== out.weight);
  if (out.bw && out.weight === undefined) out.weight = 0;
  return out;
}

// ---------- Which exercise ----------

const STOP = new Set(
  's i im ive just did do done got get my on for at with of the a an and then sets set reps rep lb kg sec x bw plus pounds pound last first this that it was were went hit made all each per side for more about around like um uh so okay ok also only next using'.split(' '),
);
/** Extra words people use for an exercise, beyond its name. */
const ALIASES: Record<string, string[]> = {
  pullup: ['pullup', 'chin', 'chinup'],
  rdl: ['rdl', 'deadlift'],
  skullCrusher: ['skull', 'skullcrusher', 'skulls'],
  pushdown: ['pushdown', 'pressdown', 'tricep'],
  ohTricepsExt: ['tricep', 'overhead'],
  leaningOhExt: ['tricep', 'overhead', 'leaning'],
  dbShoulderPress: ['shoulder', 'ohp'],
  ezCurl: ['bicep', 'ez'],
  inclineWalk: ['walk', 'treadmill', 'stairmaster', 'cardio'],
  facePull: ['facepull'],
  hangingLegRaise: ['leg', 'raise'],
  walkingLunge: ['lunge'],
  bulgarian: ['split', 'squat', 'bss'],
  hipThrust: ['thrust', 'glute'],
  cableLegExt: ['extension', 'quad'],
  calfRaise: ['calf', 'calves'],
};

const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);

function bestMatch(said: string[], list: Nameable[]): string | undefined {
  const query = new Set(said);
  // "pull ups" / "push downs" said as two words match "pullup" / "pushdown".
  for (let i = 0; i + 1 < said.length; i++) query.add(stem(said[i] + said[i + 1]));
  let best: { id: string; score: number } | undefined;
  list.forEach((e, order) => {
    const name = new Set([...wordsOf(e.name), ...(ALIASES[e.id] ?? []).map(stem)]);
    let hit = 0;
    for (const w of query) if (name.has(w)) hit++;
    if (!hit) return;
    // More of your words in its name wins; then the earlier one (the one you're on comes first).
    const score = hit * 100 - order * 0.01;
    if (!best || score > best.score) best = { id: e.id, score };
  });
  return best?.id;
}

/**
 * `exercises`: this workout's, in the order you'll do them (the one you're on first, so a bare
 * "curls" means the curl you're on). `all`: every exercise, to tell you if you named one that
 * isn't in this workout. `isLight(id)`: no load (a lone number is reps).
 */
export function parseSaid(text: string, exercises: Nameable[], all: Nameable[] = [], isLight: (id?: string) => boolean = () => false): Said | null {
  const t = normalize(text);
  const said = wordsOf(t.replace(/\d+(?:\.\d+)?/g, ' ')).filter((w) => !STOP.has(w));
  const exerciseId = said.length ? bestMatch(said, exercises) : undefined;
  const elsewhere = !exerciseId && said.length ? bestMatch(said, all) : undefined;
  const light = isLight(exerciseId);

  const segs = t
    .split(/[,;]|\bthen\b|\band then\b/)
    .map((s) => readSegment(s, light))
    .filter((s) => s.reps !== undefined || s.weight !== undefined);
  if (!segs.length) return null;

  const sets: SaidSet[] = [];
  let weight: number | undefined;
  let reps: number | undefined;
  for (const s of segs) {
    if (s.weight !== undefined) weight = s.weight;
    // A segment that only says a weight changes it for what follows ("185 for 5, then 175 for 6").
    if (s.reps !== undefined) reps = s.reps;
    const n = Math.max(1, Math.min(10, s.sets ?? 1));
    if (s.reps === undefined && s.weight !== undefined && segs.length > 1) continue;
    for (let i = 0; i < n; i++) sets.push({ weight: s.weight ?? weight, reps: s.reps ?? reps });
  }
  return { exerciseId, elsewhere, sets };
}
