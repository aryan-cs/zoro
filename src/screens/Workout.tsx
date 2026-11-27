import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { warmVideos } from '../core/guide';
import { EXERCISES, TEMPLATES } from '../core/program';
import type { WorkoutPlan } from '../core/progression';
import { nextSet } from '../core/nextSet';
import { parseSaid } from '../core/sayParse';
import { addExerciseToSession, buildPlan, deleteSession, finishSession, logSet, removeExtraExercise, unlogSet } from '../core/store';
import { ExercisePicker } from '../ui/ExercisePicker';
import type { ExercisePlan, ISODate, SetLog, SetTarget, TemplateId, WorkoutSession } from '../core/types';
import { Bar, Btn, db, FitText, fmtLb, Header, IconBtn, NumberPrompt, NumField, Row, Section, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useListen } from '../ui/listen';
import { restKey } from '../ui/workouts';
import { cancelRestPush, scheduleRestPush } from '../ui/restPush';
import { SNAPPY, project, rubberBand, springEasing } from '../ui/motion';

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        // Not allowed right now (e.g. low battery); the screen just sleeps normally.
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

/**
 * One set, as a step in the workout: the exercise and exactly what to do (135 lb × 6), and a
 * circle to tick it off. Ticking logs what it says; tap the weight or the reps first if you did
 * something else. A weight it doesn't know yet (an exercise's first time) asks to be picked.
 */
