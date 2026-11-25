import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { Sym } from '../ui/Sym';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { addDays, formatMinutes, nextMonday, programWeek, weeklyRate, weightTrend } from '../core/calc';
import { DELOAD_BLOCK_WEEKS, TEMPLATES, templateForWeekday } from '../core/program';
import { dayTotals, metricsOf, saveMetric, today, waterFor } from '../core/store';
import type { Meal, TemplateId } from '../core/types';
import { db, FITNESS, FitCard, FitStat, fmt, Header, IconBtn, MacroRings, NumberPrompt, useSettings, useToast, WorkoutCard } from '../ui/kit';
import { useNav } from '../ui/nav';
import { activeSession, SECOND_BY_WEEKDAY, startWorkout, TEMPLATE_GLYPH } from '../ui/workouts';


export const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** The meal you're most likely logging right now. */
export function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

export function TodayScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const date = today();
  const weekday = new Date().getDay();
  const week = programWeek(settings.programStart, date, DELOAD_BLOCK_WEEKS);
  const templateId = templateForWeekday(weekday, settings.daysPerWeek);
  const second = SECOND_BY_WEEKDAY[weekday];

  const sessions = useLiveQuery(() => db.sessions.where('date').equals(date).toArray(), [date]) ?? [];
  const open = useLiveQuery(() => activeSession(), []);
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
    nav.push({ name: 'workout', sessionId });
  };
  const saveWeight = async (v: number) => {
    await saveMetric('weight', v, date, db);
    setWeighing(false);
    toast('Weight saved');
  };




  // Today's sessions: one in progress (if it isn't today's), today's, and the optional one.
  type Session = { id: TemplateId; color: string; done?: boolean; play: () => void };
  const sessionsToday: Session[] = [];
  if (open && open.templateId !== templateId)
    sessionsToday.push({ id: open.templateId, color: FITNESS.exercise, play: () => open.id !== undefined && nav.push({ name: 'workout', sessionId: open.id }) });
  if (templateId) sessionsToday.push({ id: templateId, color: FITNESS.exercise, done: !!doneMain, play: () => void start(templateId) });
  if (second && !week.deload) sessionsToday.push({ id: second, color: FITNESS.steps, play: () => void start(second) });

  // One session: a colored square with its figure. Several: a gray square with a button each.
  const workout: ReactNode =
    sessionsToday.length === 0 ? (
      <WorkoutCard title="Rest Day" glyph="bed.double.fill" color={FITNESS.sleep} onOpen={() => nav.push({ name: 'screen', tab: 'lift' })} />
    ) : sessionsToday.length === 1 ? (
      <WorkoutCard
        title={TEMPLATES[sessionsToday[0].id].name}
        glyph={TEMPLATE_GLYPH[sessionsToday[0].id]}
        color={sessionsToday[0].color}
        done={sessionsToday[0].done}
        onPlay={sessionsToday[0].play}
        onOpen={() => nav.push({ name: 'screen', tab: 'lift' })}
      />
    ) : (
      <FitCard title="Workouts" onOpen={() => nav.push({ name: 'screen', tab: 'lift' })}>
        <div className={`wk-circles n${sessionsToday.length}`}>
          {sessionsToday.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-label={`${w.done ? 'Done: ' : 'Start '}${TEMPLATES[w.id].name}`}
              className={`wk-circle ${w.done ? 'is-done' : ''}`}
              style={{ '--tint': w.color } as CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                if (!w.done) w.play();
              }}
            >
              <Sym name={w.done ? 'checkmark.bold' : TEMPLATE_GLYPH[w.id]} size={w.done ? 16 : 20} />
            </button>
          ))}
        </div>
      </FitCard>
    );

  const food: ReactNode = (
    <FitCard
      title="Food"
      onOpen={() => nav.push({ name: 'screen', tab: 'food' })}
    >
      <div className="sq-center">
        <MacroRings totals={totals} settings={settings} />
      </div>
    </FitCard>
  );

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
        <div className="fit-grid is-squares">
          {food}
          {workout}
          <FitCard title="Water" onOpen={() => nav.push({ name: 'screen', tab: 'water' })}>
            <FitStat value={fmt(waterOz)} unit="OZ" color={FITNESS.distance} />
          </FitCard>
          <FitCard title="Sleep" onOpen={() => nav.push({ name: 'logSleep' })}>
            <FitStat value={sleep ? formatMinutes(sleep.minutes) : null} color={FITNESS.sleep} />
          </FitCard>
          <FitCard title="Weight" onOpen={() => (weighedToday ? nav.push({ name: 'screen', tab: 'history', section: 'body' }) : setWeighing(true))}>
            <FitStat
              value={weighedToday ? fmt(weighedToday.value, 1) : null}
              unit={weighedToday ? 'LB' : undefined}
              color={FITNESS.body}
              sub={rate !== null ? `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb/wk` : undefined}
            />
          </FitCard>
          <FitCard title="This Week" onOpen={() => nav.push({ name: 'screen', tab: 'lift' })}>
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
