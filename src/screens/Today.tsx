import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { Check, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatMinutes, programWeek, weeklyRate, weightTrend } from '../core/calc';
import { DELOAD_BLOCK_WEEKS, TEMPLATES, templateForWeekday } from '../core/program';
import { buildPlan, dayTotals, metricsOf, saveMetric, today } from '../core/store';
import type { Meal, TemplateId } from '../core/types';
import { Btn, Cell, db, dim, fmt, Header, IconBtn, MacroSummary, NumField, Row, Section, useSettings, useToast } from '../ui/kit';
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
  const [weightInput, setWeightInput] = useState('');

  const doneMain = sessions.find((s) => s.templateId === templateId && s.finishedAt);
  const trend = weightTrend(weights);
  const rate = weeklyRate(trend);
  const weighedToday = weights.find((w) => w.date === date);

  const start = async (id: TemplateId) => {
    const sessionId = await startWorkout(id);
    nav.go('lift', { name: 'workout', sessionId });
  };
  const saveWeight = async () => {
    const v = parseFloat(weightInput);
    if (!Number.isFinite(v) || v < 80 || v > 400) return toast('Enter your weight in lb.');
    await saveMetric('weight', v, date, db);
    setWeightInput('');
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
        <Row title="Rest day" sub="Walk 8–10k steps and stretch." />
      ) : doneMain ? (
        <Row
          title={TEMPLATES[templateId].name}
          sub={`${sets} sets logged`}
          right="View"
          chevron
          onClick={() => doneMain.id !== undefined && nav.go('lift', { name: 'workout', sessionId: doneMain.id })}
        />
      ) : (
        <Cell className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold">{TEMPLATES[templateId].name}</div>
            <div className={`truncate text-[15px] ${dim}`}>
              {TEMPLATES[templateId].short} · {plan?.exercises.length ?? '…'} exercises
            </div>
          </div>
          <Btn kind="tint" onClick={() => void start(templateId)}>
            {open?.templateId === templateId ? 'Resume' : 'Start'}
          </Btn>
        </Cell>
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
          <button type="button" className="flex items-center gap-1 text-accent active:opacity-50" onClick={() => nav.go('food', { name: 'addFood', meal: mealNow(), date })}>
            <Plus className="h-4 w-4" /> Log food
          </button>
        )
      }
    >
      <li>
        <button type="button" className="block w-full px-4 py-2.5 text-left active:bg-white/5" onClick={() => nav.go('food')}>
          <MacroSummary totals={totals} settings={settings} />
        </button>
      </li>
    </Section>
  );

  const body: ReactNode = (
    <Section title="Body" right={bodyDone ? <DoneMark /> : undefined}>
      <li className="grid grid-cols-2">
        <div className="px-4 py-3">
          <div className={`text-[13px] ${dim}`}>Weight</div>
          {weighedToday ? (
            <button type="button" className="text-left" onClick={() => nav.go('history')}>
              <div className="tabular text-[20px] font-semibold leading-tight">
                {fmt(weighedToday.value, 1)} <span className={`text-[13px] font-normal ${dim}`}>lb</span>
              </div>
              <div className={`text-[12px] ${rate !== null && rate < 0 ? 'text-accent' : dim}`}>
                {rate === null ? 'Weigh in daily' : `${rate > 0 ? '+' : ''}${fmt(rate, 2)} lb/wk`}
              </div>
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-1.5">
              <NumField value={weightInput} onChange={setWeightInput} placeholder="lb" width="w-[72px]" label="Weight in pounds" />
              <Btn size="sm" kind="glass" onClick={() => void saveWeight()}>
                Save
              </Btn>
            </div>
          )}
        </div>
        <button type="button" className="border-l border-white/10 px-4 py-3 text-left active:bg-white/5" onClick={() => nav.push({ name: 'logSleep' })}>
          <div className={`text-[13px] ${dim}`}>Sleep</div>
          {sleep ? (
            <>
              <div className="tabular text-[20px] font-semibold leading-tight">{formatMinutes(sleep.minutes)}</div>
              <div className={`text-[12px] ${sleep.minutes >= settings.sleepTargetMin ? 'text-accent' : dim}`}>
                {sleep.minutes >= settings.sleepTargetMin ? 'On target' : `Goal ${formatMinutes(settings.sleepTargetMin)}`}
              </div>
            </>
          ) : (
            <>
              <div className="text-[20px] font-semibold leading-tight text-accent">Log</div>
              <div className={`text-[12px] ${dim}`}>Last night</div>
            </>
          )}
        </button>
      </li>
    </Section>
  );

  // Finished blocks sink to the bottom so the next thing to do is always on top.
  const blocks = [
    { key: 'workout', done: workoutDone, el: workout },
    { key: 'food', done: foodDone, el: food },
    { key: 'body', done: bodyDone, el: body },
  ].sort((a, b) => Number(a.done) - Number(b.done));

  const title = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Page className="tab-safe">
      <Header
        title={title}
        right={
          <IconBtn label="Settings" onClick={() => nav.push({ name: 'settings' })}>
            <SettingsIcon className="h-5 w-5" />
          </IconBtn>
        }
      />
      {blocks.map((b) => (
        <div key={b.key}>{b.el}</div>
      ))}
    </Page>
  );
}