function SetStep(props: {
  target: SetTarget;
  ex: ExercisePlan;
  logged?: SetLog;
  current: boolean;
  /** Which step this is, so the screen can scroll to it. */
  stepId: string;
  /** Which of the exercise's sets this is (0-based). */
  index: number;
  /** The exercise's final set (its how-to says to take this one to failure, if that's the plan). */
  last: boolean;
  /** A timed set (a plank) counting down: when it started and when it ends. */
  clock?: { startedAt: number; endsAt: number } | null;
  /** Start a timed set's countdown (ticking a timed set starts it instead of logging it). */
  onStartClock?: () => void;
  /** Only to look at (a day still to come): no circle to tick, nothing to change. */
  readOnly?: boolean;
  /** Weight used on the previous set, when there's no target yet. */
  fallbackWeight?: number;
  onLog: (weight: number, reps: number) => void;
  onUnlog: () => void;
}) {
  const def = EXERCISES[props.ex.exerciseId];
  const noLoad = (def.kind === 'bodyweight' && !def.addedLoad) || def.timed || def.increment === 0;
  const [edit, setEdit] = useState<{ w?: number; r?: number }>({});
  const [prompt, setPrompt] = useState<'w' | 'r' | 'both' | null>(null);
  // Touch and hold the set to change what you did (more or less than it said).
  const hold = useRef<{ timer?: number; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false });
  // Swipe it to the left to see how to do the exercise: the set follows your finger, and letting
  // go far enough (or with a flick) opens the exercise's screen as the set slides back.
  const nav = useNav();
  const card = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number; mode: 'undecided' | 'swipe' | 'off'; off: number; v: number; t: number; lx: number } | null>(null);
  const swallow = useRef(0);
  /** Back to rest from `from` px, carrying on at the finger's speed `v` (px per ms) at first. */
  const settle = (from: number, v: number) => {
    const el = card.current;
    if (!el) return;
    el.style.transform = '';
    if (Math.abs(from) < 0.5) return;
    const { ms, easing } = springEasing(SNAPPY, Math.max(-40, Math.min(40, (-v * 1000) / from)));
    el.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: ms, easing });
  };
  const endSwipe = (open: boolean, at: number) => {
    const sw = swipe.current;
    swipe.current = null;
    if (sw?.mode !== 'swipe') return;
    swallow.current = performance.now() + 400; // the click that ends a swipe isn't a tap
    // A finger that had stopped before lifting isn't flicking.
    const v = at - sw.t < 80 ? sw.v : 0;
    settle(sw.off, v);
    // Where the set would coast to decides: most of the way out (70pt), and it opens.
    if (open && sw.off < -24 && sw.off + project(v) < -70) nav.push({ name: 'exercise', exerciseId: def.id, lastSet: props.last });
  };
  const done = !!props.logged;
  // A timed set counting down: the seconds left take the place of the target, the card fills
  // behind it like a rest, and at zero it logs itself (tick it before then to stop early).
  const running = !!props.clock && !done;
  const [now, setNow] = useState(Date.now());
  const finishClock = useRef<() => void>(() => {});
  const fired = useRef(0);
  const endsAt = props.clock?.endsAt;
  useEffect(() => {
    if (!running || !endsAt) return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= endsAt && fired.current !== endsAt) {
        fired.current = endsAt;
        finishClock.current();
      }
    };
    tick();
    const t = window.setInterval(tick, 200);
    return () => window.clearInterval(t);
  }, [running, endsAt]);
  const weight = props.logged?.weight ?? edit.w ?? props.target.weight ?? props.fallbackWeight;
  const reps = props.logged?.reps ?? edit.r ?? props.target.reps;
  const repUnit = def.timed ? 'sec' : def.perSide ? 'each' : 'reps';
  // Two minutes or more is entered and shown in minutes.
  const inMinutes = !!def.timed && reps >= 120;

  const log = (w: number | undefined, r: number) => props.onLog(noLoad ? 0 : (w ?? 0), r);
  finishClock.current = () => log(weight, reps);
  // A hold done on each side (a side plank, a stretch) runs once per side, back to back.
  const sides = def.timed && def.perSide ? 2 : 1;
  const sideLen = props.clock ? (props.clock.endsAt - props.clock.startedAt) / sides : 0;
  const side = running && props.clock && sides === 2 && now - props.clock.startedAt >= sideLen ? 2 : 1;
  const sideEnd = props.clock ? props.clock.startedAt + sideLen * side : 0;
  const clockLeft = running && props.clock ? Math.max(0, Math.ceil((sideEnd - now) / 1000)) : reps;
  const clockPassed = running && props.clock ? Math.min(1, Math.max(0, (now - props.clock.startedAt) / Math.max(1, props.clock.endsAt - props.clock.startedAt))) : 0;
  const toggle = () => {
    if (done) return props.onUnlog();
    if (props.onStartClock) {
      // Stopped early: log the seconds held.
      if (running && props.clock) return log(weight, Math.max(1, Math.min(reps, Math.round((Date.now() - props.clock.startedAt) / 1000 / sides))));
      return props.onStartClock();
    }
    if (!noLoad && weight === undefined) return setPrompt('w');
    log(weight, reps);
  };
  // A change made after ticking updates what was logged.
  const change = (next: { w?: number; r?: number }) => {
    setEdit((e) => ({ ...e, ...next }));
    if (done) log(next.w ?? weight, next.r ?? reps);
  };

  return (
    <section
      data-step={props.stepId}
      className={`step-card ${done ? 'is-done' : ''} ${props.current ? 'is-current' : ''} ${running ? 'is-timing' : ''}`}
      ref={card}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('.step-check')) return;
        swipe.current = { x: e.clientX, y: e.clientY, mode: 'undecided', off: 0, v: 0, t: e.timeStamp, lx: e.clientX };
        hold.current = { x: e.clientX, y: e.clientY, fired: false };
        if (props.readOnly) return;
        hold.current.timer = window.setTimeout(() => {
          hold.current.fired = true;
          setPrompt('both');
        }, 450);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) window.clearTimeout(hold.current.timer);
        const sw = swipe.current;
        if (!sw || sw.mode === 'off') return;
        if (sw.mode === 'undecided') {
          const dx = e.clientX - sw.x;
          const dy = e.clientY - sw.y;
          if (Math.hypot(dx, dy) < 8) return;
          // Mostly leftward: a swipe. Anything else is a scroll (or the other way, nothing).
          if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            sw.mode = 'swipe';
            sw.x = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
          } else {
            sw.mode = 'off';
            return;
          }
        }
        // With your finger to about 90pt, then giving less and less.
        const d = Math.min(0, e.clientX - sw.x);
        sw.off = d > -90 ? d : -90 + rubberBand(d + 90, 90);
        sw.v = sw.v * 0.4 + ((e.clientX - sw.lx) / Math.max(1, e.timeStamp - sw.t)) * 0.6;
        sw.t = e.timeStamp;
        sw.lx = e.clientX;
        if (card.current) card.current.style.transform = `translateX(${sw.off}px)`;
      }}
      onPointerUp={(e) => {
        window.clearTimeout(hold.current.timer);
        endSwipe(true, e.timeStamp);
      }}
      onPointerCancel={(e) => {
        window.clearTimeout(hold.current.timer);
        endSwipe(false, e.timeStamp);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (!hold.current.fired && performance.now() > swallow.current) return;
        e.stopPropagation();
        hold.current.fired = false;
      }}
    >
      {running && <span className="step-rest-fill" style={{ width: `${clockPassed * 100}%` }} aria-hidden />}
      <div className="step-head">
        <h3 className="step-title">
          {/* Always one line: a long name steps down in size instead of wrapping. */}
          <FitText className="step-title-fit" min={12}>
            {`${props.ex.name}, Set ${props.index + 1} of ${props.ex.sets.length}`}
          </FitText>
        </h3>
        {!props.readOnly && <button
          type="button"
          className={`step-check ${done ? 'is-done' : ''} ${running ? 'is-running' : ''}`}
          onClick={toggle}
          aria-label={`${done ? 'Undo' : running ? 'Stop' : props.onStartClock ? 'Start' : 'Log'} ${def.name}`}
        >
          {done && <Sym name="checkmark" size={13} />}
        </button>}
      </div>
      <div className="step-presc">
        {!noLoad && (
          <>
            <button type="button" className="step-num" onClick={() => !props.readOnly && setPrompt('w')} aria-label="Change weight">
              {weight === undefined ? (
                <span className="step-pick">Pick weight</span>
              ) : (
                <>
                  {fmtLb(weight)}
                  <small>{def.addedLoad ? '+LB' : 'LB'}</small>
                </>
              )}
            </button>
            <span className="step-times">×</span>
          </>
        )}
        <button type="button" className="step-num" onClick={() => !props.readOnly && setPrompt('r')} aria-label={`Change ${repUnit}`}>
          {def.timed ? (
            // A long hold or walk reads in minutes: 20 MIN, then 19 MIN 43 SEC as it counts down.
            // Each side: 45 SEC EACH, then SIDE 1 and SIDE 2 as it counts down.
            durationParts(clockLeft).map(([n, unit], i, all) => (
              <span key={unit} className={`step-dur ${i ? 'is-more' : ''}`}>
                {n}
                <small>{sides === 2 && i === all.length - 1 ? `${unit} ${running ? `· SIDE ${side}` : 'EACH'}` : unit}</small>
              </span>
            ))
          ) : (
            <>
              {clockLeft}
              <small>{def.perSide ? 'REPS EACH' : 'REPS'}</small>
            </>
          )}
        </button>
      </div>
      <SetEdit
        opened={prompt === 'both'}
        title={def.name}
        weight={noLoad ? undefined : weight}
        reps={reps}
        repUnit={repUnit}
        onCancel={() => setPrompt(null)}
        onSave={(w, r) => {
          setPrompt(null);
          change({ w, r });
        }}
      />
      <NumberPrompt
        opened={prompt === 'w'}
        title={def.name}
        unit="lb"
        initial={weight !== undefined ? String(weight) : undefined}
        min={0}
        max={2000}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          setPrompt(null);
          change({ w: n });
        }}
      />
      <NumberPrompt
        opened={prompt === 'r'}
        title={def.name}
        unit={inMinutes ? 'min' : def.timed ? 'sec' : 'reps'}
        initial={String(inMinutes ? Math.round((reps / 60) * 10) / 10 : reps)}
        min={inMinutes ? 0.5 : 1}
        max={inMinutes ? 240 : def.timed ? 600 : 100}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          setPrompt(null);
          change({ r: Math.round(inMinutes ? n * 60 : n) });
        }}
      />
    </section>
  );
}

