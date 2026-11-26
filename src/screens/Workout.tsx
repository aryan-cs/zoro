import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useEffect, useMemo, useState } from 'react';
import { platesPerSide } from '../core/calc';
import { EXERCISES, TEMPLATES } from '../core/program';
import type { WorkoutPlan } from '../core/progression';
import { buildPlan, deleteSession, finishSession, logSet, unlogSet } from '../core/store';
import type { ExercisePlan, SetLog, SetTarget, WorkoutSession } from '../core/types';
import { Bar, Btn, db, dim, FITNESS, fmtLb, Header, NumField, Row, Section, useSettings, useToast } from '../ui/kit';
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
 * One set, as a step in the workout: the exercise, which set and its target, then the weight and
 * reps you did and a circle to tick it off. Notes for the exercise (plates, a starting weight,
 * last time) sit under its first set.
 */
function SetStep(props: {
  index: number;
  of: number;
  target: SetTarget;
  ex: ExercisePlan;
  logged?: SetLog;
  current: boolean;
  /** Weight used on the previous set, to prefill when there's no target yet. */
  fallbackWeight?: number;
  notes?: string[];
  onLog: (weight: number, reps: number) => void;
  onUnlog: () => void;
}) {
  const def = EXERCISES[props.ex.exerciseId];
  const noLoad = (def.kind === 'bodyweight' && !def.addedLoad) || def.timed || def.increment === 0;
  const [weight, setWeight] = useState(String(props.logged?.weight ?? props.target.weight ?? ''));
  const [reps, setReps] = useState(String(props.logged?.reps ?? props.target.reps));
  useEffect(() => {
    if (props.logged) {
      setWeight(String(props.logged.weight));
      setReps(String(props.logged.reps));
    }
  }, [props.logged]);
  useEffect(() => {
    if (!props.logged && props.fallbackWeight !== undefined) setWeight((w) => w || String(props.fallbackWeight));
  }, [props.fallbackWeight, props.logged]);
  const done = !!props.logged;
  const repsLabel = def.timed ? 'sec' : def.perSide ? 'each' : 'reps';
  const target = `${def.timed ? `${props.target.reps}s` : `${props.target.reps}${props.target.repMax && props.target.repMax > props.target.reps ? `–${props.target.repMax}` : ''} ${repsLabel}`}${
    props.target.weight ? ` @ ${fmtLb(props.target.weight)} lb` : ''
  }`;
  const toggle = () => {
    if (done) return props.onUnlog();
    const w = noLoad ? 0 : parseFloat(weight || '0');
    const r = parseFloat(reps || '0');
    if (!Number.isFinite(r) || r <= 0) return;
    props.onLog(Number.isFinite(w) ? w : 0, Math.round(r));
  };

  return (
    <section className={`step-card ${done ? 'is-done' : ''} ${props.current ? 'is-current' : ''}`}>
      <div className="step-head">
        <div className="min-w-0">
          <h3 className="step-title">{props.ex.name}</h3>
          <div className="step-sub">
            {props.ex.superset ? `Superset ${props.ex.superset} · ` : ''}
            {props.target.label ?? `Set ${props.index + 1} of ${props.of}`} · {target}
          </div>
        </div>
        <button type="button" className={`step-check ${done ? 'is-done' : ''}`} onClick={toggle} aria-label={`${done ? 'Undo' : 'Log'} ${def.name}, set ${props.index + 1}`}>
          {done && <Sym name="checkmark" size={15} />}
        </button>
      </div>
      <div className="step-inputs">
        {noLoad ? (
          <span className={`text-[15px] ${dim}`}>{def.timed ? 'Hold for' : 'Body weight'}</span>
        ) : (
          <>
            <NumField value={weight} onChange={setWeight} label="Weight" disabled={done} placeholder="lb" width="w-20" />
            <span className={`text-[15px] ${dim}`}>{def.addedLoad ? '+ lb  ×' : 'lb  ×'}</span>
          </>
        )}
        <NumField value={reps} onChange={setReps} width="w-16" label={repsLabel} disabled={done} />
        <span className={`text-[15px] ${dim}`}>{repsLabel}</span>
      </div>
      {props.notes && props.notes.length > 0 && (
        <div className="step-notes">
          {props.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A rest between sets, as a step: how long, and once the set before it is ticked off, a countdown
 * you can stretch or skip. It reads as done once the rest is over or you've moved on.
 */
function RestStep({ sec, state, endsAt, onAdd, onSkip }: { sec: number; state: 'waiting' | 'running' | 'done'; endsAt?: number; onAdd: () => void; onSkip: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state !== 'running') return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [state]);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : sec;
  const label = sec >= 60 ? `${Math.round((sec / 60) * 2) / 2} min` : `${sec} sec`;
  return (
    <section className={`step-card is-rest ${state === 'done' ? 'is-done' : ''} ${state === 'running' ? 'is-current' : ''}`}>
      <Sym name="timer" size={17} />
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
  // The rest running now: which set it follows, and when it ends.
  const [rest, setRest] = useState<{ after: string; endsAt: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!session) return;
    // Targets come from history before this session, so logging sets here doesn't move them.
    void buildPlan(session.templateId, session.date, db, sessionId).then(setPlan);
  }, [session?.templateId, session?.date, sessionId, settings.daysPerWeek]);

  const finished = !!session?.finishedAt;
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
  // The next set to do: the first one not yet logged.
  const firstOpen = steps.find((x) => x.kind === 'set' && !byKey.get(`${x.ex.exerciseId}:${x.i}`)) as SetStepT | undefined;
  const currentKey = firstOpen ? `${firstOpen.ex.exerciseId}:${firstOpen.i}` : '';
  // Notes for an exercise, shown with its first set: plates to load, a starting weight, last time.
  const notesFor = (ex: ExercisePlan) => {
    const def = EXERCISES[ex.exerciseId];
    const top = ex.sets.reduce((m, x) => Math.max(m, x.weight ?? 0), 0);
    const plates = def.kind === 'barbell' && top > settings.barWeight ? platesPerSide(top, settings.barWeight, settings.plates) : null;
    const out: string[] = [];
    if (plates && plates.plates.length) out.push(`${fmtLb(top)} lb = ${plates.plates.join(' + ')} per side${plates.leftover > 0 ? ` (+${plates.leftover} lb short)` : ''}`);
    for (const note of ex.notes.filter((n) => /^(First time:|Only go for|Light week, then test\.)/.test(n)))
      out.push(
        note
          .replace('First time: pick a weight you could do about ', 'Start with a weight you could lift ')
          .replace('Only go for the top single if last week’s single moved fast.', 'Top single only if last week’s single moved fast.')
          .replace('Light week, then test. Warm up: bar ×10, then build up in 3–4 sets.', 'Before testing: bar ×10, then 3–4 warm-up sets.'),
      );
    if (ex.last) out.push(`Last time (${ex.last.date.slice(5).replace('-', '/')}): ${ex.last.sets.map((x) => (x.weight ? `${fmtLb(x.weight)}×${x.reps}` : `${x.reps}`)).join(', ')}`);
    return out;
  };
  const doneSets = logged.length;

  const finish = async () => {
    await finishSession(sessionId, db);
    toast('Workout saved');
    nav.pop();
  };
  const discard = async () => {
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
        {steps.map((step) => {
          if (step.kind === 'rest') {
            const before = byKey.get(step.after);
            const next = step.next ? byKey.get(step.next) : undefined;
            const state = rest?.after === step.after ? 'running' : before && (next || !rest) ? 'done' : 'waiting';
            return (
              <RestStep
                key={`r${step.after}`}
                sec={step.sec}
                state={state}
                endsAt={rest?.after === step.after ? rest.endsAt : undefined}
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
              index={i}
              of={ex.sets.length}
              target={t}
              ex={ex}
              current={key === currentKey}
              logged={byKey.get(key)}
              notes={i === 0 ? notesFor(ex) : undefined}
              fallbackWeight={i > 0 ? byKey.get(`${ex.exerciseId}:${i - 1}`)?.weight || undefined : undefined}
              onLog={(weight, reps) => {
                void logSet({ sessionId, date: session.date, exerciseId: ex.exerciseId, setIndex: i, weight, reps, targetWeight: t.weight, targetReps: t.reps }, db);
                if (step.restAfter) setRest({ after: key, endsAt: Date.now() + step.restAfter * 1000 });
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

