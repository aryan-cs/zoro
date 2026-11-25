import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { addDays, e1rm, nextMonday, programWeek, roundTo } from '../core/calc';
import { BENCH_STEPS, DELOAD_BLOCK_WEEKS, EXERCISES, TEMPLATES, templateForWeekday } from '../core/program';
import { benchProgress } from '../core/progression';
import { buildPlan, loadHistory, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { Bar, Btn, Cell, db, dim, fmtLb, Header, Row, Section, useSettings } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout } from '../ui/workouts';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'arms', 'upperB', 'lowerB'];
const SECONDARY: TemplateId[] = ['pmForearms', 'pmAbs', 'pmArms', 'pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

      {open?.id !== undefined && (
        <Section>
          <Row accent title={`Resume ${TEMPLATES[open.templateId].name}`} chevron onClick={() => nav.push({ name: 'workout', sessionId: open.id! })} />
        </Section>
      )}

      {todayId && plan && (
        <Section
          title={`Today · ${TEMPLATES[todayId].name}`}
          right={
            !todayDone && open?.templateId !== todayId ? (
              <Btn size="sm" kind="plain" className="!-me-3" onClick={() => void start(todayId)}>
                Start
              </Btn>
            ) : undefined
          }
        >
          {plan.exercises.map((e) => {
            const def = EXERCISES[e.exerciseId];
            const s = e.sets[0];
            return (
              <Row
                key={e.exerciseId}
                title={def.name}
                right={`${e.sets.length} × ${s.reps}${s.repMax && s.repMax > s.reps ? `–${s.repMax}` : ''}${def.timed ? 's' : ''}${s.weight ? ` @ ${fmtLb(s.weight)}` : ''}`}
              />
            );
          })}
        </Section>
      )}

      <Section title="Workouts">
        {MAIN.filter((id) => settings.daysPerWeek === 5 || id !== 'arms').map((id) => (
          <Row
            key={id}
            title={TEMPLATES[id].name}
            right={id === todayId ? <span className="font-semibold text-accent">Today</span> : undefined}
            chevron
            onClick={() => void start(id)}
          />
        ))}
      </Section>

      <Section title="Second sessions" right={week.deload ? <span className="text-[12px] text-[#ff9f0a]">Skip on easy weeks</span> : undefined}>
        {SECONDARY.map((id) => (
          <Row key={id} title={TEMPLATES[id].name} right={TEMPLATES[id].short} chevron onClick={() => void start(id)} />
        ))}
      </Section>

      <Section title="Bench to 225">
        <Row title="Block max" right={`${fmtLb(blockMax)} lb`} />
        <Row
          title={`Step ${bench.step + 1}/12`}
          right={step.groups.map((g) => `${g.sets}×${g.reps} @ ${roundTo(blockMax * g.pct, 5)}`).join(', ')}
        />
        <Cell>
          <div className="flex items-center justify-between gap-3 text-[17px]">
            <span className="truncate">Best estimated max</span>
            <span className={`tabular shrink-0 ${dim}`}>{benchBest ? `${fmtLb(roundTo(benchBest, 1))} lb` : '—'}</span>
          </div>
          <Bar value={benchBest || blockMax} target={225} color="#0a84ff" className="mt-2" />
        </Cell>
      </Section>
    </Page>
  );
}
