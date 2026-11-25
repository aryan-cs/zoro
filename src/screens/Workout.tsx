import { useLiveQuery } from 'dexie-react-hooks';
import { Dialog, DialogButton, Glass, List, Page } from 'konsta/react';
import { Check, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { platesPerSide } from '../core/calc';
import { EXERCISES, TEMPLATES } from '../core/program';
import type { WorkoutPlan } from '../core/progression';
import { buildPlan, deleteSession, finishSession, logSet, unlogSet } from '../core/store';
import type { ExercisePlan, SetLog, SetTarget, WorkoutSession } from '../core/types';
import { Btn, db, dim, fmtLb, Header, NavText, NumField, useSettings, useToast } from '../ui/kit';
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

function RestTimer({ endsAt, onAdd, onSkip }: { endsAt: number; onAdd: () => void; onSkip: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const done = left === 0;
  return (
    <Glass className="fixed inset-x-3 z-30 mx-auto flex max-w-md items-center justify-between rounded-full py-1.5 pl-4 pr-1.5 !touch-auto" style={{ bottom: 'calc(var(--tabbar-bottom) + 64px)' }}>
      <div className="flex items-center gap-2">
        <Timer className={`h-5 w-5 ${done ? 'text-accent' : 'text-accent'}`} />
        <span className="tabular text-[20px] font-semibold">
          {done ? 'Go' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </span>
        <span className={`text-[13px] ${dim}`}>rest</span>
      </div>
      <div className="flex gap-2">
        <Btn size="sm" onClick={onAdd}>
          +30s
        </Btn>
        <Btn size="sm" kind="tint" onClick={onSkip}>
          {done ? 'Close' : 'Skip'}
        </Btn>
      </div>
    </Glass>
  );
}

function SetRow(props: {
  index: number;
  target: SetTarget;
  ex: ExercisePlan;
  logged?: SetLog;
  /** Weight used on the previous set, to prefill when there's no target yet. */
  fallbackWeight?: number;
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
  const targetText = `${def.timed ? `${props.target.reps}s` : `${props.target.reps}${props.target.repMax && props.target.repMax > props.target.reps ? `–${props.target.repMax}` : ''}`}${
    props.target.weight ? ` @ ${fmtLb(props.target.weight)}` : ''
  }`;

  const toggle = () => {
    if (done) return props.onUnlog();
    const w = noLoad ? 0 : parseFloat(weight || '0');
    const r = parseFloat(reps || '0');
    if (!Number.isFinite(r) || r <= 0) return;
    props.onLog(Number.isFinite(w) ? w : 0, Math.round(r));
  };

  return (
    <li className={`relative ${done ? 'bg-accent/10' : ''}`}>
      <div className="hairline-b relative ms-4 flex items-center gap-2 py-1.5 pe-4">
      <div className="w-[76px] shrink-0">
        <div className="text-[15px] font-medium">{props.target.label ?? `Set ${props.index + 1}`}</div>
        <div className="tabular text-[12px] text-black/45 dark:text-white/50">{targetText}</div>
      </div>
      <div className="flex flex-1 items-center justify-end gap-1.5">
        {noLoad ? (
          <span className="w-16 text-center text-[13px] text-black/40 dark:text-white/45">{def.timed ? '' : 'BW'}</span>
        ) : (
          <>
            <NumField value={weight} onChange={setWeight} label="Weight" disabled={done} placeholder="lb" />
            <span className="text-[13px] text-black/40 dark:text-white/45">{def.addedLoad ? '+lb ×' : '×'}</span>
          </>
        )}
        <NumField value={reps} onChange={setReps} width="w-12" label={repsLabel} disabled={done} />
        <span className="w-8 text-[11px] leading-tight text-black/40 dark:text-white/45">{repsLabel}</span>
      </div>
      <button
        type="button"
        aria-label={done ? 'Undo set' : 'Log set'}
        onClick={toggle}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
          done ? 'border-accent bg-accent text-black' : 'border-black/20 text-transparent dark:border-white/25'
        }`}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>
      </div>
    </li>
  );
}

export function WorkoutScreen({ sessionId }: { sessionId: number }) {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]) as WorkoutSession | undefined;
  const logged = useLiveQuery(() => db.sets.where({ sessionId }).toArray(), [sessionId]) ?? [];
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [restEnds, setRestEnds] = useState<number | null>(null);
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
    <Page className="tab-safe">
      <Header
        title={TEMPLATES[session.templateId].name}
        sub={`${doneSets} of ${totalSets} sets${plan.deload ? ' · easy week' : ''}`}
        onBack={nav.pop}
        right={
          !finished && (
            <NavText strong onClick={() => void finish()}>
              Finish
            </NavText>
          )
        }
      />

      {plan.newBenchMax && (
        <div className="surface mx-4 mt-3 rounded-3xl px-4 py-2.5 text-[15px]">
          New bench block from your tested max of <b>{plan.newBenchMax} lb</b>. Every bench weight went up.
        </div>
      )}

      {plan.exercises.map((ex) => {
        const def = EXERCISES[ex.exerciseId];
        const topTarget = ex.sets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
        const plates = def.kind === 'barbell' && topTarget > settings.barWeight ? platesPerSide(topTarget, settings.barWeight, settings.plates) : null;
        return (
          <section key={ex.exerciseId} className="mx-4 mt-4">
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-[15px] font-semibold">
                {ex.name}
                {ex.superset && <span className="ml-2 text-[11px] font-medium text-[#bf5af2]">superset {ex.superset}</span>}
              </span>
              <span className={`text-[11px] ${dim}`}>rest {Math.round((ex.restSec / 60) * 2) / 2} min</span>
            </div>
            <List strong inset dividers className="!mx-0 !my-0">
              {ex.sets.map((t, i) => (
                <SetRow
                  key={i}
                  index={i}
                  target={t}
                  ex={ex}
                  logged={byKey.get(`${ex.exerciseId}:${i}`)}
                  fallbackWeight={i > 0 ? byKey.get(`${ex.exerciseId}:${i - 1}`)?.weight : undefined}
                  onLog={(weight, reps) => {
                    void logSet(
                      { sessionId, date: session.date, exerciseId: ex.exerciseId, setIndex: i, weight, reps, targetWeight: t.weight, targetReps: t.reps },
                      db,
                    );
                    if (ex.restSec > 0) setRestEnds(Date.now() + ex.restSec * 1000);
                  }}
                  onUnlog={() => void unlogSet(sessionId, ex.exerciseId, i, db)}
                />
              ))}
            </List>
            <div className={`mt-1.5 space-y-0.5 px-1 text-[12px] leading-snug ${dim}`}>
              {plates && plates.plates.length > 0 && (
                <div>
                  {fmtLb(topTarget)} lb = {plates.plates.join(' + ')} per side
                  {plates.leftover > 0 ? ` (+${plates.leftover} lb short)` : ''}
                </div>
              )}
              {ex.last && (
                <div>
                  Last time ({ex.last.date.slice(5).replace('-', '/')}): {ex.last.sets.map((s) => (s.weight ? `${fmtLb(s.weight)}×${s.reps}` : `${s.reps}`)).join(', ')}
                </div>
              )}
              {ex.notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="mx-4 mt-6 space-y-2">
        {!finished ? (
          <>
            <Btn kind="tint" size="lg" onClick={() => void finish()}>
              Finish workout
            </Btn>
            <Btn kind="plain" size="lg" className="!text-[#ff453a]" onClick={() => setConfirmDiscard(true)}>
              Discard workout
            </Btn>
          </>
        ) : (
          <Btn kind="danger" size="lg" onClick={() => setConfirmDiscard(true)}>
            Delete this workout
          </Btn>
        )}
      </div>

      {restEnds && <div className="h-14" />}
      {restEnds && <RestTimer endsAt={restEnds} onAdd={() => setRestEnds(Math.max(restEnds, Date.now()) + 30_000)} onSkip={() => setRestEnds(null)} />}

      <Dialog
        opened={confirmDiscard}
        onBackdropClick={() => setConfirmDiscard(false)}
        title="Delete this workout?"
        content="Its logged sets will be removed. This can't be undone."
        buttons={
          <>
            <DialogButton onClick={() => setConfirmDiscard(false)}>Cancel</DialogButton>
            <DialogButton strong className="!text-[#ff453a]" onClick={() => void discard()}>
              Delete
            </DialogButton>
          </>
        }
      />
    </Page>
  );
}

