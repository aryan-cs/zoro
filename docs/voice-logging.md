# Logging lifts by voice

Goal: tap a button, say something like "I just did 3 sets of 10 at 35 pounds on single arm tricep extension, switching arms", and have Zoro fill in the sets. It has to be free, should work offline, and runs as a Home Screen web app on iOS 26/27 (GitHub Pages, no backend).

This doc covers:

1. How to capture speech, with sources and a recommendation.
2. The parser in `src/core/voice.ts`.
3. A plan for adding it to the workout screen.

Researched November 2026. iOS changes often, so check each claim on a real iPhone before shipping (see the checklist at the end).

---

## 1. Capture: research and recommendation

### Recommendation

**Primary: iOS keyboard dictation into a text field in Zoro's voice sheet.** Tapping the mic button opens a sheet with a focused text field. You tap the microphone key on the iOS keyboard and speak. Zoro parses the text as it arrives and shows the sets to confirm. This costs nothing, needs no setup and works in the Home Screen app. Apple says it runs on the iPhone with no internet connection in many languages. The web app also never asks for microphone permission, because the keyboard does the listening.

**Fallback: a "Zoro Lift" Shortcut** built on the *Dictate Text* action. It copies the text, and you paste it into the same sheet. This reuses the pipeline Zoro already has for the sleep shortcut. It's for when you can't or don't want to use the keyboard: the Action button, Siri, Back Tap, or a Lock Screen widget. Typing into the same field ("3x10 @ 50") always works too, because the parser reads typed shorthand as well.

**Not recommended:**
- **Web Speech API:** not available in Home Screen web apps.
- **In-browser Whisper:** too heavy and fragile on an iPhone today.
- **Hosted free tiers:** the API key would ship in public code, and they need a network connection.

The details for each option follow.

### Option A: Web Speech API (`webkitSpeechRecognition`)

