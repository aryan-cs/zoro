import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useState, type ReactNode } from 'react';
import { addDays, formatMinutes, nextMonday, programWeek, weeklyRate, weightTrend } from '../core/calc';
import { DELOAD_BLOCK_WEEKS, TEMPLATES, templateForWeekday } from '../core/program';
import { buildPlan, dayTotals, metricsOf, saveMetric, today, waterFor } from '../core/store';
import type { Meal, TemplateId } from '../core/types';
import { Btn, db, FITNESS, FitCard, FitStat, fmt, Header, IconBtn, MacroSummary, NumberPrompt, useSettings, useToast } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, startWorkout } from '../ui/workouts';

const SECOND: Record<number, TemplateId> = { 1: 'pmCardio', 2: 'pmForearms', 3: 'pmAbs', 4: 'pmCardio', 6: 'pmForearms' };

export const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** The meal you're most likely logging right now. */
export function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

function DoneMark() {
  return (
    <span role="img" aria-label="Done" className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#30d158] text-black">
      <Sym name="checkmark" size={10} />
    </span>
  );
}

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
  const sets = useLiveQuery(() => db.sets.where('date').equals(date).count(), [date]) ?? 0;
  const open = useLiveQuery(() => activeSession(), []);
  const todaysSession = sessions.find((s) => s.templateId === templateId)?.id;
  const plan = useLiveQuery(
    () => (templateId ? buildPlan(templateId, date, db, todaysSession) : undefined),
    [templateId, date, settings.daysPerWeek, todaysSession],
  );
  const totals = useLiveQuery(() => dayTotals(date, db), [date]) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const sleep = useLiveQuery(() => db.sleep.where('date').equals(date).first(), [date]);
  const weights = useLiveQuery(() => metricsOf('weight', 120, db), []) ?? [];
  const water = useLiveQuery(() => waterFor(date, db), [date]) ?? [];
  const waterOz = water.reduce((n, e) => n + e.oz, 0);
  const monday = nextMonday(addDays(date, -6));
  const weekSessions = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).toArray(), [monday]) ?? [];
  const weekDone = new Set(weekSessions.filter((x) => x.finishedAt && !TEMPLATES[x.templateId].secondary).map((x) => x.date)).size;
  const [weighing, setWeighing] = useState(false);

  const doneMain = sessions.find((s) => s.templateId === templateId && s.finishedAt);
  const trend = weightTrend(weights);
  const rate = weeklyRate(trend);
  const weighedToday = weights.find((w) => w.date === date);

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.go('lift', { name: 'workout', sessionId });
  };
  const saveWeight = async (v: number) => {
    await saveMetric('weight', v, date, db);
    setWeighing(false);
    toast('Weight saved');
  };

  const workoutDone = !templateId || !!doneMain;
  const foodDone = totals.protein >= settings.proteinTarget && totals.kcal >= settings.kcalTarget * 0.9;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const workout: ReactNode = (
    <FitCard title="Workout" onOpen={() => nav.go('lift')} trailing={workoutDone && templateId ? <DoneMark /> : undefined}>
      {open && open.templateId !== templateId && (
        <button
          type="button"
          className="fit-link"
          onClick={(e) => {
            stop(e);
            if (open.id !== undefined) nav.go('lift', { name: 'workout', sessionId: open.id });
          }}
        >
          Resume {TEMPLATES[open.templateId].name}
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <FitStat
            label={week.week >= 1 ? `Today · Week ${week.week}${week.deload ? ' · Easy' : ''}` : `Starts ${longDate(settings.programStart)}`}
            value={templateId ? TEMPLATES[templateId].name : 'Rest Day'}
            color={FITNESS.exercise}
            sub={templateId ? (doneMain ? `${sets} sets` : `${plan?.exercises.length ?? '…'} exercises`) : undefined}
          />
        </div>
        {templateId && !doneMain && (
          <span className="mb-1" onClick={stop}>
            <Btn size="sm" onClick={() => void start(templateId)}>
              {open?.templateId === templateId ? 'Resume' : 'Start'}
            </Btn>
          </span>
        )}
      </div>
      {second && !week.deload && (
        <button
          type="button"
          className="fit-link is-row"
          onClick={(e) => {
            stop(e);
            void start(second);
          }}
        >
          <span>Optional: {TEMPLATES[second].name}</span>
          <span className="fit-link-value">{TEMPLATES[second].short}</span>
        </button>
      )}
    </FitCard>
  );

  const food: ReactNode = (
    <FitCard
      title="Food"
      onOpen={() => nav.go('food')}
      trailing={
        foodDone ? (
          <DoneMark />
        ) : (
          <button type="button" aria-label="Log food" className="fit-plus" onClick={() => nav.go('food', { name: 'addFood', date })}>
            <Sym name="plus" size={17} />
          </button>
        )
      }
    >
      <MacroSummary totals={totals} settings={settings} />
    </FitCard>
  );

  // Finished cards sink below the rest so the next thing to do is always on top.
  const blocks = [
    { key: 'workout', done: workoutDone, el: workout },
    { key: 'food', done: foodDone, el: food },
  ].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <Page className="tab-safe">
      <Header
        title={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <IconBtn label="Settings" onClick={() => nav.push({ name: 'settings' })}>
            <Sym name="gearshape" size={16.5} />
          </IconBtn>
        }
      />
      <div className="fit-stack">
        {blocks.map((b) => (
          <div key={b.key}>{b.el}</div>
        ))}
        <div className="fit-grid">
          <FitCard title="Water" onOpen={() => nav.go('water')}>
            <FitStat label="Today" value={`${fmt(waterOz)}/${fmt(settings.waterTargetOz)}`} unit="OZ" color={FITNESS.distance} />
          </FitCard>
          <FitCard title="Sleep" onOpen={() => nav.push({ name: 'logSleep' })}>
            <FitStat label="Last Night" value={sleep ? formatMinutes(sleep.minutes) : '--'} color={FITNESS.sleep} />
          </FitCard>
          <FitCard title="Weight" onOpen={() => (weighedToday ? nav.go('history') : setWeighing(true))}>
            <FitStat
              label="Today"
              value={weighedToday ? fmt(weighedToday.value, 1) : '--'}
              unit={weighedToday ? 'LB' : undefined}
              color={FITNESS.body}
              sub={rate !== null ? `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb/wk` : undefined}
            />
          </FitCard>
          <FitCard title="This Week" onOpen={() => nav.go('lift')}>
            <FitStat label="Workouts" value={`${weekDone}/${settings.daysPerWeek}`} color={FITNESS.exercise} />
          </FitCard>
        </div>
      </div>
      <NumberPrompt
        opened={weighing}
        title="Morning Weight"
        unit="lb"
        initial={weights.length ? fmt(weights[weights.length - 1].value, 1) : undefined}
        min={80}
        max={400}
        onCancel={() => setWeighing(false)}
        onSave={(v) => void saveWeight(v)}
      />
    </Page>
  );
}
