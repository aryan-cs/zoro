/**
 * The rest timer's sound: the tone that starts the FitnessGram PACER test, cut from the original
 * recording (public/sounds/pacer-start.mp3). If that can't load, a "bo-de-boop" made here with
 * Web Audio plays instead. It plays when a rest ends while Zoro is open, through headphones when
 * they're in, and with the ringer off too: for that, iOS needs the page's audio session set to
 * playback, which pauses other apps' music (Safari doesn't tell them to carry on after). Once Zoro
 * is in another app or the phone is locked it can't play anything; the rest notification
 * (restPush.ts) covers that, with the system sound.
 */
const KEY = 'zoro.restSound';

export const restSoundOn = () => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
};
export const setRestSound = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* kept until the app closes */
  }
};

type AudioSessionish = { type: string };
const audioSession = () => (navigator as Navigator & { audioSession?: AudioSessionish }).audioSession;

let ctx: AudioContext | null = null;
let unlocked = false;
let clip: AudioBuffer | null = null;
export const CLIP_URL = `${import.meta.env.BASE_URL}sounds/pacer-start.mp3`;

function context(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    // The recording, decoded ahead so it plays the moment the rest ends (it's precached offline).
    const c = ctx;
    void fetch(CLIP_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .then((b) => (clip = b))
      .catch(() => undefined);
  }
  return ctx;
}

/**
 * Call from a tap: iOS only lets a page start sound after one. Starts the audio in that tap with a
 * silent sample, then pauses it again, so the rest's end can start it later by itself. (The
 * page's audio stays ambient here, so this doesn't stop any music.)
 */
export function primeRestSound() {
  if (unlocked || !restSoundOn()) return;
  const c = context();
  if (!c) return;
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start();
  } catch {
    /* nothing to unlock with */
  }
  void c
    .resume()
    .then(() => {
      unlocked = c.state === 'running';
      return c.suspend();
    })
    .catch(() => undefined);
}

/** The made-up stand-in's notes, if the recording can't load: [start, length] in seconds. */
export const NOTES: [number, number][] = [
  [0, 0.09],
  [0.14, 0.09],
  [0.28, 0.24],
];
const PITCH = 1046.5; // C6
const LEVEL = 0.22;
export const LENGTH = NOTES.at(-1)![0] + NOTES.at(-1)![1];

/** Schedules the beeps on `c` from time `t0`: square tones softened by a low-pass, like an old CD's. */
function beeps(c: AudioContext, t0: number) {
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.connect(c.destination);
  for (const [at, len] of NOTES) {
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = PITCH;
    const g = c.createGain();
    const s = t0 + at;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(LEVEL, s + 0.004);
    g.gain.setValueAtTime(LEVEL, s + len - 0.02);
    g.gain.linearRampToValueAtTime(0, s + len);
    osc.connect(g).connect(tone);
    osc.start(s);
    osc.stop(s + len + 0.01);
  }
}

let plays = 0;

/** Plays the rest's sound now (also from a tap, to hear it in Settings). */
export function playRestSound() {
  const c = context();
  if (!c) return;
  const session = audioSession();
  const play = ++plays;
  // Playback, so the ringer switch doesn't silence it; back to the default once it's done (or if
  // iOS won't start it without a tap, which leaves resume() waiting).
  if (session) session.type = 'playback';
  const done = () => {
    if (session && play === plays) session.type = 'auto';
  };
  const giveUp = window.setTimeout(done, 5000);
  void c
    .resume()
    .then(() => {
      window.clearTimeout(giveUp);
      if (session) session.type = 'playback';
      unlocked = true;
      let length = LENGTH;
      if (clip) {
        const src = c.createBufferSource();
        src.buffer = clip;
        src.connect(c.destination);
        src.start(c.currentTime + 0.03);
        length = clip.duration;
      } else beeps(c, c.currentTime + 0.03);
      window.setTimeout(() => {
        // Paused again unless another one started meanwhile.
        if (play === plays) void c.suspend().catch(() => undefined).finally(done);
      }, (length + 0.25) * 1000);
    })
    .catch(done);
}