| | Finding |
|---|---|
| Safari tab | Supported since iOS 14.5, still prefixed as `webkitSpeechRecognition`. It uses "the same speech engine as Siri" ([WebKit, Safari 14.1](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1)), and needs Siri/Dictation enabled. Otherwise it fails with `service-not-allowed` ([WebKit bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)). caniuse lists iOS Safari 14.5–27.2 as *partial* support ([caniuse](https://caniuse.com/speech-recognition)). |
| **Home Screen web app** | **Not available.** A WebKit engineer wrote: "SpeechRecognition API is not available in SafariViewController and web apps added to Home Screen for now" ([bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), resolved LATER; people were still asking for an update in 2025). [Firtman](https://firt.dev/ios-14.5/) reported the same at launch. In October 2026 a project shipped a fallback because the Home Screen app fails with `service-not-allowed` ([qryptchat PR #323](https://github.com/profullstack/qryptchat-web/pull/323)). One source says it works ([whatpwacando.today](https://whatpwacando.today/speech-recognition)), but the same page contradicts itself, and it doesn't match the WebKit tracker. |
| iOS 26 change | Every site added to the Home Screen now opens as a web app by default ([WebKit, Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). So the standalone limitation applies to any install. |
| iOS 27 breakage | [WebKit bug 321436](https://bugs.webkit.org/show_bug.cgi?id=321436) (open, last updated Nov 18, 2026): on iOS 27.0–27.3 beta only the first recognition after launch works. Later `start()` calls go silent, with no `result`, `error` or `end` events. A commenter says "Bug was introduced with iOS 27." |
| Continuous / interim results | With `interimResults = true`, results sometimes arrive only as final and slowly, apparently from the server. Offline runs sometimes fail ([Apple forums 775699](https://developer.apple.com/forums/thread/775699), no replies). Native `SFSpeechRecognizer`, which this sits on, has a one-minute limit per session ([Picovoice guide](https://picovoice.ai/blog/ios-speech-recognition/)). |
| Privacy | Audio can go to Apple's servers ([Firtman](https://firt.dev/ios-14.5/)). |

Verdict: unusable for an installed Zoro. If Apple ever enables it, it could become an extra "Listen" button, detected with `'webkitSpeechRecognition' in window` plus a real test call. Feature detection alone isn't enough, because the object exists but doesn't work.

### Option B: iOS keyboard dictation (primary)

- **Free and built in.** Turn it on at Settings > General > Keyboard > Enable Dictation. Tap the Dictate button on the keyboard ([Apple: Dictate text on iPhone](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios)).
- **Offline.** Apple says: "Dictation is processed on your iPhone in many languages, and no internet connection is required." Search fields are the exception, so use a plain `<textarea>`, not `type="search"`.
- **Length.** Dictation stops after 30 seconds of silence, when you tap the Dictate button again, or when you say "Stop dictation". That's plenty for one dictation.
- **Works in the Home Screen app.** It's the system keyboard, so it works anywhere a text field can be focused. The web app never touches the microphone, which also avoids the iOS 26/27 bug where Home Screen apps ask for mic permission on every launch ([WebKit bug 327237](https://bugs.webkit.org/show_bug.cgi?id=327237), filed Oct 2026, open).
- **Cost: one extra tap.** A web page can't start dictation itself. The user taps the keyboard's microphone key. The sheet should say so ("Tap the mic on the keyboard and say what you did").
- **Speech-to-text quirks** the parser handles:
  - it writes numbers as digits ("3 sets of 10") and sometimes as clock times ("1:35")
  - it hears "for" as "4", "to" as "2" and "a" as "8"
  - it mishears rare words ("Bayesian" as "Beijing")

### Option C: iOS Shortcut with "Dictate Text" (fallback)

- *Dictate Text* takes a Language and a *Stop Listening* setting (After Pause / After Short Pause / On Tap) and outputs the transcribed text ([action reference](https://www.matthewcassinelli.com/actions/dictate-text/)). One user report says *On Tap* behaved like *After Pause* on iOS 17 ([Apple Community](https://discussions.apple.com/thread/255582634)), so use *After Pause*.
- Zoro already ships a signed shortcut this way. `scripts/make-sleep-shortcut.py` builds `public/ZoroSleep.shortcut`, and `src/screens/LogSleep.tsx` installs it through the share sheet, runs it with `shortcuts://run-shortcut?name=…` and reads the result with `navigator.clipboard.readText()`. A lift shortcut is the same recipe with different actions.
- **Pros:** you can start it from the Action button, Siri, Back Tap or a widget without opening Zoro.
- **Cons:** it's a round trip. You leave Zoro, speak, get a "Copied" notification, return to Zoro and tap Paste (iOS shows its paste prompt). There are more steps than keyboard dictation, and it needs a one-time install.

### Option D: Whisper in the browser (transformers.js, whisper.cpp WASM, WebGPU)

| | Finding |
|---|---|
| Model size | `whisper-tiny.en` int8: encoder 10.1 MB plus merged decoder 30.7 MB, about 41 MB. The fp16 version is about 76 MB ([Hugging Face files](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx)). The ONNX Runtime Web binary adds about 27 MB ([ferretry PR #745](https://github.com/kirinnee/ferretry/pull/745)). whisper.cpp's `tiny` is 74 MB ([whisper.wasm README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm)). |
| Speed / memory | On desktop Chrome, a 10.4 s clip took 2.2 s with tiny.en (WASM) and 4.2 s with base.en. Memory was about 600 MB and 750 MB ([ferretry PR #745](https://github.com/kirinnee/ferretry/pull/745)). whisper.cpp says its WASM speed "is not great", roughly 2–3x real time on a modern desktop. I found no iPhone benchmarks. |
| iPhone reality | iPhone Safari silently reloads tabs that use too much memory after the model downloads, so phones get tiny and a single WASM thread ([Quietscribe write-up](https://dev.to/quietscribe/i-built-a-free-whisper-transcription-site-that-runs-in-the-browser-5-things-that-broke-59o6)). Transformers.js has open iOS crash reports ([#1242](https://github.com/huggingface/transformers.js/issues/1242), [#1298](https://github.com/huggingface/transformers.js/issues/1298)). WebGPU is on by default in Safari 26 ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers), [gpuweb status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)), but I found no iPhone Whisper numbers on WebGPU either. |
| Hosting | WASM threads need cross-origin isolation (COOP/COEP headers). GitHub Pages can't set headers ([GitHub discussion](https://github.com/orgs/community/discussions/13309)), so you'd need the `coi-serviceworker` workaround. Zoro's service worker only precaches files up to 3 MB (`vite.config.ts`), so the model would need its own runtime cache. |
| Mic | It needs `getUserMedia`, which re-prompts on every Home Screen launch ([bug 327237](https://bugs.webkit.org/show_bug.cgi?id=327237)). |
| Accuracy | tiny/base models are the weakest Whisper sizes and tend to loop on short clips. Gym numbers ("one thirty five") are exactly the kind of thing small models get wrong. |

Verdict: not practical as the main path. You'd download about 70 MB, risk memory crashes and add a header workaround, and the result would likely be no better than Apple's on-device dictation. It might be worth revisiting as an opt-in download once someone measures it on an iPhone.

### Option E: Free hosted speech-to-text or LLM tiers

- **Groq** (Whisper large v3 turbo): the free tier is about 20 requests/min, 2,000/day and 7,200 audio seconds/hour, according to the [rate limits page](https://console.groq.com/docs/rate-limits) and third-party summaries. Check the live console.
- **Cloudflare Workers AI**: 10,000 free "neurons" a day. Whisper large v3 turbo costs about 46.6 neurons per audio minute, or roughly 200 free minutes a day ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). It needs a Worker, which is a backend, even though it's free.
- **Free LLM tiers** (to parse text) aren't needed, because the rule-based parser below already does that offline.

Why they don't fit:
- Zoro is a static site, so any API key ships in public JavaScript where anyone can copy it and use up the quota.
- Every request needs a network connection.
- Audio of the user leaves the phone.
- A Worker proxy hides the key but adds a backend to run and rate-limit.

### Summary

| Option | Free | Offline | Works installed | Taps | Verdict |
|---|---|---|---|---|---|
| Keyboard dictation | yes | yes (many languages) | yes | mic button, keyboard mic | **Primary** |
| Shortcut + Dictate Text | yes | yes | yes (via paste) | run shortcut, return, Paste | **Fallback** |
| Web Speech API | yes | sometimes | **no** | 1 | Not available |
| Whisper in browser | yes | after a ~70 MB download | risky | 1 + mic prompt each launch | Not practical yet |
| Hosted free tiers | quota-limited | no | yes | 1 + mic prompt | Key exposure, needs network |

No new dependency is needed for the recommended path. If Whisper is tried later, the candidate is `@huggingface/transformers` (v3) with `onnx-community/whisper-tiny.en`, loaded lazily and cached at runtime, plus `coi-serviceworker` for threads. Measure it on an iPhone first.

---

## 2. The parser: `src/core/voice.ts`

It's deterministic and rule-based, with no network and no model. One parse takes about 1–2 ms. All functions are pure.

### API

```ts
parseWorkoutSpeech(text: string, ctx: VoiceContext): VoiceParse

interface VoiceContext {
  exercises: Record<string, ExerciseDef>;  // EXERCISES
  candidates?: string[];          // today's exercise ids, preferred when matching; put unfinished ones first
  currentExerciseId?: string;     // used when no exercise is named
  lastWeight?: number;            // used when no weight is said (for the current exercise)
  lastWeights?: Record<string, number>; // per exercise, for dictations naming other exercises
  barWeight?: number;             // "just the bar", "two plates" (default 45)
}

interface VoiceParse {
  exerciseId?: string; exerciseName?: string; sets: VoiceSet[];   // = groups[0]
  groups: VoiceGroup[];      // one per exercise dictated
  unmatched: string[];       // words/numbers that weren't used
  confidence: number;        // 0–1, lowest of the groups
  notes: string[];           // "Converted 20 kg to 44.1 lb.", "Picked X; could also be Y."
  normalized: string;        // cleaned text, for debugging
}

interface VoiceSet { reps: number; weight?: number; side?: 'left' | 'right' | 'each';
                     setNumber?: number; bodyweight?: boolean; weightFromLast?: boolean }

interface VoiceGroup { exerciseId?; exerciseName?; exerciseSource: 'spoken' | 'current' | 'none';
                       heard?: string; sets: VoiceSet[]; confidence: number; alternatives: string[]; notes: string[] }
```

Helpers:
- `toSetDrafts(group, { totalSets, logged, fallbackWeight })` turns a group into `{ exerciseId, setIndex, weight, reps, replaces, extra, weightGuessed, note? }[]`, ready for `logSet`.
- `matchExercise(words, ctx)` matches exercise names on their own.
- `parseSpokenNumber(text)` reads a number on its own.
- `normalizeSpeech(text)` cleans up text.

Weights are always in **pounds** (kg is converted and noted). For bodyweight moves with `addedLoad` (pull-ups, dips), the weight is the added load, and nothing said means 0. Moves that take no load (planks, leg raises, dead hangs) always get `weight: 0`. Timed moves put seconds in `reps`.

### How it works

1. **Clean-up** (`normalizeSpeech`):
   - lower-cases and fixes symbols: `@` → at, `×`/`3x10` → `3 x 10`, `#` → lb, `½`, `1:35` → 135
   - joins gym compounds: pull-ups → pullup, R.D.L. → rdl, single-arm → single arm
   - drops filler (um, uh)
   - marks corrections ("no wait", "actually", "sorry", "make that", "scratch that") and side phrases ("each arm", "switching arms", "left arm")
2. **Tokens and numbers.** Spoken numbers become numeric tokens:
   - "a hundred and thirty five", "one thirty five" and "two twenty five" (gym hundreds), "one oh five"
   - "thirty seven and a half", "twelve point five"
   - homophones only where a number is expected: "for sets" → 4, "set to" → 2, "a reps" → 8, "did ate" → 8, "135 4 8" → 135 for 8
   - "1 minute 30 seconds" → 90; "RPE 8" is dropped
3. **Corrections.** The last thing said wins. A correction like "9 reps" or "40 pounds" replaces the value with the same role. A bare number replaces the closest value ("…for 8, sorry, 9" changes the 8; "…at 135, no wait, 145" changes the 135). A new exercise name replaces the one just said.
4. **Exercise names.**
   - Runs of non-grammar words are matched against each exercise's name plus a synonym table (bench, incline, RDL, skull crushers, pull ups, curls…).
   - Rare words count more, and spelling mistakes within one or two letters are tolerated.
   - Exercises in `candidates` win when they fit reasonably well ("tricep extension" on arms day → the single-arm one).
   - Near-ties go to the current exercise, then to the earlier exercise in `candidates`, and lower confidence.
   - Equipment alone ("dumbbells") isn't a name.
5. **Splitting several exercises.** Text is split at "then" and full stops. Within a sentence, numbers go to the exercise named before them ("bench 5 at 185, incline 3x10 at 135"), or after them if the first name comes after numbers ("3x10 at 35 on tricep extension and 3x12 at 25 on hammer curls").
6. **Number roles in each clause.** Each clause (split at commas, "and", "set 2", "first set", "left/right") assigns a role to each number:
   - keyword cues: `sets`, `reps`, `seconds/minutes`, `lb/kg/plates`, `at/with/plus`, `of`, `x/by/times`, `for`
   - then size for bare numbers (30 or below and whole → reps; otherwise → weight)
7. **Sets.**
   - Counts expand ("3 sets of 10").
   - Lists become separate sets ("12, 10, 8 at 40").
   - "last set was 8" or "third set 8" fixes that set of a counted group instead of adding one.
   - A weight carries forward to later sets, and a weight said after the reps covers the sets before it.
   - Sets still missing a weight take `lastWeight` (flagged `weightFromLast`).
   - "each arm" or "switching arms" gives every set `side: 'each'`.
8. **Confidence.** Starts at 1 and is reduced for:
   - a weak or ambiguous name match
   - falling back to the current exercise, or more if an unknown name was heard ("leg press")
   - roles guessed from size, or a weight taken from `lastWeight`
   - leftover numbers or ignored words
   - implausible values

### What the tests cover (`src/core/voice.test.ts`, 100 cases)

- **The example:** "I just did 3 sets of 10 at 35 pounds on single arm tricep extension, switching arms" → `leaningOhExt`, 3 × 10 @ 35, side each. Also tested fully spelled out and with no comma.
- **One set:**
  - "10 reps at 135", "did 8 with 185", "135 for 8", "8 for 185", "135 x 8"
  - "one thirty five for eight", "a hundred thirty five for 8", fillers
  - "8 reps" with and without `lastWeight`; a last weight only applies to its own exercise
- **Sets × reps:**
  - "3 by 10 at 50", "3x10 @ 50", "3 × 10 at 50 lbs", "three by ten at fifty", "three sets of ten at fifty"
  - "3 sets, 10 reps, 50 pounds", "5 x 5 at 225"
  - "3 sets: 12, 10, 8 at 40", "did 12 10 and 8 with the 25s"
  - "two sets of 10 and one of 8", "…last set was 8"
- **Set by set:**
  - "first set 10 at 135, second set 8 at 145, third set 6 at 155"
  - "set one 12, set two 10, set three 8 at 40", fully spelled out, and the dictation glitch "Set 112, set 210, set 38 at 40"
  - weight carry-forward
- **Units and load:**
  - kg → lb with a note; pounds/pound/lbs/lb/#
  - bodyweight, no weight, "plus 25"
  - just the bar, two plates
  - timed and unloaded moves ("plank 1 minute 30 seconds" → 90)
  - "35 pounds each" means per hand
- **Sides:** each arm, each leg, "left arm 10, right arm 9".
- **Names:**
  - skull crushers, bench, incline vs. incline curls, RDL / R.D.L., pull-ups, chin ups, curls, overhead extension, deadlift → RDL
  - misheard "basian" / "Beijing" curls
  - candidate preference (arms day, Upper B's paused bench)
  - ambiguous "curls" with alternatives; current exercise wins ties
  - "dumbbells" isn't a name; unknown "leg press" lowers confidence
- **Corrections:** "no wait, 9 reps", "sorry, 9", "no wait 145", "make that 9", "actually 9 reps", "no 9 reps", weight inside sets × reps, exercise corrections.
- **Speech-to-text quirks:** "for sets", "to sets", "a reps", "did ate", "135 4 8", "set to 10", "a set of 10 … for bench".
- **Several exercises:** names first, names last, sentence by sentence.
- **Confidence:** high for a clean phrase; low for "the weather is nice today" and for a name with no sets; RPE ignored.
- **`toSetDrafts`:**
  - fills open rows and skips logged ones
  - flags extra sets
  - "third set" goes to row 3 and flags an overwrite
  - left/right merge into one row
  - fallback to the row's target weight

### Known gaps

- **Rep ranges** ("8 to 10 reps") take the 10. The 8 is left over and confidence drops.
- **Two bare small numbers with no cue** ("25 12") read as two sets of 25 and 12 reps, at medium confidence. Any cue ("25 for 12", "12 at 25", "25 x 12") reads correctly.
- **Exercises not in `EXERCISES`** (e.g. leg press) can't be matched. The set goes to the current exercise with low confidence and a note. New exercises need a synonym entry if their shorthand differs from the name.
- **Gym hundreds** ("one twelve") can misfire outside set contexts: "did one twelve" becomes 112 lb with no reps, so nothing is logged. In "set one twelve" it reads correctly as set 1, 12 reps.
- **kg conversions** are rounded to 0.1 lb, not snapped to the equipment's increment (20 kg → 44.1 lb).
- **Sides.** `SetLog` has no side field, so `toSetDrafts` merges a left/right pair into one row with the lower reps. The split is kept only in `note`.
- **Language.** English only. Pounds are the default unit.
- **Misheard names.** Only near-misses (one or two letters) and a few known ones ("Beijing curls") are covered. Real transcripts are needed to tune this (see below).
- **Confidence** is a heuristic score, not a calibrated probability.
- **Supersets.** Each exercise must be named. "then" or a full stop between exercises helps.
- **Not parsed:** "same as last time" (it still falls back to `lastWeight`), tempo, RIR/RPE (dropped), drop-set wording.

---

## 3. Adding it to the workout screen

No existing files were changed for this work. Below is the plan for `src/screens/Workout.tsx`; it doesn't touch `src/core/store.ts`.

### Where the mic button goes

- **A floating round mic button**, bottom trailing, above the tab bar. Use the same `Glass` surface and bottom offset as `RestTimer` (`bottom: calc(var(--tabbar-bottom) + 4px)`). That's the thumb zone during a workout, and you dictate right after a set.
- **While the rest timer is showing**, put the mic inside the timer's pill, before "+30s", so the two don't stack.
- **Hide it** when the session is finished (`session.finishedAt`).
- **Optional:** a small mic icon in each exercise's header row (next to "Rest 1.5 min"). It opens the same sheet with that exercise as `currentExerciseId`, which removes any doubt about which exercise you mean.
- **Not recommended:** the navigation bar beside "Finish". It's simpler but hard to reach one-handed.

### Opening the sheet so the keyboard comes up

- iOS only shows the keyboard when `focus()` runs inside the tap handler. Keep the text field mounted, call `setVoiceOpen(true)` and `textareaRef.current?.focus()` in the same `onClick`, and check this on a device.
- Use a plain `<textarea>`:
  - text keyboard, not `inputMode="decimal"`, because the number pad has no dictation key
  - `enterKeyHint="done"`, `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}`
  - not a search field, so dictation stays on-device
- Use **`SheetPage`** (full-height Konsta `Popup` with a navigation bar), not the bottom `GlassSheet`. The keyboard covers the bottom half of the screen, so the field and the preview must sit at the top. The bar should read **Cancel** / "Log by Voice" / **Save** (bold), like iOS's own modal editors. Today `SheetPage` only has a close button. Either add a `left`/`right` prop to it or build the sheet from `Popup` + `Page` + `Header` in the screen.
- Hint text under the field: "Tap the mic on the keyboard and say what you did, e.g. "3 sets of 10 at 135"."

### Building the context and parsing live

Parse on every `input` event. Dictation inserts words as you speak, so the preview fills in live.

```ts
// Sketch, inside WorkoutScreen.
const isLogged = (id: string, i: number) => byKey.has(`${id}:${i}`);
const unfinished = plan.exercises.filter((e) => e.sets.some((_, i) => !isLogged(e.exerciseId, i)));
const candidates = [...unfinished, ...plan.exercises.filter((e) => !unfinished.includes(e))].map((e) => e.exerciseId);
const currentExerciseId = tappedExerciseId ?? unfinished[0]?.exerciseId;
const lastWeights: Record<string, number> = {};
for (const s of [...logged].sort((a, b) => a.completedAt - b.completedAt)) lastWeights[s.exerciseId] = s.weight;

const parsed = parseWorkoutSpeech(text, {
  exercises: EXERCISES, candidates, currentExerciseId, lastWeights, barWeight: settings.barWeight,
});
```

### Turning parsed sets into rows (`logSet`)

`logSet` in `src/core/store.ts` takes `{ sessionId, date, exerciseId, setIndex, weight, reps, targetWeight, targetReps }`. It upserts by `(sessionId, exerciseId, setIndex)`, so saving the same row again overwrites it. Map each group with `toSetDrafts`:

```ts
const drafts = parsed.groups.flatMap((g) => {
  const ex = plan.exercises.find((e) => e.exerciseId === g.exerciseId);
  if (!ex) return []; // show the group as "Not in this workout" (see below)
  const done = ex.sets.flatMap((_, i) => (isLogged(ex.exerciseId, i) ? [i] : []));
  return toSetDrafts(g, { totalSets: ex.sets.length, logged: done, fallbackWeight: (i) => ex.sets[i]?.weight });
});

// On Save (only rows that exist on screen):
for (const d of drafts.filter((d) => !d.extra)) {
  const t = plan.exercises.find((e) => e.exerciseId === d.exerciseId)!.sets[d.setIndex];
  await logSet({ sessionId, date: session.date, exerciseId: d.exerciseId, setIndex: d.setIndex,
                 weight: d.weight, reps: Math.round(d.reps), targetWeight: t.weight, targetReps: t.reps }, db);
}
```

What each draft field means for the sheet and the save:
- **Rows.** "third set" goes to row 3. Other sets fill the first open rows in order.
- **`replaces`:** the row was already logged. Show "Replaces 135 × 6" in the sheet.
- **`extra`:** there's no row for it, because the screen only draws the planned sets. Show it dimmed ("Only 3 sets planned") and don't save it.
- **`weightGuessed`:** the weight came from the last set or the row's target. Show it in the secondary label color with "(last)" or "(target)".
- **Unloaded moves** already come back as `weight: 0`, matching `SetRow`'s `noLoad` rule.
- **`note`** on a left/right pair: show "Left 10, right 9" under the row. `SetLog` has nowhere to store it.
- **After saving:**
  - `SetRow` refreshes by itself, because `byKey` comes from `useLiveQuery` and its effect syncs the fields from `props.logged`
  - start the rest timer for the last exercise logged, as `onLog` does: `setRestEnds(Date.now() + ex.restSec * 1000)`
  - show a toast like "Logged 3 sets · Leaning single-arm overhead extension"
- **A group whose exercise isn't in today's plan** (`plan.exercises` doesn't contain it) has no rows to fill. Show its header with "Not in this workout" and let the user tap it to pick one of today's exercises. That's a native action sheet with the `candidates` in order, which re-runs `toSetDrafts` with the chosen id.

### The confirm sheet

The layout follows iOS's grouped-list style, top to bottom:

1. **Text field**, about three lines, editable. Re-dictating or typing re-parses it.
2. **One inset grouped list per group:**
   - **Header:** the exercise name, which can be tapped to change it. If `alternatives` is non-empty, show "Did you mean" chips below it.
   - **Rows:** "Set 2 — 135 lb × 8", with a trailing detail like "Replaces 135 × 6", "(last)", "each side" or "No row". Tapping a row edits weight and reps with the existing `NumField`/`NumberPrompt` pattern.
3. **Footer** in small secondary text: `notes` ("Converted 20 kg to 44.1 lb.") and, if any, "Ignored: weather, nice" from `unmatched`.
4. **A "Paste from Shortcut" row** (fallback path, below).

Never save without this sheet, even at high confidence. The Save button is the confirmation.

### Low confidence

Use `parsed.confidence` (lowest of the groups) and each group's own value:

| Confidence | Behaviour |
|---|---|
| **0.8 and up** | Save enabled. Normal display. |
| **0.55–0.8** | Save enabled, with the uncertain parts highlighted: guessed weights, an exercise with `alternatives` or `exerciseSource: 'current'`, and rows with `replaces`. Show the alternatives as chips. |
| **Below 0.55, or no sets, or no exercise** | Save disabled until the user fixes it. Show "Couldn't tell what to log. Try "3 sets of 10 at 135"." under the field and keep the field focused to dictate again. If `exerciseSource` is `'none'`, show the exercise picker straight away. |

Also:
- If `notes` include "Didn't recognise …", show it as the first footer line, so a mis-heard name never silently lands on the wrong exercise.
- Optionally keep the last ~50 transcripts and what was finally saved in `localStorage` (no schema change). This gives a real test set for tuning `SYNONYMS` and the number rules. Turn them into cases in `voice.test.ts`.

### Shortcut fallback

- Add `scripts/make-lift-shortcut.py`, modelled on `make-sleep-shortcut.py`. Its actions:
  1. *Dictate Text*, Stop Listening = After Pause. The action identifier is likely `is.workflow.actions.dictatetext`. Confirm it by exporting a hand-made shortcut and reading its plist.
  2. *Text*: `ZORO-LIFT` + newline + Dictated Text.
  3. *Copy to Clipboard*.
  4. *Show Notification*: "Lift copied. Go back to Zoro and tap Paste."
- Write the result to `public/ZoroLift.shortcut`. `vite.config.ts` already excludes `*.shortcut` from the navigation fallback.
- Install it with the same share-sheet flow as `InstallShortcutDialog` in `LogSleep.tsx`.
- In the voice sheet, add **Paste from Shortcut**: call `navigator.clipboard.readText()`, strip a leading `ZORO-LIFT`, put the text in the field, and parse it. If the clipboard read throws, fall back to a plain paste target, like the sleep screen does.
- Users can bind it to the Action button or say "Hey Siri, Zoro Lift".

### Check on a device before building the UI

1. In the installed Home Screen app on iOS 26 and 27: a focused `<textarea>` in a Konsta `Popup` shows the keyboard's microphone key, and `focus()` from the mic button's tap brings the keyboard up.
2. Dictation works in Airplane Mode (on-device).
3. How dictation writes these, and whether the parser gets them right:
   - "three sets of ten" (digits?), "one thirty five" (135 or 1:35?), "pounds" (lb?)
   - "R D L", "Bayesian", "skull crushers"
   - Add any surprises to `voice.test.ts`.
4. Dictation keeps going through short pauses between "first set…" and "second set…".
5. The Shortcut round trip: run, notification, return, Paste prompt, then the parse.

---

## Sources

- WebKit: [Safari 14.1 features](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1) · [Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- WebKit bugs: [225298 (not in Home Screen apps)](https://bugs.webkit.org/show_bug.cgi?id=225298) · [321436 (iOS 27: only first session works)](https://bugs.webkit.org/show_bug.cgi?id=321436) · [327237 (Home Screen apps re-prompt for mic)](https://bugs.webkit.org/show_bug.cgi?id=327237)
- [Firtman: iOS 14.5 for PWAs](https://firt.dev/ios-14.5/) · [caniuse: Speech Recognition](https://caniuse.com/speech-recognition) · [whatpwacando.today: Speech Recognition](https://whatpwacando.today/speech-recognition)
- [qryptchat PR #323 (Home Screen `service-not-allowed`, Oct 2026)](https://github.com/profullstack/qryptchat-web/pull/323) · [Apple forums: interimResults on iOS](https://developer.apple.com/forums/thread/775699)
- Apple: [Dictate text on iPhone](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios)
- Shortcuts: [Dictate Text action reference](https://www.matthewcassinelli.com/actions/dictate-text/) · [Apple Community: On Tap option](https://discussions.apple.com/thread/255582634)
- Whisper:
  - [whisper-tiny.en ONNX files](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main/onnx) · [ferretry PR #745 (tiny/base timings)](https://github.com/kirinnee/ferretry/pull/745) · [Quietscribe: what broke](https://dev.to/quietscribe/i-built-a-free-whisper-transcription-site-that-runs-in-the-browser-5-things-that-broke-59o6)
  - [transformers.js #1242](https://github.com/huggingface/transformers.js/issues/1242) · [#1298](https://github.com/huggingface/transformers.js/issues/1298) · [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu) · [whisper.cpp whisper.wasm](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm)
- WebGPU: [web.dev: supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers) · [gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- GitHub Pages: [COOP/COEP headers discussion](https://github.com/orgs/community/discussions/13309)
- Hosted options: [Groq rate limits](https://console.groq.com/docs/rate-limits) · [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Picovoice: iOS speech recognition in 2026](https://picovoice.ai/blog/ios-speech-recognition/)
