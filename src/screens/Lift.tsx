import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { addDays, programWeek } from '../core/calc';
import { DELOAD_WEEKS, EXERCISES, TEMPLATES, templateFor, templateForWeekday, workoutFor } from '../core/program';
import { addExtraExercise, loadHistory, stepsOn, swapWorkout, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { db, FITNESS, Header, IconBtn, Menu, NavText, useSettings, WorkoutCard } from '../ui/kit';
import { ActivitySheet, STEPS_ORANGE } from '../ui/ActivitySheet';
import { ExercisePicker } from '../ui/ExercisePicker';
import { useSlideSwap } from '../ui/pager';
import { Sym } from '../ui/Sym';
import { useNav } from '../ui/nav';
import { activeSession, optionalForWeekday, startWorkout, TEMPLATE_GLYPH, useRunningRest } from '../ui/workouts';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'upperB', 'lowerB', 'arms'];
const SECONDARY: TemplateId[] = ['pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const SPAN = 26; // weeks you can swipe back and ahead

/**
 * Calendar-style week strip: swipe sideways (or drag with a mouse) to page a week at a time;
 * tap a day to pick it. Today's number is blue, the picked day sits in a filled circle, and a dot
 * marks each workout day (green once done).
 */
/** A day's workout: done in full, started but left partway, or (once it's past) missed. */
type DayStatus = 'complete' | 'partial';

function WeekStrip(props: { date: string; sel: string; onSelect: (d: string) => void; daysPerWeek: 4 | 5; swaps?: Record<string, TemplateId | 'rest'>; status: Map<string, DayStatus>; programStart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Weeks run Sunday to Saturday, like Calendar.
  const thisSunday = addDays(props.date, -new Date(`${props.date}T12:00`).getDay());
  const weeks = Array.from({ length: SPAN * 2 + 1 }, (_, i) => addDays(thisSunday, (i - SPAN) * 7));
  // Start on this week, and come back to the picked day's week when it changes elsewhere (Today button).
  const selWeek = weeks.findIndex((m) => props.sel >= m && props.sel <= addDays(m, 6));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || selWeek < 0) return;
    if (el.clientWidth) el.scrollTo({ left: selWeek * el.clientWidth, behavior: el.dataset.ready ? 'smooth' : 'auto' });
    el.dataset.ready = el.clientWidth ? '1' : '';
  }, [selWeek]);
  // The tab mounts hidden (zero width), so place the strip once it's first shown.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || el.dataset.ready) return;
      el.scrollLeft = selWeek * el.clientWidth;
      el.dataset.ready = '1';
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Mouse drag (touch scrolls natively).
  const drag = useRef<{ x: number; left: number } | null>(null);
  return (
    <div
      ref={ref}
      className="lift-weeks"
      data-no-swipe
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') drag.current = { x: e.clientX, left: ref.current!.scrollLeft };
      }}
      onPointerMove={(e) => {
        if (drag.current) ref.current!.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
      }}
      onPointerUp={() => {
        const el = ref.current!;
        if (drag.current) el.scrollTo({ left: Math.round(el.scrollLeft / el.clientWidth) * el.clientWidth, behavior: 'smooth' });
        drag.current = null;
      }}
    >
      {weeks.map((sunday) => (
        <div key={sunday} className="lift-week">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(sunday, i);
            const wd = i;
            const t = workoutFor(d, { daysPerWeek: props.daysPerWeek, workoutSwaps: props.swaps });
            const st = props.status.get(d);
            // Planned and past with nothing logged: missed (from the program's start on).
            const missed = !!t && !st && d < props.date && d >= props.programStart;
            const dot = st === 'complete' ? 'is-done' : st === 'partial' ? 'is-partial' : missed ? 'is-missed' : t ? 'is-planned' : '';
            const said = st === 'complete' ? ', done' : st === 'partial' ? ', partly done' : missed ? ', missed' : '';
            return (
              <button
                type="button"
                key={d}
                className={`lift-day ${d === props.date ? 'is-today' : ''} ${d === props.sel ? 'is-sel' : ''}`}
                onClick={() => props.onSelect(d)}
                aria-label={`${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${t ? TEMPLATES[t].name : 'rest'}${said}`}
              >
                <span className="lift-day-letter">{DAY[wd]}</span>
                <span className="lift-day-num">{Number(d.slice(8))}</span>
                <span className={`lift-day-dot ${dot}`} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const ALL_SESSIONS: TemplateId[] = [...MAIN, ...SECONDARY];

/**
 * Lift is the plan for one day: pick a day in the week strip, see its session(s), and the
 * exercises in it. Any other session can be started from + in the bar.
 */
export function LiftScreen() {
  const nav = useNav();
  const settings = useSettings();
  const date = today();
  const history = useLiveQuery(() => loadHistory(db, 120), []) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
  const [sel, setSel] = useState(date);
  const dayRef = useRef<HTMLDivElement>(null);
  const slideDay = useSlideSwap(dayRef, sel);
  const pick = (d: string) => {
    if (d === sel) return;
    slideDay(d > sel ? 1 : -1);
    setSel(d);
  };
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const isToday = sel === date;
  const weekday = new Date(`${sel}T12:00`).getDay();
  // The day's workout: the program's, or what you swapped it for (hold its card).
  const mainId = workoutFor(sel, settings);
  const ownId = templateForWeekday(weekday, settings.daysPerWeek);
  const [swapMenu, setSwapMenu] = useState<DOMRect | null>(null);
  const deload = programWeek(settings.programStart, sel, DELOAD_WEEKS).deload;
  // The day's optional workout (Saturday's arm day, the rest days' walk), left out in easy weeks
  // and, for the arm day, in week 1 while you ease in.
  const week1 = programWeek(settings.programStart, sel, DELOAD_WEEKS).week === 1;
  const optional = optionalForWeekday(weekday, settings.daysPerWeek);
  const secondId = optional && optional !== mainId && !deload && !(optional === 'arms' && week1) ? optional : undefined;
  // Each workout's exercises (counted on its card; listed on the workout's own screen).
  const reps = (sets: number, min: number, max: number | undefined, timed?: boolean) => `${sets} × ${min}${max && max > min ? `–${max}` : ''}${timed ? 's' : ''}`;
  const fromTemplate = (id: TemplateId | undefined | null) =>
    id ? templateFor(id, settings.daysPerWeek).exercises.map((e) => ({ id: e.exerciseId, name: EXERCISES[e.exerciseId].name, detail: reps(e.sets, e.repMin, e.repMax, EXERCISES[e.exerciseId].timed) })) : [];
  // The unfinished workout: which of its exercises already have sets logged.
  const openSets = useLiveQuery(async () => (open?.id !== undefined ? new Set((await db.sets.where('sessionId').equals(open.id).toArray()).map((x) => x.exerciseId)) : new Set<string>()), [open?.id]) ?? new Set<string>();
  const openList = fromTemplate(open?.templateId).map((e) => ({ ...e, done: openSets.has(e.id) }));
  // How far through each of the day's workouts you are: exercises with sets logged, of all of them.
  const dayProgress = (id: TemplateId) => {
    const total = templateFor(id, settings.daysPerWeek).exercises.length;
    const logged = new Set(history.filter((h) => h.date === sel && h.templateId === id).flatMap((h) => h.sets.map((x) => x.exerciseId)));
    if (open?.templateId === id && sel === date) openSets.forEach((x) => logged.add(x));
    return total ? Math.min(1, logged.size / total) : 0;
  };
  const doneOn = (id: TemplateId) => history.some((h) => h.date === sel && h.templateId === id && h.sets.length) && open?.templateId !== id;
  // A workout you've started (or done) that day stays: swapping it would hide what you logged.
  const canSwap = !!mainId && !doneOn(mainId) && dayProgress(mainId) === 0 && !(isToday && open?.templateId === mainId);
  // Tapping a workout's card: a finished one opens what you did (any day); otherwise, today, it
  // does what play does.
  const openCard = (id: TemplateId) => {
    if (doneOn(id)) {
      const s = history.filter((h) => h.date === sel && h.templateId === id && h.sets.length).at(-1);
      return s ? () => nav.push({ name: 'workout', sessionId: s.sessionId }) : undefined;
    }
    return play(id);
  };
  // Play on any day: today and past days start (or pick up) that day's workout, so a missed one
  // can be logged after the fact; a day still to come shows its workout as planned.
  const play = (id: TemplateId) => (sel > date ? () => nav.push({ name: 'plannedWorkout', templateId: id, date: sel }) : () => void start(id));

  // The day's steps: Apple Health's (brought in with sleep), plus walks, runs and stairs added by
  // holding the card.
  const steps = useLiveQuery(async () => (await stepsOn(sel, db)).total, [sel]);
  const [addingSteps, setAddingSteps] = useState(false);
  // Exercises added on top of the day's workout: + › Add Exercise.
  const [picking, setPicking] = useState(false);
  const extras = history.filter((h) => h.date === sel && h.templateId === 'extra').at(-1);
  const extraSession = useLiveQuery(async () => (extras ? db.sessions.get(extras.sessionId) : undefined), [extras?.sessionId]);
  const extraList = (extraSession?.extras ?? []).map((id) => ({ id, name: EXERCISES[id]?.name ?? id, done: !!extras?.sets.some((x) => x.exerciseId === id) }));

  // A rest counting down in the workout you're doing: its card rings its play button with it.
  const running = useRunningRest(open?.id);
  const restFor = (id: TemplateId) => (isToday && open?.templateId === id ? running : null);

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id, sel);
    nav.push({ name: 'workout', sessionId });
  };
  // Each day's workouts: all planned sets logged (or finished, for older ones) is done in full;
  // any sets short of that is partway.
  const status = new Map<string, DayStatus>();
  for (const h of history) {
    // Extra exercises don't make a day's workout done or not.
    if (!h.sets.length || h.templateId === 'extra') continue;
    const full = h.plannedSets !== undefined ? h.sets.length >= h.plannedSets : !!h.finishedAt;
    if (full) status.set(h.date, 'complete');
    else if (status.get(h.date) !== 'complete') status.set(h.date, 'partial');
  }
  const allowed = ALL_SESSIONS;

  return (
    <Page className="tab-safe">
      <Header
        title="Lift"
        left={!isToday ? <NavText onClick={() => pick(date)}>Today</NavText> : undefined}
        right={
          <IconBtn label="Start a workout or add an exercise" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
            <Sym name="plus" size={18.3} />
          </IconBtn>
        }
      />
      <WeekStrip date={date} sel={sel} onSelect={pick} daysPerWeek={settings.daysPerWeek} swaps={settings.workoutSwaps} status={status} programStart={settings.programStart} />

      {/* The day's workouts and exercises slide in from the side of the day you picked. */}
      <div className="slide-clip">
      <div ref={dayRef}>
      <div className="fit-stack lift-day-cards">
        <h2 className="lift-heading">{isToday ? 'Today’s Workout' : `${new Date(`${sel}T12:00`).toLocaleDateString(undefined, { weekday: 'long' })}’s Workout`}</h2>
        {isToday && open?.id !== undefined && open.templateId !== mainId && open.templateId !== secondId && open.templateId !== 'extra' && (
          <WorkoutCard
            title={TEMPLATES[open.templateId].name}
            glyph={TEMPLATE_GLYPH[open.templateId]}
            color={FITNESS.exercise}
            progress={openList.length ? openList.filter((e) => e.done).length / openList.length : 0}
            onPlay={() => nav.push({ name: 'workout', sessionId: open.id! })}
            onOpen={() => nav.push({ name: 'workout', sessionId: open.id! })}
            rest={running}
          />
        )}
        {mainId ? (
          <WorkoutCard
            title={TEMPLATES[mainId].name}
            glyph={TEMPLATE_GLYPH[mainId]}
            color={FITNESS.exercise}
            done={doneOn(mainId)}
            onPlay={play(mainId)}
            onOpen={openCard(mainId)}
            rest={restFor(mainId)}
            progress={dayProgress(mainId)}
            sub={ownId !== mainId ? `Instead of ${ownId ? TEMPLATES[ownId].name : 'a rest day'}` : undefined}
            onHold={canSwap ? (el) => setSwapMenu(el.getBoundingClientRect()) : undefined}
          />
        ) : (
          <WorkoutCard
            title="Rest Day"
            glyph="bed.double.fill"
            color={FITNESS.sleep}
            sub={ownId ? `Instead of ${TEMPLATES[ownId].name}` : undefined}
            onHold={(el) => setSwapMenu(el.getBoundingClientRect())}
          />
        )}
        {secondId && (
          <WorkoutCard
            title={TEMPLATES[secondId].name}
            glyph={TEMPLATE_GLYPH[secondId]}
            color={FITNESS.steps}
            done={doneOn(secondId)}
            onPlay={play(secondId)}
            onOpen={openCard(secondId)}
            rest={restFor(secondId)}
            progress={dayProgress(secondId)}
          />
        )}
        {extras && extraList.length > 0 && (
          <WorkoutCard
            title={TEMPLATES.extra.name}
            glyph={TEMPLATE_GLYPH.extra}
            color={FITNESS.exercise}
            sub={extraList.map((e) => e.name).join(', ')}
            progress={extraList.filter((e) => e.done).length / extraList.length}
            onOpen={() => nav.push({ name: 'workout', sessionId: extras.sessionId })}
          />
        )}
        {/* Steps, every day: from Apple Health (the automation), against the daily goal. Hold it to
            add a walk, run or stairs you did without your phone. */}
        <WorkoutCard
          title="Steps"
          glyph="figure.walk"
          color={STEPS_ORANGE}
          value={(steps ?? 0).toLocaleString()}
          progress={Math.min(1, (steps ?? 0) / Math.max(1, settings.stepsTarget))}
          onHold={sel <= date ? () => setAddingSteps(true) : undefined}
          holdLabel="Steps. Touch and hold to add a walk, run or stairs."
        />
      </div>

      </div>
      </div>

      <Menu
        anchor={menu}
        onClose={() => setMenu(null)}
        items={[
          ...allowed.map((id) => ({ label: TEMPLATES[id].name, icon: <Sym name={TEMPLATE_GLYPH[id]} size={15} />, onClick: () => void start(id) })),
          { label: 'Add Exercise', icon: <Sym name="plus" size={15} />, onClick: () => setPicking(true), group: true },
        ]}
      />
      {/* Hold the day's workout: do another one that day instead (or rest). */}
      <Menu
        anchor={swapMenu}
        onClose={() => setSwapMenu(null)}
        title={`Swap ${isToday ? 'Today’s' : `${new Date(`${sel}T12:00`).toLocaleDateString(undefined, { weekday: 'long' })}’s`} Workout`}
        items={[
          ...ALL_SESSIONS.map((id) => ({
            label: TEMPLATES[id].name,
            icon: <Sym name={id === mainId ? 'checkmark' : TEMPLATE_GLYPH[id]} size={15} />,
            onClick: () => void swapWorkout(sel, id),
          })),
          { label: 'Rest Day', icon: <Sym name={mainId ? 'bed.double.fill' : 'checkmark'} size={15} />, onClick: () => void swapWorkout(sel, 'rest'), group: true },
        ]}
      />
      <ExercisePicker
        opened={picking}
        onClose={() => setPicking(false)}
        added={extraSession?.extras}
        onPick={(id) => {
          setPicking(false);
          // On the day you're looking at (today for a day still to come).
          void addExtraExercise(sel > date ? date : sel, id).then((sessionId) => nav.push({ name: 'workout', sessionId }));
        }}
      />
      <ActivitySheet opened={addingSteps} date={sel} onClose={() => setAddingSteps(false)} />
    </Page>
  );
}
