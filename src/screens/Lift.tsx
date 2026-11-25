import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { addDays, e1rm, nextMonday, programWeek, roundTo } from '../core/calc';
import { BENCH_STEPS, DELOAD_BLOCK_WEEKS, EXERCISES, TEMPLATES, templateForWeekday } from '../core/program';
import { benchProgress } from '../core/progression';
import { buildPlan, loadHistory, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { Bar, db, FITNESS, FitCard, FitStat, fmtLb, Header, Row, Section, useSettings, WorkoutCard } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout, TEMPLATE_GLYPH } from '../ui/workouts';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'arms', 'upperB', 'lowerB'];
const SECONDARY: TemplateId[] = ['pmForearms', 'pmAbs', 'pmArms', 'pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const shortDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function LiftScreen() {
  const nav = useNav();
  const settings = useSettings();
  const date = today();
  const week = programWeek(settings.programStart, date, DELOAD_BLOCK_WEEKS);
  const history = useLiveQuery(() => loadHistory(db, 120), []) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
  const todayId = templateForWeekday(new Date().getDay(), settings.daysPerWeek);
  const todaysSession = history.find((h) => h.date === date && h.templateId === todayId);
  const plan = useLiveQuery(
    () => (todayId ? buildPlan(todayId, date, db, todaysSession?.sessionId) : undefined),
    [todayId, date, settings.daysPerWeek, todaysSession?.sessionId],
  );

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.push({ name: 'workout', sessionId });
  };

  // This week, Monday to Sunday.
  const monday = nextMonday(addDays(date, -6));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const doneDates = new Set(history.filter((h) => !TEMPLATES[h.templateId].secondary && h.sets.length).map((h) => h.date));

  const bench = benchProgress(settings, history);
  const blockMax = bench.newMax ?? settings.benchMax;
  const step = BENCH_STEPS[bench.step];
  const benchBest = history
    .flatMap((h) => h.sets.filter((s) => s.exerciseId === 'bench' || s.exerciseId === 'pausedBench'))
    .reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);
  const todayDone = !!todaysSession?.sets.length && open?.templateId !== todayId;

  return (
    <Page className="tab-safe">
      <Header title="Lift" />
      {/* This week like Calendar's week row: weekday letters, date numbers, today circled.
          A dot marks a workout day; it turns green once that workout is done. */}
      <div className="lift-week">
        {days.map((d, i) => {
          const wd = (i + 1) % 7;
          const t = templateForWeekday(wd, settings.daysPerWeek);
          const done = doneDates.has(d);
          return (
            <div
              key={d}
              className={`lift-day ${d === date ? 'is-today' : ''}`}
              aria-label={`${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${t ? TEMPLATES[t].name : 'rest'}${done ? ', done' : ''}`}
            >
              <span className="lift-day-letter">{DAY[wd]}</span>
              <span className="lift-day-num">{Number(d.slice(8))}</span>
              <span className={`lift-day-dot ${t ? (done ? 'is-done' : 'is-planned') : ''}`} />
            </div>
          );
        })}
      </div>

      <div className="fit-stack">
        {open?.id !== undefined && open.templateId !== todayId && (
          <WorkoutCard
            title={TEMPLATES[open.templateId].name}
            glyph={TEMPLATE_GLYPH[open.templateId]}
            color={FITNESS.exercise}
            tiles={[{ icon: 'timer', text: 'In Progress' }]}
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
            onPlay={() => void start(todayId)}
            tiles={[
              { icon: 'list.bullet', text: `${plan?.exercises.length ?? '…'} Exercises` },
              { icon: 'calendar', text: week.week >= 1 ? `Week ${week.week}${week.deload ? ' · Easy' : ''}` : `Starts ${shortDate(settings.programStart)}` },
            ]}
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
            <FitStat label="Block Max" value={fmtLb(blockMax)} unit="LB" color={FITNESS.exercise} />
            <FitStat label="Best Est. Max" value={benchBest ? fmtLb(roundTo(benchBest, 1)) : '--'} unit={benchBest ? 'LB' : undefined} color={FITNESS.exercise} />
          </div>
          <Bar value={benchBest || blockMax} target={225} color={FITNESS.exercise} className="mt-3" />
          <div className="fit-stat-sub mt-3 truncate">
            Step {bench.step + 1} of 12 · {step.groups.map((g) => `${g.sets}×${g.reps} @ ${roundTo(blockMax * g.pct, 5)}`).join(', ')}
          </div>
        </FitCard>
      </div>
    </Page>
  );
}