/** Change a set's weight and reps together (touch and hold a set). */
function SetEdit(props: { opened: boolean; title: string; weight?: number; reps: number; repUnit: string; onCancel: () => void; onSave: (w: number | undefined, r: number) => void }) {
  const [w, setW] = useState('');
  const [r, setR] = useState('');
  useEffect(() => {
    if (!props.opened) return;
    setW(props.weight !== undefined ? String(props.weight) : '');
    setR(String(props.reps));
  }, [props.opened]); // eslint-disable-line react-hooks/exhaustive-deps
  const wn = parseFloat(w);
  const rn = parseFloat(r);
  const valid = Number.isFinite(rn) && rn > 0 && (props.weight === undefined && !w ? true : Number.isFinite(wn) && wn >= 0);
  return (
    <Dialog
      opened={props.opened}
      onBackdropClick={props.onCancel}
      title={props.title}
      content={
        <div className="set-edit">
          {props.weight !== undefined || w ? (
            <label>
              <span>Weight</span>
              <NumField value={w} onChange={setW} label="Weight" width="w-24" placeholder="lb" />
              <span className="set-edit-unit">lb</span>
            </label>
          ) : null}
          <label>
            <span>{props.repUnit === 'sec' ? 'Seconds' : 'Reps'}</span>
            <NumField value={r} onChange={setR} label="Reps" width="w-24" />
            <span className="set-edit-unit">{props.repUnit === 'each' ? 'each' : ''}</span>
          </label>
        </div>
      }
      buttons={
        <>
          <DialogButton onClick={props.onCancel}>Cancel</DialogButton>
          <DialogButton strong disabled={!valid} onClick={() => valid && props.onSave(w ? wn : undefined, Math.round(rn))}>
            Save
          </DialogButton>
        </>
      }
    />
  );
}

