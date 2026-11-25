import { useLiveQuery } from 'dexie-react-hooks';
import { Block, BlockTitle, Button, List, ListItem, Navbar, Page } from 'konsta/react';
import { useState } from 'react';
import { carbTarget, formatMinutes, programWeek, weeklyRate, weightTrend } from '../core/calc';
import { DELOAD_BLOCK_WEEKS, EXERCISES, TEMPLATES, templateForWeekday } from '../core/program';
import { buildPlan, dayTotals, metricsOf, saveMetric, today } from '../core/store';
import type { TemplateId } from '../core/types';
import { db, fmt, fmtLb, NumField, ProgressRow, Stat, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout } from '../ui/workouts';

const SECOND: Record<number, TemplateId> = { 1: 'pmCardio', 2: 'pmForearms', 3: 'pmAbs', 4: 'pmCardio', 6: 'pmForearms' };

export function TodayScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const date = today();
  const weekday = new Date().getDay();
  const week = programWeek(settings.programStart, date, DELOAD_BLOCK_WEEKS);
  const templateId = templateForWeekday(weekday, settings.daysPerWeek);
  const second = SECOND[weekday];

  const sessions = useLiveQuery(() => db.sessions.where('date').equals(date).toArray(), [date]) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
  // Show the targets as they were before today's session started.
  const todaysSession = sessions.find((s) => s.templateId === templateId)?.id;
  const plan = useLiveQuery(
    () => (templateId ? buildPlan(templateId, date, db, todaysSession) : undefined),
    [templateId, date, settings.daysPerWeek, todaysSession],
  );
  const totals = useLiveQuery(() => dayTotals(date, db), [date]);
  const sleep = useLiveQuery(() => db.sleep.where('date').equals(date).first(), [date]);
  const weights = useLiveQuery(() => metricsOf('weight', 120, db), []) ?? [];
  const [weightInput, setWeightInput] = useState('');

  const doneMain = sessions.find((s) => s.templateId === templateId && s.finishedAt);
  const trend = weightTrend(weights);
  const lastTrend = trend[trend.length - 1];
  const rate = weeklyRate(trend);
  const weighedToday = weights.find((w) => w.date === date);
  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);
  const first = plan?.exercises[0];

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.go('train', { name: 'workout', sessionId });
  };

  const saveWeight = async () => {
    const v = parseFloat(weightInput);
    if (!Number.isFinite(v) || v < 80 || v > 400) return toast('Enter your weight in lb.');
    await saveMetric('weight', v, date, db);
    setWeightInput('');
    toast('Weight saved');
  };

  const subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Page className="tab-safe">
      <Navbar large transparent centerTitle title="Today" />
      <Block className="!mb-0 !mt-1 text-[17px] font-semibold">{subtitle}</Block>

      {week.week >= 1 && (
        <Block className="!mb-2 !mt-0 text-[13px] text-black/50 dark:text-white/55">
          Week {week.week} · block {week.block}, week {week.blockWeek} of 12
          {week.deload && <span className="ml-1 font-semibold text-[#ff9500]">· Easy week</span>}
        </Block>
      )}
      {week.week < 1 && <Block className="!mb-2 !mt-0 text-[13px] text-black/50 dark:text-white/55">The plan starts {settings.programStart}.</Block>}

      {open && open.templateId !== templateId && (
        <List strong inset className="!my-3">
          <ListItem
            link
            title={`Resume ${TEMPLATES[open.templateId].name}`}
            after="In progress"
            onClick={() => open.id !== undefined && nav.go('train', { name: 'workout', sessionId: open.id })}
          />
        </List>
      )}

      <BlockTitle>Workout</BlockTitle>
      {templateId ? (
        <Block strong inset className="!my-2 space-y-3">
          <div>
            <div className="text-[19px] font-semibold">{TEMPLATES[templateId].name}</div>
            <div className="text-[14px] text-black/50 dark:text-white/55">
              {TEMPLATES[templateId].short} · {plan?.exercises.length ?? '…'} exercises
            </div>
          </div>
          {first && (
            <div className="flex justify-between border-t border-black/10 pt-3 text-[15px] dark:border-white/10">
              <span>{first.name}</span>
              <span className="tabular text-black/50 dark:text-white/55">
                {first.sets.length} × {first.sets[0].reps}
                {first.sets[0].weight ? ` @ ${fmtLb(first.sets[0].weight)} lb` : ''}
              </span>
            </div>
          )}
          {doneMain ? (
            <Button large rounded tonal onClick={() => doneMain.id !== undefined && nav.go('train', { name: 'workout', sessionId: doneMain.id })}>
              Done · view workout
            </Button>
          ) : (
            <Button large rounded onClick={() => void start(templateId)}>
              {open?.templateId === templateId ? 'Resume workout' : 'Start workout'}
            </Button>
          )}
        </Block>
      ) : (
        <Block strong inset className="!my-2 text-[15px]">
          Rest day. Walk 8–10k steps and stretch.
        </Block>
      )}
      {second && !week.deload && (
        <List strong inset className="!my-2">
          <ListItem
            link
            title={`Optional: ${TEMPLATES[second].name}`}
            after={TEMPLATES[second].short}
            onClick={() => void start(second)}
          />
        </List>
      )}

      <BlockTitle>Food</BlockTitle>
      <Block strong inset className="!my-2" onClick={() => nav.go('food')}>
        <ProgressRow label="Calories" value={totals?.kcal ?? 0} target={settings.kcalTarget} color="#ff9500" />
        <ProgressRow label="Protein" value={totals?.protein ?? 0} target={settings.proteinTarget} unit="g" color="#34c759" />
        <ProgressRow label="Carbs" value={totals?.carbs ?? 0} target={carbs} unit="g" color="#007aff" />
        <ProgressRow label="Fat" value={totals?.fat ?? 0} target={settings.fatTarget} unit="g" color="#af52de" />
      </Block>

      <BlockTitle>Body</BlockTitle>
      <div className="mx-4 grid grid-cols-2 gap-3">
        <Stat
          label="Sleep"
          value={sleep ? formatMinutes(sleep.minutes) : 'Log'}
          sub={sleep ? (sleep.minutes >= settings.sleepTargetMin ? 'On target' : `Goal ${formatMinutes(settings.sleepTargetMin)}`) : 'Last night'}
          onClick={() => nav.go('body')}
        />
        <Stat
          label="Weight trend"
          value={lastTrend ? fmt(lastTrend.trend, 1) : '—'}
          sub={rate === null ? 'Weigh in daily' : `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb/wk`}
          subClass={rate !== null && rate < 0 ? 'text-[#34c759]' : undefined}
          onClick={() => nav.go('body')}
        />
      </div>
      {!weighedToday && (
        <Block strong inset className="!mt-3 flex items-center justify-between gap-3">
          <span className="text-[15px]">Morning weight</span>
          <div className="flex items-center gap-2">
            <NumField value={weightInput} onChange={setWeightInput} placeholder="lb" width="w-20" label="Weight in pounds" />
            <Button small rounded inline onClick={() => void saveWeight()}>
              Save
            </Button>
          </div>
        </Block>
      )}

      {plan && plan.exercises.length > 1 && !doneMain && (
        <>
          <BlockTitle>Today's lifts</BlockTitle>
          <List strong inset dividers className="!my-2">
            {plan.exercises.map((e) => (
              <ListItem
                key={e.exerciseId}
                title={EXERCISES[e.exerciseId].name}
                after={
                  <span className="tabular">
                    {e.sets.length} × {e.sets[0].reps}
                    {EXERCISES[e.exerciseId].timed ? 's' : ''}
                    {e.sets[0].weight ? ` @ ${fmtLb(e.sets[0].weight)}` : ''}
                  </span>
                }
              />
            ))}
          </List>
        </>
      )}
    </Page>
  );
}
