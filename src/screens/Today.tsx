import { useLiveQuery } from 'dexie-react-hooks';
import { ListItem, Page } from 'konsta/react';
import { Check, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatMinutes, programWeek, weeklyRate, weightTrend } from '../core/calc';
import { DELOAD_BLOCK_WEEKS, TEMPLATES, templateForWeekday } from '../core/program';
import { buildPlan, dayTotals, metricsOf, saveMetric, today } from '../core/store';
import type { Meal, TemplateId } from '../core/types';
import { Btn, db, dim, fmt, Header, IconBtn, MacroSummary, NumberPrompt, Row, Section, useSettings, useToast } from '../ui/kit';
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
    <span className="inline-flex items-center gap-1 text-[15px] font-semibold text-accent">
      <Check className="h-3.5 w-3.5" strokeWidth={3} /> Done
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

  const weekText = week.week >= 1 ? `Week ${week.week}${week.deload ? ' · easy week' : ''}` : `Starts ${longDate(settings.programStart)}`;

  const workoutDone = !templateId || !!doneMain;
  const foodDone = totals.protein >= settings.proteinTarget && totals.kcal >= settings.kcalTarget * 0.9;
  const bodyDone = !!weighedToday && !!sleep;

  const workout: ReactNode = (
    <Section title="Workout" right={workoutDone && templateId ? <DoneMark /> : <span className={dim}>{weekText}</span>}>
      {open && open.templateId !== templateId && (
        <Row
          accent
          title={`Resume ${TEMPLATES[open.templateId].name}`}
          chevron
          onClick={() => open.id !== undefined && nav.go('lift', { name: 'workout', sessionId: open.id })}
        />
      )}
      {!templateId ? (
        <Row title="Rest day" />
      ) : doneMain ? (
        <Row
          title={TEMPLATES[templateId].name}
          right={`${sets} sets`}
          chevron
          onClick={() => doneMain.id !== undefined && nav.go('lift', { name: 'workout', sessionId: doneMain.id })}
        />
      ) : (
        <ListItem
          title={<span className="block truncate">{TEMPLATES[templateId].name}</span>}
          subtitle={`${plan?.exercises.length ?? '…'} exercises`}
          titleWrapClassName="min-w-0"
          after={
            <Btn kind="tint" onClick={() => void start(templateId)}>
              {open?.templateId === templateId ? 'Resume' : 'Start'}
            </Btn>
          }
        />
      )}
      {second && !week.deload && (
        <Row title={`Optional: ${TEMPLATES[second].name}`} right={TEMPLATES[second].short} chevron onClick={() => void start(second)} />
      )}
    </Section>
  );

  const food: ReactNode = (
    <Section
      title="Food"
      right={
        foodDone ? (
          <DoneMark />
        ) : (
          <Btn kind="plain" size="sm" className="!-me-3" onClick={() => nav.go('food', { name: 'addFood', meal: mealNow(), date })}>
            <Plus className="h-4 w-4" /> Log Food
          </Btn>
        )
      }
    >
      <ListItem
        link
        linkComponent="button"
        contentClassName="w-full text-left"
        linkProps={{ type: 'button' }}
        chevron={false}
        onClick={() => nav.go('food')}
        innerChildren={<div className="w-full"><MacroSummary totals={totals} settings={settings} /></div>}
      />
    </Section>
  );

  const body: ReactNode = (
    <Section title="Body" right={bodyDone ? <DoneMark /> : undefined}>
      <Row
        title="Weight"
        right={weighedToday ? `${fmt(weighedToday.value, 1)} lb` : 'Log'}
        sub={weighedToday && rate !== null ? `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb/wk` : undefined}
        chevron
        onClick={() => (weighedToday ? nav.go('history') : setWeighing(true))}
      />
      <Row
        title="Sleep"
        right={sleep ? formatMinutes(sleep.minutes) : 'Log'}
        chevron
        onClick={() => nav.push({ name: 'logSleep' })}
      />
    </Section>
  );

  // Finished blocks sink to the bottom so the next thing to do is always on top.
  const blocks = [
    { key: 'workout', done: workoutDone, el: workout },
    { key: 'food', done: foodDone, el: food },
    { key: 'body', done: bodyDone, el: body },
  ].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <Page className="tab-safe">
      <Header
        title={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <IconBtn label="Settings" onClick={() => nav.push({ name: 'settings' })}>
            <SettingsIcon className="h-5 w-5" />
          </IconBtn>
        }
      />
      {blocks.map((b) => (
        <div key={b.key}>{b.el}</div>
      ))}
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