/** Scrolls the workout so the active step sits just under the navigation bar. */
function ScrollToActive({ active, first }: { active: string; first: RefObject<boolean> }) {
  // Found from its own spot in the list: a parent's ref isn't attached yet when this first runs.
  const self = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = self.current?.parentElement;
    const page = root?.closest('.k-page');
    const el = active ? root?.querySelector<HTMLElement>(`[data-step="${CSS.escape(active)}"]`) : null;
    if (!page || !el) return;
    const bar = page.querySelector('.ios-navbar')?.getBoundingClientRect().bottom ?? 0;
    // Just clear of the bar's scroll edge (the 24pt fade and blur under it), so the step stays sharp.
    const top = page.scrollTop + el.getBoundingClientRect().top - bar - 24;
    // Opening a workout partway through lands on your step; after that, it glides there.
    page.scrollTo({ top: Math.max(0, top), behavior: first.current ? 'smooth' : 'auto' });
    first.current = true;
  }, [active, first]);
  return <span ref={self} hidden />;
}

/**
 * A rest between sets, as a step: how long, and once the set before it is ticked off, a countdown
 * you can stretch or skip. It reads as done once the rest is over or you've moved on.
 */
function RestStep({ sec, state, endsAt, startedAt, onAdd, onSkip, stepId }: { sec: number; state: 'waiting' | 'running' | 'done'; endsAt?: number; startedAt?: number; onAdd: () => void; onSkip: () => void; stepId: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state !== 'running') return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [state]);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : sec;
  // How much of the rest has passed, for the fill behind it (+30s stretches it back a little).
  const from = startedAt ?? (endsAt ? endsAt - sec * 1000 : now);
  const passed = endsAt ? Math.min(1, Math.max(0, (now - from) / Math.max(1, endsAt - from))) : 0;
  const label = sec >= 60 ? `${Math.round((sec / 60) * 2) / 2} min` : `${sec} sec`;
  return (
    <section data-step={stepId} className={`step-card is-rest ${state === 'done' ? 'is-done' : ''} ${state === 'running' ? 'is-current' : ''}`}>
      <Sym name="timer" size={17} />
      {state === 'running' && <span className="step-rest-fill" style={{ width: `${passed * 100}%` }} aria-hidden />}
      {state === 'running' ? (
        <>
          <span className="step-rest-clock tabular">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Go'}</span>
          <span className="flex-1" />
          <Btn size="sm" onClick={onAdd}>
            +30s
          </Btn>
          <Btn size="sm" onClick={onSkip}>
            {left > 0 ? 'Skip' : 'Done'}
          </Btn>
        </>
      ) : (
        <span className="step-rest-label">Rest {label}</span>
      )}
    </section>
  );
}

