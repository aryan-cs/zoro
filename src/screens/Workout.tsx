import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { EXERCISES, TEMPLATES } from '../core/program';
import type { WorkoutPlan } from '../core/progression';
import { buildPlan, deleteSession, finishSession, logSet, unlogSet } from '../core/store';
import type { ExercisePlan, SetLog, SetTarget, WorkoutSession } from '../core/types';
import { Bar, Btn, db, FITNESS, FitText, fmtLb, Header, NumberPrompt, NumField, Row, Section, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';

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
  const done = !!props.logged;
  const weight = props.logged?.weight ?? edit.w ?? props.target.weight ?? props.fallbackWeight;
  const reps = props.logged?.reps ?? edit.r ?? props.target.reps;
  const repUnit = def.timed ? 'sec' : def.perSide ? 'each' : 'reps';

  const log = (w: number | undefined, r: number) => props.onLog(noLoad ? 0 : (w ?? 0), r);
  const toggle = () => {
    if (done) return props.onUnlog();
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
      className={`step-card ${done ? 'is-done' : ''} ${props.current ? 'is-current' : ''}`}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('.step-check')) return;
        hold.current = { x: e.clientX, y: e.clientY, fired: false };
        hold.current.timer = window.setTimeout(() => {
          hold.current.fired = true;
          setPrompt('both');
        }, 450);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) window.clearTimeout(hold.current.timer);
      }}
      onPointerUp={() => window.clearTimeout(hold.current.timer)}
      onPointerCancel={() => window.clearTimeout(hold.current.timer)}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (!hold.current.fired) return;
        e.stopPropagation();
        hold.current.fired = false;
      }}
    >
      <div className="step-head">
        <h3 className="step-title">
          {/* Always one line: a long name steps down in size instead of wrapping. */}
          <FitText className="step-title-fit" min={12}>
            {props.ex.name}
          </FitText>
        </h3>
        <button type="button" className={`step-check ${done ? 'is-done' : ''}`} onClick={toggle} aria-label={`${done ? 'Undo' : 'Log'} ${def.name}`}>
          {done && <Sym name="checkmark" size={15} />}
        </button>
      </div>
      <div className="step-presc">
        {!noLoad && (
          <>
            <button type="button" className="step-num" onClick={() => setPrompt('w')} aria-label="Change weight">
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
        <button type="button" className="step-num" onClick={() => setPrompt('r')} aria-label={`Change ${repUnit}`}>
          {reps}
          <small>{def.timed ? 'SEC' : def.perSide ? 'REPS EACH' : 'REPS'}</small>
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
        unit={def.timed ? 'sec' : 'reps'}
        initial={String(reps)}
        min={1}
        max={def.timed ? 600 : 100}
        onCancel={() => setPrompt(null)}
        onSave={(n) => {
          setPrompt(null);
          change({ r: Math.round(n) });
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
    const top = page.scrollTop + el.getBoundingClientRect().top - bar - 12;
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

export function WorkoutScreen({ sessionId }: { sessionId: number }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]) as WorkoutSession | undefined;
  const logged = useLiveQuery(() => db.sets.where({ sessionId }).toArray(), [sessionId]) ?? [];
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  // The rest running now: which set it follows, and when it ends. Saved for the session, so
  // leaving the workout and coming back picks the countdown up where it should be.
  const restKey = `zoro.rest.${sessionId}`;
  const [rest, setRestState] = useState<{ after: string; endsAt: number; startedAt?: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(restKey) ?? 'null');
    } catch {
      return null;
    }
  });
  const setRest = (r: { after: string; endsAt: number; startedAt?: number } | null) => {
    setRestState(r);
    try {
      if (r) localStorage.setItem(restKey, JSON.stringify(r));
      else localStorage.removeItem(restKey);
    } catch {
      /* kept until the screen closes */
    }
  };
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!session) return;
    // Targets come from history before this session, so logging sets here doesn't move them.
    void buildPlan(session.templateId, session.date, db, sessionId).then(setPlan);
  }, [session?.templateId, session?.date, sessionId, settings.daysPerWeek]);

  const finished = !!session?.finishedAt;
  // The step you're on (a running rest, else the next set): kept at the top of the screen, just
  // under the title, so ticking a set off moves the workout along under your thumb.
  const activeStep = useRef('');
  const scrolledOnce = useRef(false);
  const restChecked = useRef(false);
  useWakeLock(!!session && !finished);

  const byKey = useMemo(() => {
    const m = new Map<string, SetLog>();
    for (const s of logged) m.set(`${s.exerciseId}:${s.setIndex}`, s);
    return m;
  }, [logged]);

  if (!session || !plan) return <Page />;

  const totalSets = plan.exercises.reduce((n, e) => n + e.sets.length, 0);

  // The steps in order. Exercises sharing a superset label go round by round (A1, A2, rest);
  // others set by set (set, rest). No rest after the workout's last set.
  type SetStepT = { kind: 'set'; ex: ExercisePlan; i: number; restAfter?: number };
  type RestStepT = { kind: 'rest'; sec: number; after: string; next?: string };
  const steps: (SetStepT | RestStepT)[] = [];
  const groups: ExercisePlan[][] = [];
  for (const ex of plan.exercises) {
    const g = groups[groups.length - 1];
    if (ex.superset && g && g[0].superset === ex.superset) g.push(ex);
    else groups.push([ex]);
  }
  for (const g of groups) {
    const rounds = Math.max(...g.map((e) => e.sets.length));
    for (let r = 0; r < rounds; r++) {
      const inRound = g.filter((e) => r < e.sets.length);
      inRound.forEach((ex) => steps.push({ kind: 'set', ex, i: r }));
      const sec = inRound[inRound.length - 1].restSec;
      if (sec > 0) {
        const last = steps[steps.length - 1] as SetStepT;
        last.restAfter = sec;
        steps.push({ kind: 'rest', sec, after: `${last.ex.exerciseId}:${last.i}` });
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
  // The next set to do: the first one not yet logged.
  const firstOpen = steps.find((x) => x.kind === 'set' && !byKey.get(`${x.ex.exerciseId}:${x.i}`)) as SetStepT | undefined;
  const currentKey = firstOpen ? `${firstOpen.ex.exerciseId}:${firstOpen.i}` : '';
  activeStep.current = rest ? `r${rest.after}` : currentKey ? `s${currentKey}` : '';
  const doneSets = logged.length;

  const finish = async () => {
    setRest(null);
    await finishSession(sessionId, db);
    toast('Workout saved');
    nav.pop();
  };
  const discard = async () => {
    setRest(null);
    await deleteSession(sessionId, db);
    setConfirmDiscard(false);
    nav.pop();
  };

  return (
    <Page className="tab-safe has-dock">
      <Header
        title={TEMPLATES[session.templateId].name}
        onBack={nav.pop}
      />

      {/* How far through the workout (sets done of all of them): a glass bar held just above the
          tab bar, like a toolbar, with nothing but the bar in it. */}
      <div className="wk-progress-dock ios-glass" role="progressbar" aria-label="Sets done" aria-valuemin={0} aria-valuemax={totalSets} aria-valuenow={doneSets}>
        <Bar value={doneSets} target={totalSets} color={FITNESS.exercise} />
      </div>
      {plan.deload && (
        <Section>
          <Row title="Easy Week" />
        </Section>
      )}

      {plan.newBenchMax && (
        <div className="surface mx-4 mt-3 rounded-3xl px-4 py-2.5 text-[15px]">
          Bench block max: <b>{plan.newBenchMax} lb</b>
        </div>
      )}

      {/* The workout as steps, in the order you do them: each set, then the rest after it.
          Supersets alternate their exercises set by set, resting after each round. */}
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
              target={t}
              ex={ex}
              current={key === currentKey}
              logged={byKey.get(key)}
              fallbackWeight={i > 0 ? byKey.get(`${ex.exerciseId}:${i - 1}`)?.weight || undefined : undefined}
              onLog={(weight, reps) => {
                void logSet({ sessionId, date: session.date, exerciseId: ex.exerciseId, setIndex: i, weight, reps, targetWeight: t.weight, targetReps: t.reps }, db);
                if (step.restAfter && !byKey.get(key)) setRest({ after: key, startedAt: Date.now(), endsAt: Date.now() + step.restAfter * 1000 });
              }}
              onUnlog={() => void unlogSet(sessionId, ex.exerciseId, i, db)}
            />
          );
        })}
      </div>

      <div className="mx-4 mt-6 space-y-2">
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
      </div>


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

