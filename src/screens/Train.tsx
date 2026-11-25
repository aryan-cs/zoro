import { useLiveQuery } from 'dexie-react-hooks';
import { Block, BlockTitle, Button, List, ListItem, Navbar, Page } from 'konsta/react';
import { addDays, e1rm, nextMonday, programWeek, roundTo } from '../core/calc';
import { BENCH_STEPS, DELOAD_BLOCK_WEEKS, TEMPLATES, templateForWeekday } from '../core/program';
import { benchProgress } from '../core/progression';
import { loadHistory, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { db, fmtLb, useSettings } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout } from '../ui/workouts';

const MAIN: TemplateId[] = ['upperA', 'lowerA', 'arms', 'upperB', 'lowerB'];
const SECONDARY: TemplateId[] = ['pmForearms', 'pmAbs', 'pmArms', 'pmCardio'];
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TrainScreen() {
  const nav = useNav();
  const settings = useSettings();
  const date = today();
  const week = programWeek(settings.programStart, date, DELOAD_BLOCK_WEEKS);
  const history = useLiveQuery(() => loadHistory(db, 120), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.where('date').aboveOrEqual(addDays(date, -120)).reverse().sortBy('startedAt'), [date]) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
  const todayId = templateForWeekday(new Date().getDay(), settings.daysPerWeek);

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.push({ name: 'workout', sessionId });
  };

  // This week, Monday to Sunday.
  const monday = addDays(nextMonday(addDays(date, -6)), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const doneDates = new Set(sessions.filter((s) => s.finishedAt && !TEMPLATES[s.templateId].secondary).map((s) => s.date));

  const bench = benchProgress(settings, history);
  const blockMax = bench.newMax ?? settings.benchMax;
  const step = BENCH_STEPS[bench.step];
  const benchBest = history
    .flatMap((h) => h.sets.filter((s) => s.exerciseId === 'bench' || s.exerciseId === 'pausedBench'))
    .reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);

  return (
    <Page className="tab-safe">
      <Navbar large transparent centerTitle title="Train" />
      {week.week >= 1 && (
        <Block className="!mb-0 !mt-1 text-[13px] text-black/50 dark:text-white/55">
          Week {week.week}
          {week.deload ? ' · easy week' : ''}
        </Block>
      )}

      <div className="mx-4 mt-2 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const wd = (i + 1) % 7;
          const t = templateForWeekday(wd, settings.daysPerWeek);
          const isToday = d === date;
          const done = doneDates.has(d);
          return (
            <div
              key={d}
              className={`flex flex-col items-center rounded-xl py-2 text-[12px] ${isToday ? 'bg-[#007aff] text-white' : 'bg-white dark:bg-[#1c1c1e]'}`}
            >
              <span className={isToday ? 'text-white/80' : 'text-black/45 dark:text-white/50'}>{DAY[wd]}</span>
              <span className="mt-0.5 font-semibold">{done ? '✓' : t ? TEMPLATES[t].name.replace('Upper ', 'U').replace('Lower ', 'L').replace('Arms + shoulders', 'Arm') : '–'}</span>
            </div>
          );
        })}
      </div>

      {open?.id !== undefined && (
        <Block strong inset className="!mt-4 flex items-center justify-between">
          <div>
            <div className="text-[16px] font-semibold">{TEMPLATES[open.templateId].name}</div>
            <div className="text-[13px] text-black/50 dark:text-white/55">In progress</div>
          </div>
          <Button rounded inline onClick={() => nav.push({ name: 'workout', sessionId: open.id! })}>
            Resume
          </Button>
        </Block>
      )}

      <BlockTitle>Workouts</BlockTitle>
      <List strong inset dividers className="!my-2">
        {MAIN.filter((id) => settings.daysPerWeek === 5 || id !== 'arms').map((id) => (
          <ListItem
            key={id}
            link
            title={TEMPLATES[id].name}
            subtitle={TEMPLATES[id].short}
            after={id === todayId ? <span className="font-semibold text-[#007aff]">Today</span> : undefined}
            onClick={() => void start(id)}
          />
        ))}
      </List>

      <BlockTitle>Second sessions</BlockTitle>
      <List strong inset dividers className="!my-2">
        {SECONDARY.map((id) => (
          <ListItem key={id} link title={TEMPLATES[id].name} after={TEMPLATES[id].short} onClick={() => void start(id)} />
        ))}
      </List>
      {week.deload && <Block className="!my-1 text-[13px] text-[#ff9500]">Easy week: skip second sessions.</Block>}

      <BlockTitle>Bench to 225</BlockTitle>
      <Block strong inset className="!my-2 space-y-1 text-[15px]">
        <div className="flex justify-between">
          <span>Block max</span>
          <span className="tabular">{fmtLb(blockMax)} lb</span>
        </div>
        <div className="flex justify-between">
          <span>Next Monday</span>
          <span className="tabular text-right">
            Step {bench.step + 1}/12 ·{' '}
            {step.groups.map((g) => `${g.sets}×${g.reps} @ ${roundTo(blockMax * g.pct, 5)}`).join(', ')}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Best estimated max</span>
          <span className="tabular">{benchBest ? `${fmtLb(roundTo(benchBest, 1))} lb` : '—'}</span>
        </div>
        <div className="pt-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div className="h-full rounded-full bg-[#007aff]" style={{ width: `${Math.min(100, ((benchBest || blockMax) / 225) * 100)}%` }} />
          </div>
          <div className="mt-1 text-[12px] text-black/45 dark:text-white/50">Goal 225 lb by the end of May</div>
        </div>
      </Block>

      <BlockTitle>History</BlockTitle>
      {sessions.length === 0 ? (
        <Block className="!my-2 text-[15px] text-black/50 dark:text-white/55">Finished workouts show up here.</Block>
      ) : (
        <List strong inset dividers className="!my-2">
          {sessions.slice(0, 20).map((s) => {
            const sets = history.find((h) => h.sessionId === s.id)?.sets.length ?? 0;
            return (
              <ListItem
                key={s.id}
                link
                title={TEMPLATES[s.templateId].name}
                subtitle={new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                after={s.finishedAt ? `${sets} sets` : 'Unfinished'}
                onClick={() => s.id !== undefined && nav.push({ name: 'workout', sessionId: s.id })}
              />
            );
          })}
        </List>
      )}
    </Page>
  );
}