export function WorkoutScreen({ sessionId, planned }: { sessionId: number; planned?: { templateId: TemplateId; date: ISODate } }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  // A day still to come has no session yet: its workout is shown as planned for that day.
  const stored = useLiveQuery(() => (planned ? undefined : db.sessions.get(sessionId)), [sessionId, !!planned]) as WorkoutSession | undefined;
  const plannedSession = useMemo(() => (planned ? ({ templateId: planned.templateId, date: planned.date, startedAt: 0 } as WorkoutSession) : undefined), [planned?.templateId, planned?.date]);
  const session = plannedSession ?? stored;
  const logged = useLiveQuery(() => db.sets.where({ sessionId }).toArray(), [sessionId]) ?? [];
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  // The rest running now: which set it follows, and when it ends. Saved for the session, so
  // leaving the workout and coming back picks the countdown up where it should be.
  const restStore = restKey(sessionId);
  const [rest, setRestState] = useState<{ after: string; endsAt: number; startedAt?: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(restStore) ?? 'null');
    } catch {
      return null;
    }
  });
  const setRest = (r: { after: string; endsAt: number; startedAt?: number } | null) => {
    // A rest started or skipped here is the one that counts: don't bring back a skipped one from
    // the last set's time (that's only for rests from before this screen opened).
    restChecked.current = true;
    // Its notification, for when you're in another app as it ends: sent for the new end, or
    // cancelled when the rest is skipped or over early.
    if (r) scheduleRestPush(r.endsAt);
    else if (rest) cancelRestPush();
    setRestState(r);
    try {
      if (r) localStorage.setItem(restStore, JSON.stringify(r));
      else localStorage.removeItem(restStore);
    } catch {
      /* kept until the screen closes */
    }
  };
  // A timed set counting down (which set, when it started and ends), kept the same way, so leaving
  // mid-plank and coming back still has it (and logs it if it ran out meanwhile).
  const clockStore = `zoro.clock.${sessionId}`;
  const [clock, setClockState] = useState<{ key: string; startedAt: number; endsAt: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(clockStore) ?? 'null');
    } catch {
      return null;
    }
  });
  const setClock = (c: { key: string; startedAt: number; endsAt: number } | null) => {
    setClockState(c);
    try {
      if (c) localStorage.setItem(clockStore, JSON.stringify(c));
      else localStorage.removeItem(clockStore);
    } catch {
      /* kept until the screen closes */
    }
  };
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saying, setSaying] = useState(false);
  // Tapping the pencil listens straight away; what you say fills the field as you talk.
  const listen = useListen();
  const [sayText, setSayText] = useState('');

  useEffect(() => {
    if (!session) return;
    // Targets come from history before this session, so logging sets here doesn't move them.
    void buildPlan(session.templateId, session.date, db, sessionId, session.extras).then(setPlan);
  }, [session?.templateId, session?.date, sessionId, settings.daysPerWeek, session?.extras?.join()]);
  // Its exercises' animations, fetched now so swiping to one shows it straight away.
  useEffect(() => {
    if (plan) warmVideos(plan.exercises.map((e) => e.exerciseId));
  }, [plan]);
  // Keep the session's planned set count matching what's shown, so Lift can tell a workout done
  // in full from one left partway.
  useEffect(() => {
    if (!plan || !session || planned || session.finishedAt) return;
    const n = plan.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    if (session.plannedSets !== n) void db.sessions.update(sessionId, { plannedSets: n });
  }, [plan, session, planned, sessionId]);

  const finished = !!session?.finishedAt;
  // The step you're on (a running rest, else the next set): kept at the top of the screen, just
  // under the title, so ticking a set off moves the workout along under your thumb.
  const activeStep = useRef('');
  const scrolledOnce = useRef(false);
  const restChecked = useRef(false);
  useWakeLock(!!session && !finished && !planned);

  const byKey = useMemo(() => {
    const m = new Map<string, SetLog>();
    for (const s of logged) m.set(`${s.exerciseId}:${s.setIndex}`, s);
    return m;
  }, [logged]);

  if (!session || !plan) return <Page />;

  const totalSets = plan.exercises.reduce((n, e) => n + e.sets.length, 0);

  // The steps in order: one exercise at a time, all its sets (each followed by its rest) before the
  // next exercise. Superset labels in the program don't interleave them. No rest after the last set.
  type SetStepT = { kind: 'set'; ex: ExercisePlan; i: number; restAfter?: number };
  type RestStepT = { kind: 'rest'; sec: number; after: string; next?: string };
  const steps: (SetStepT | RestStepT)[] = [];
  for (const ex of plan.exercises) {
    for (let i = 0; i < ex.sets.length; i++) {
      const set: SetStepT = { kind: 'set', ex, i };
      steps.push(set);
      if (ex.restSec > 0) {
        set.restAfter = ex.restSec;
        steps.push({ kind: 'rest', sec: ex.restSec, after: `${ex.exerciseId}:${i}` });
      }
    }
  }
  while (steps.length && steps[steps.length - 1].kind === 'rest') steps.pop();
  // Each rest knows the set after it (it reads as done once that set is logged).
  steps.forEach((st, k) => {
    if (st.kind !== 'rest') return;
    const nxt = steps.slice(k + 1).find((x) => x.kind === 'set') as SetStepT | undefined;
    if (nxt) st.next = `${nxt.ex.exerciseId}:${nxt.i}`;
  });
  // A rest that's over because you've already done the set after it.
  if (rest) {
    const st = steps.find((x) => x.kind === 'rest' && x.after === rest.after) as RestStepT | undefined;
    if (!st || (st.next && byKey.get(st.next))) queueMicrotask(() => setRest(null));
  }
  // No rest saved (logged on another screen, or before this was kept): the rest after the last set
  // you ticked, counted from when you ticked it, if it isn't over and you haven't moved on.
  if (!rest && !restChecked.current && logged.length) {
    restChecked.current = true;
    const last = [...logged].sort((a, b) => b.completedAt - a.completedAt)[0];
    const lastKey = `${last.exerciseId}:${last.setIndex}`;
    const st = steps.find((x) => x.kind === 'rest' && x.after === lastKey) as RestStepT | undefined;
    if (st && !(st.next && byKey.get(st.next)) && last.completedAt + st.sec * 1000 > Date.now()) {
      const r = { after: lastKey, startedAt: last.completedAt, endsAt: last.completedAt + st.sec * 1000 };
      queueMicrotask(() => setRest(r));
    }
  }
  // The next set to do: the next one not yet logged after the set you logged last (the one a
  // running rest follows), coming back around to the top for any you skipped.
  const setSteps = steps.filter((x): x is SetStepT => x.kind === 'set');
  const lastDone = rest?.after ?? (logged.length ? [...logged].sort((a, b) => b.completedAt - a.completedAt).map((x) => `${x.exerciseId}:${x.setIndex}`)[0] : undefined);
  const currentKey = nextSet(setSteps.map((x) => `${x.ex.exerciseId}:${x.i}`), new Set(byKey.keys()), lastDone) ?? '';
  const firstOpen = setSteps.find((x) => `${x.ex.exerciseId}:${x.i}` === currentKey);
  activeStep.current = rest ? `r${rest.after}` : currentKey ? `s${currentKey}` : '';
  const doneSets = logged.length;

  // Say (or type) what you did, "200 on bench for 3": it's logged to that exercise's next sets
  // (the one you're on, if you don't name one), each set's target filling in what you didn't say.
  const logSaid = async (text: string): Promise<boolean> => {
    const fail = (message: string) => {
      toast(message);
      return false;
    };
    const current = firstOpen?.ex.exerciseId ?? plan.exercises[0]?.exerciseId;
    const at = Math.max(0, plan.exercises.findIndex((e) => e.exerciseId === current));
    const ordered = [...plan.exercises.slice(at), ...plan.exercises.slice(0, at)];
    const noLoadOf = (id?: string) => {
      const d = id ? EXERCISES[id] : undefined;
      return !!d && ((d.kind === 'bodyweight' && !d.addedLoad) || !!d.timed || d.increment === 0);
    };
    const said = parseSaid(
      text,
      ordered.map((e) => ({ id: e.exerciseId, name: e.name })),
      Object.values(EXERCISES).map((e) => ({ id: e.id, name: e.name })),
      (id) => noLoadOf(id ?? current),
    );
    if (!said?.sets.length) return fail('Couldn’t tell what you did');
    if (!said.exerciseId && said.elsewhere) return fail(`${EXERCISES[said.elsewhere].name} isn’t in this workout`);
    const ex = plan.exercises.find((e) => e.exerciseId === (said.exerciseId ?? current));
    if (!ex) return fail('Couldn’t tell which exercise');
    const open = ex.sets.map((_, i) => i).filter((i) => !byKey.get(`${ex.exerciseId}:${i}`));
    if (!open.length) return fail(`${ex.name} is done`);
    const noLoad = noLoadOf(ex.exerciseId);
    const done: { i: number; weight: number; reps: number }[] = [];
    let lastWeight = [...logged].filter((x) => x.exerciseId === ex.exerciseId).sort((a, b) => b.setIndex - a.setIndex)[0]?.weight;
    for (const [k, s] of said.sets.slice(0, open.length).entries()) {
      const i = open[k];
      const t = ex.sets[i];
      const weight = noLoad ? (s.weight ?? 0) : (s.weight ?? t.weight ?? lastWeight);
      if (weight === undefined) return fail(`Say the weight for ${ex.name} too`);
      lastWeight = weight;
      const reps = s.reps ?? t.reps;
      done.push({ i, weight, reps });
      await logSet({ sessionId, date: session.date, exerciseId: ex.exerciseId, setIndex: i, weight, reps, targetWeight: t.weight, targetReps: t.reps }, db);
    }
    // The rest after the last set you said, as if you'd ticked it.
    const last = done[done.length - 1];
    const step = steps.find((x) => x.kind === 'set' && x.ex.exerciseId === ex.exerciseId && x.i === last.i) as SetStepT | undefined;
    if (step?.restAfter) setRest({ after: `${ex.exerciseId}:${last.i}`, startedAt: Date.now(), endsAt: Date.now() + step.restAfter * 1000 });
    if (clock && done.some((d) => clock.key === `${ex.exerciseId}:${d.i}`)) setClock(null);
    const what = (d: { weight: number; reps: number }) =>
      EXERCISES[ex.exerciseId].timed ? durationWords(d.reps) : `${noLoad || !d.weight ? '' : `${fmtLb(d.weight)} lb × `}${d.reps}`;
    toast(done.length === 1 ? `${ex.name}, Set ${last.i + 1}: ${what(last)}` : `${ex.name}: ${done.map(what).join(', ')}`);
    return true;
  };
  const closeSay = () => {
    listen.stop();
    setSaying(false);
    setSayText('');
  };
  // Logged: the box closes. Not understood: what you said stays in the field to fix.
  const submitSay = async (text: string) => {
    listen.stop();
    if (!text.trim()) return closeSay();
    if (await logSaid(text)) closeSay();
    else setSayText(text);
  };
  const openSay = () => {
    setSayText('');
    setSaying(true);
    listen.start(setSayText, (heard) => {
      if (heard) void submitSay(heard);
    });
  };

  const finish = async () => {
    setRest(null);
    setClock(null);
    await finishSession(sessionId, db);
    toast('Workout saved');
    nav.pop();
  };
  const discard = async () => {
    setRest(null);
    setClock(null);
    await deleteSession(sessionId, db);
    setConfirmDiscard(false);
    nav.pop();
  };

  return (
    <Page className="tab-safe has-dock">
      <Header
        title={TEMPLATES[session.templateId].name}
        onBack={nav.pop}
        right={
          !planned && (
            <IconBtn label="Say what you did" onClick={openSay}>
              <Sym name="mic.fill" size={19} />
            </IconBtn>
          )
        }
      />
      {planned && (
        <p className="wk-planned-note">
          Planned for {new Date(`${planned.date}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}. Start it on the day to log it.
        </p>
      )}
      <SayPrompt opened={saying} text={sayText} onText={setSayText} listening={listen.listening} onType={listen.stop} onCancel={closeSay} onSave={(t) => void submitSay(t)} />

      {/* How far through the workout (sets done of all of them): a glass bar held just above the
          tab bar, like a toolbar, with nothing but the bar in it. */}
      <div className="wk-progress-dock ios-glass" role="progressbar" aria-label="Sets done" aria-valuemin={0} aria-valuemax={totalSets} aria-valuenow={doneSets}>
        <Bar value={doneSets} target={totalSets} color="#fff" />
      </div>
      {plan.deload && (
        <Section>
          <Row title="Easy Week" />
        </Section>
      )}

      {/* The workout as steps, in the order you do them: each set, then the rest after it, one
          exercise at a time. */}
      <div className="fit-stack step-list">
        <ScrollToActive active={activeStep.current} first={scrolledOnce} />
        {steps.map((step) => {
          if (step.kind === 'rest') {
            const before = byKey.get(step.after);
            const next = step.next ? byKey.get(step.next) : undefined;
            const state = rest?.after === step.after ? 'running' : before && (next || !rest) ? 'done' : 'waiting';
            return (
              <RestStep
                key={`r${step.after}`}
                stepId={`r${step.after}`}
                sec={step.sec}
                state={state}
                endsAt={rest?.after === step.after ? rest.endsAt : undefined}
                startedAt={rest?.after === step.after ? rest.startedAt : undefined}
                onAdd={() => rest && setRest({ ...rest, endsAt: Math.max(rest.endsAt, Date.now()) + 30_000 })}
                onSkip={() => setRest(null)}
              />
            );
          }
          const { ex, i } = step;
          const t = ex.sets[i];
          const key = `${ex.exerciseId}:${i}`;
          return (
            <SetStep
              key={key}
              stepId={`s${key}`}
              index={i}
              last={i === ex.sets.length - 1}
              readOnly={!!planned}
              target={t}
              ex={ex}
              current={key === currentKey}
              logged={byKey.get(key)}
              fallbackWeight={i > 0 ? byKey.get(`${ex.exerciseId}:${i - 1}`)?.weight || undefined : undefined}
              clock={clock?.key === key ? clock : null}
              onStartClock={
                EXERCISES[ex.exerciseId].timed
                  ? () => {
                      setRest(null);
                      // Holds done on each side run twice: one side, then the other.
                      const sides = EXERCISES[ex.exerciseId].perSide ? 2 : 1;
                      setClock({ key, startedAt: Date.now(), endsAt: Date.now() + t.reps * 1000 * sides });
                    }
                  : undefined
              }
              onLog={(weight, reps) => {
                if (clock?.key === key) setClock(null);
                void logSet({ sessionId, date: session.date, exerciseId: ex.exerciseId, setIndex: i, weight, reps, targetWeight: t.weight, targetReps: t.reps }, db);
                if (step.restAfter && !byKey.get(key)) setRest({ after: key, startedAt: Date.now(), endsAt: Date.now() + step.restAfter * 1000 });
              }}
              onUnlog={() => void unlogSet(sessionId, ex.exerciseId, i, db)}
            />
          );
        })}
      </div>

      {!planned && <div className="mx-4 mt-6 space-y-2">
        {/* More exercises than the plan has: done after its own, logged the same way. */}
        <Btn size="lg" onClick={() => setPicking(true)}>
          Add Exercise
        </Btn>
        {!finished ? (
          <>
            <Btn kind="tint" size="lg" onClick={() => void finish()}>
              Finish Workout
            </Btn>
            <Btn kind="danger" size="lg" onClick={() => setConfirmDiscard(true)}>
              Discard Workout
            </Btn>
          </>
        ) : (
          <Btn kind="danger" size="lg" onClick={() => setConfirmDiscard(true)}>
            Delete Workout
          </Btn>
        )}
      </div>}


      <ExercisePicker
        opened={picking}
        onClose={() => setPicking(false)}
        added={session.extras}
        onPick={(id) => {
          setPicking(false);
          if (!session.extras?.includes(id)) return void addExerciseToSession(sessionId, id, db);
          // Picking an added one again takes it back out, unless it has sets logged.
          if (logged.some((x) => x.exerciseId === id)) return toast('It has sets logged');
          void removeExtraExercise(sessionId, id, db);
        }}
      />
      <Dialog
        opened={confirmDiscard}
        title="Delete Workout?"
        content="This will delete all logged sets."
        buttons={
          <>
            <DialogButton onClick={() => setConfirmDiscard(false)}>Cancel</DialogButton>
            <DialogButton strong className="destructive" onClick={() => void discard()}>
              Delete
            </DialogButton>
          </>
        }
      />
    </Page>
  );
}

/**
 * "What did you do?": it listens as soon as it opens (tap the pencil, say "200 on bench for 3")
 * and shows what it hears; tap the field to type instead. Where listening isn't possible, it's
 * a field to type in (or dictate with the keyboard's mic).
 */
function SayPrompt(props: {
  opened: boolean;
  text: string;
  onText: (text: string) => void;
  listening: boolean;
  /** Stop listening: you've tapped the field to type. */
  onType: () => void;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const save = () => {
    const t = props.text.trim();
    if (t) props.onSave(t);
    else props.onCancel();
  };
  return (
    <Dialog
      opened={props.opened}
      title="What Did You Do?"
      content={
        <div className="space-y-3">
          {props.listening ? (
            <div className="say-listening" role="status">
              <span className="say-dot" aria-hidden />
              Listening
            </div>
          ) : (
            <div>Type it, or say it with the keyboard’s mic.</div>
          )}
          <input
            // Focused (keyboard up) only when it isn't listening.
            key={`${props.opened}-${props.listening}`}
            autoFocus={!props.listening}
            value={props.text}
            placeholder={props.listening ? '200 on bench for 3' : '200 lb on bench for 3'}
            enterKeyHint="done"
            onFocus={() => props.listening && props.onType()}
            onChange={(e) => props.onText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className="w-full rounded-xl bg-[rgba(118,118,128,0.24)] px-3 py-2.5 text-[17px] text-white outline-none placeholder:text-[rgba(235,235,245,0.3)]"
          />
        </div>
      }
      buttons={
        <>
          <DialogButton onClick={props.onCancel}>Cancel</DialogButton>
          <DialogButton strong onClick={save}>
            Log
          </DialogButton>
        </>
      }
    />
  );
}

/** A duration as big-number parts: [[20, 'MIN']], [[19, 'MIN'], [43, 'SEC']], [[45, 'SEC']]. */
function durationParts(sec: number): [number, string][] {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (!m) return [[s, 'SEC']];
  return s ? [[m, 'MIN'], [s, 'SEC']] : [[m, 'MIN']];
}

/** The same in words, for notices: "20 minutes", "1 minute 30 seconds", "45 seconds". */
function durationWords(sec: number): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return durationParts(sec)
    .map(([n, u]) => plural(n, u === 'MIN' ? 'minute' : 'second'))
    .join(' ');
}
