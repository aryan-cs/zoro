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
import { longDate } from './Today';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'arms', 'upperB', 'lowerB'];
const SECONDARY: TemplateId[] = ['pmForearms', 'pmAbs', 'pmArms', 'pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const abbrev = (id: TemplateId) => TEMPLATES[id].name.replace('Upper ', 'U').replace('Lower ', 'L').replace('Arms + shoulders', 'Arm');

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
      <Section>
        <Row title={week.week >= 1 ? `Week ${week.week}` : 'Plan starts'} right={week.week >= 1 ? (week.deload ? 'Easy week' : undefined) : longDate(settings.programStart)} />
      </Section>

      <div className="mx-4 mt-3 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const wd = (i + 1) % 7;
          const t = templateForWeekday(wd, settings.daysPerWeek);
          const isToday = d === date;
          return (
            <div key={d} className="flex flex-col items-center gap-1 text-[13px]" aria-label={`${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long' })}: ${t ? TEMPLATES[t].name : 'rest'}${doneDates.has(d) ? ', done' : ''}`}>
              <span className={isToday ? 'font-semibold text-accent' : dim}>{DAY[wd]}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ${isToday ? 'bg-accent text-black' : ''}`}>{doneDates.has(d) ? '✓' : t ? abbrev(t) : '–'}</span>
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
              <Btn size="sm" kind="tint" onClick={() => void start(todayId)}>
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
          <Bar value={benchBest || blockMax} target={225} color="#48fa78" className="mt-2" />
        </Cell>
      </Section>
    </Page>
  );
}
