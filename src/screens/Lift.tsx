import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { addDays, e1rm, nextMonday, roundTo } from '../core/calc';
import { EXERCISES, TEMPLATES, templateForWeekday } from '../core/program';
import { benchProgress } from '../core/progression';
import { buildPlan, loadHistory, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { Bar, db, FITNESS, FitCard, FitStat, fmtLb, Header, NavText, Row, Section, useSettings, WorkoutCard } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout, TEMPLATE_GLYPH } from '../ui/workouts';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'arms', 'upperB', 'lowerB'];
const SECONDARY: TemplateId[] = ['pmForearms', 'pmAbs', 'pmArms', 'pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const SPAN = 26; // weeks you can swipe back and ahead

/**
 * Calendar-style week strip: swipe sideways (or drag with a mouse) to page a week at a time;
 * tap a day to pick it. Today's number is blue, the picked day sits in a filled circle, and a dot
 * marks each workout day (green once done).
 */
function WeekStrip(props: { date: string; sel: string; onSelect: (d: string) => void; daysPerWeek: 4 | 5; doneDates: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const thisMonday = nextMonday(addDays(props.date, -6));
  const weeks = Array.from({ length: SPAN * 2 + 1 }, (_, i) => addDays(thisMonday, (i - SPAN) * 7));
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
      {weeks.map((monday) => (
        <div key={monday} className="lift-week">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(monday, i);
            const wd = (i + 1) % 7;
            const t = templateForWeekday(wd, props.daysPerWeek);
            const done = props.doneDates.has(d);
            return (
              <button
                type="button"
                key={d}
                className={`lift-day ${d === props.date ? 'is-today' : ''} ${d === props.sel ? 'is-sel' : ''}`}
                onClick={() => props.onSelect(d)}
                aria-label={`${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${t ? TEMPLATES[t].name : 'rest'}${done ? ', done' : ''}`}
              >
                <span className="lift-day-letter">{DAY[wd]}</span>
                <span className="lift-day-num">{Number(d.slice(8))}</span>
                <span className={`lift-day-dot ${t ? (done ? 'is-done' : 'is-planned') : ''}`} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function LiftScreen() {
  const nav = useNav();
  const settings = useSettings();
  const date = today();
  const history = useLiveQuery(() => loadHistory(db, 120), []) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
  // The day picked in the week strip (today by default); the card and exercises follow it.
  const [sel, setSel] = useState(date);
  const isToday = sel === date;
  const todayId = templateForWeekday(new Date(`${sel}T12:00`).getDay(), settings.daysPerWeek);
  const todaysSession = history.find((h) => h.date === sel && h.templateId === todayId);
  const plan = useLiveQuery(
    () => (todayId ? buildPlan(todayId, sel, db, todaysSession?.sessionId) : undefined),
    [todayId, sel, settings.daysPerWeek, todaysSession?.sessionId],
  );

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.push({ name: 'workout', sessionId });
  };

  const doneDates = new Set(history.filter((h) => !TEMPLATES[h.templateId].secondary && h.sets.length).map((h) => h.date));

  const bench = benchProgress(settings, history);
  const blockMax = bench.newMax ?? settings.benchMax;
  const benchBest = history
    .flatMap((h) => h.sets.filter((s) => s.exerciseId === 'bench' || s.exerciseId === 'pausedBench'))
    .reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);
  const todayDone = !!todaysSession?.sets.length && open?.templateId !== todayId;

  return (
    <Page className="tab-safe">
      <Header title="Lift" right={!isToday ? <NavText onClick={() => setSel(date)}>Today</NavText> : undefined} />
      <WeekStrip date={date} sel={sel} onSelect={setSel} daysPerWeek={settings.daysPerWeek} doneDates={doneDates} />

      <div className="fit-stack">
        {isToday && open?.id !== undefined && open.templateId !== todayId && (
          <WorkoutCard
            title={TEMPLATES[open.templateId].name}
            glyph={TEMPLATE_GLYPH[open.templateId]}
            color={FITNESS.exercise}
            onPlay={() => nav.push({ name: 'workout', sessionId: open.id! })}
            onOpen={() => nav.push({ name: 'workout', sessionId: open.id! })}
          />
        )}
        {todayId ? (
          <WorkoutCard
            title={TEMPLATES[todayId].name}
            glyph={TEMPLATE_GLYPH[todayId]}
            color={FITNESS.exercise}
            done={todayDone}
            onPlay={isToday ? () => void start(todayId) : undefined}
          />
        ) : (
          <WorkoutCard title="Rest Day" glyph="bed.double.fill" color={FITNESS.sleep} />
        )}
      </div>

      {todayId && plan && (
        <Section title="Exercises">
          {plan.exercises.map((e) => {
            const def = EXERCISES[e.exerciseId];
            const s = e.sets[0];
            return (
              <Row
                key={e.exerciseId}
                title={<span className="block truncate">{def.name}</span>}
                right={`${e.sets.length} × ${s.reps}${s.repMax && s.repMax > s.reps ? `–${s.repMax}` : ''}${def.timed ? 's' : ''}${s.weight ? ` @ ${fmtLb(s.weight)}` : ''}`}
              />
            );
          })}
        </Section>
      )}

      <Section title="Workouts" plain>
        <div className="fit-grid">
          {MAIN.filter((id) => settings.daysPerWeek === 5 || id !== 'arms').map((id) => (
            <WorkoutCard key={id} title={TEMPLATES[id].name} glyph={TEMPLATE_GLYPH[id]} color={FITNESS.exercise} onPlay={() => void start(id)} />
          ))}
        </div>
      </Section>

      <Section title="Second Sessions" plain>
        <div className="fit-grid">
          {SECONDARY.map((id) => (
            <WorkoutCard key={id} title={TEMPLATES[id].name} glyph={TEMPLATE_GLYPH[id]} color={FITNESS.steps} onPlay={() => void start(id)} />
          ))}
        </div>
      </Section>

      <div className="fit-stack">
        <FitCard title="Bench to 225">
          <div className="fit-grid !gap-3">
            <FitStat label="Training Max" value={fmtLb(blockMax)} unit="LB" color={FITNESS.exercise} />
            <FitStat label="Estimated Max" value={benchBest ? fmtLb(roundTo(benchBest, 1)) : null} unit={benchBest ? 'LB' : undefined} color={FITNESS.exercise} />
          </div>
          {/* Progress toward 225 along the bottom: 16pt from the card's left, right and bottom edges. */}
          <Bar value={benchBest || blockMax} target={225} color={FITNESS.exercise} className="mt-4" />
        </FitCard>
      </div>
    </Page>
  );
}
