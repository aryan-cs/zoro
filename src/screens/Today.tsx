import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { useMemo, useState, type ReactNode } from 'react';
import { addDays, carbTarget, formatMinutes, roundTo, weightTrend } from '../core/calc';
import { workoutDayPercent, workoutFor } from '../core/program';
import { dayTotals, metricsOf, saveMetric, stepsOn, today, waterFor, waterGoalOn } from '../core/store';
import type { Meal, Phase, TemplateId } from '../core/types';
import { LineChart, type Series } from '../ui/LineChart';
import { hrMin } from '../core/say';
import { Bar, db, FITNESS, FitCard, fmt, Header, IconBtn, LogBtn, NumberPrompt, RING_GRADIENT, RingSummary, useHoldInfo, useSettings, useToast } from '../ui/kit';
import { Sym } from '../ui/Sym';
import { useNav } from '../ui/nav';

export const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/** The meal you're most likely logging right now. */
export function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

/** A goal in hours: "8h", or "7h 30m" when it isn't whole. */
const hours = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;

/** Green when the weight moved the way your phase wants (down on a cut, up on a bulk), red when
 * it moved the other way, gray on maintain. */
function changeTone(change: number, phase: Phase) {
  if (phase === 'maintain') return 'is-flat';
  return (phase === 'cut' ? change < 0 : change > 0) ? 'is-good' : 'is-bad';
}

/** "Protein   120/185 g" over a bar in the macro's color. */
function NutritionRow(props: { label: string; value: number; target: number; unit: string; color: string; info?: string }) {
  const hold = useHoldInfo(props.label, props.info);
  return (
    <div className="nut-row" {...hold}>
      <div className="nut-head">
        <span>{props.label}</span>
        <span className="nut-value" style={{ color: props.color }}>
          {fmt(props.value)}
          <small>
            /{fmt(props.target)} {props.unit}
          </small>
        </span>
      </div>
      <Bar value={props.value} target={props.target} color={props.color} />
    </div>
  );
}

/** A card's label, its big value and an optional note on the right. */
function ChartHead(props: { label: string; value: ReactNode; color: string; right?: ReactNode }) {
  return (
    <div className="chart-head">
      <div>
        <div className="fit-stat-label">{props.label}</div>
        <div className="fit-stat-value" style={{ color: props.color }}>
          {props.value}
        </div>
      </div>
      {props.right}
    </div>
  );
}

/**
 * Today: a welcome page. A greeting, combined rings for sleep, water, steps and workouts, a bar for
 * each macro, then weight with its trend. Every block opens its screen.
 */
export function TodayScreen() {
  const nav = useNav();
  const toast = useToast();
  const settings = useSettings();
  const date = today();

  const totals = useLiveQuery(() => dayTotals(date, db), [date]) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const sleep = useLiveQuery(() => db.sleep.where('date').equals(date).first(), [date]);
  const water = useLiveQuery(() => waterFor(date, db), [date]) ?? [];
  const waterOz = water.reduce((n, e) => n + e.oz, 0);
  const waterGoal = waterGoalOn(date, settings);
  // Apple Health's steps plus walks, runs and stairs added on Lift.
  const steps = useLiveQuery(async () => (await stepsOn(date, db)).total, [date]) ?? 0;
  // Today's workouts as one percentage: each planned workout counts the share of its exercises
  // you've started (on exercise 3 of 10 is 30%; finished is 100%), averaged over the day's
  // workouts (one done and one halfway is 75%). Any other workout you start today joins in.
  const todaySessions = useLiveQuery(() => db.sessions.where('date').equals(date).toArray(), [date]) ?? [];
  const todaySets = useLiveQuery(() => db.sets.where('date').equals(date).toArray(), [date]) ?? [];
  const workoutPct = useMemo(() => {
    // Only the day's main workout (as swapped, if it was) counts toward the ring; an optional one
    // joins once you start it.
    const main = workoutFor(date, settings);
    const planned = [main].filter((x): x is TemplateId => !!x);
    return workoutDayPercent(planned, todaySessions, todaySets, settings.daysPerWeek);
  }, [date, settings, todaySessions, todaySets]);
  const weights = useLiveQuery(() => metricsOf('weight', 120, db), []) ?? [];
  const [weighing, setWeighing] = useState(false);

  // Weight: the latest weigh-in, its change since the one before, and a month of trend.
  const latest = weights.at(-1);
  const prior = weights.at(-2);
  const change = latest && prior ? roundTo(latest.value - prior.value, 0.1) : null;
  const weighedToday = latest?.date === date;
  const month = useMemo(() => weightTrend(weights).filter((t) => t.date >= addDays(date, -30)), [weights, date]);
  const weightLabels = useMemo(() => (month.length ? month.map((t) => short(t.date)) : Array.from({ length: 30 }, (_, i) => short(addDays(date, i - 29)))), [month, date]);
  const weightSeries = useMemo<Series[]>(
    () =>
      month.length
        ? [
            { label: 'Weigh-in', data: month.map((t) => t.weight), color: 'rgba(255,159,10,0.45)', dots: true },
            { label: 'Trend', data: month.map((t) => roundTo(t.trend, 0.1)), color: FITNESS.body },
          ]
        : [],
    [month],
  );

  const carbs = carbTarget(settings.kcalTarget, settings.proteinTarget, settings.fatTarget);

  return (
    <Page className="tab-safe">
      {/* A navigation bar like Lift's and Food's: the date as its centered title, Settings on the right. */}
      <Header
        title={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <IconBtn label="Settings" onClick={() => nav.push({ name: 'settings' })}>
            <Sym name="gearshape" size={16.5} />
          </IconBtn>
        }
      />

      <div className="fit-stack">
        {/* Sleep, water, steps and today's workout as Fitness's combined rings, each labeled beside
            them; tap a line to open it, touch and hold to see what it counts. */}
        <section className="fit-card is-plain">
          <RingSummary
            hero
            rows={[
              {
                label: 'Sleep',
                value: sleep?.minutes ?? 0,
                target: settings.sleepTargetMin,
                unit: '',
                display: `${sleep ? formatMinutes(sleep.minutes) : '—'}/${hours(settings.sleepTargetMin)}`,
                color: FITNESS.sleep,
                gradient: RING_GRADIENT.sleep,
                glyph: 'moon.fill',
                info: `How long you slept last night against your ${hrMin(settings.sleepTargetMin)} goal. The ring closes when you reach it. Tap to log or see your sleep.`,
                onOpen: () => nav.push({ name: 'logSleep' }),
              },
              {
                label: 'Water',
                value: waterOz,
                target: waterGoal,
                unit: 'OZ',
                color: FITNESS.distance,
                gradient: RING_GRADIENT.distance,
                glyph: 'drop.fill',
                info: `How much you’ve drunk today against your ${fmt(waterGoal)} oz goal${waterGoal > settings.waterTargetOz ? ', more on a lifting day' : ''}. The ring closes when you reach it. Tap to add water.`,
                onOpen: () => nav.push({ name: 'screen', tab: 'water' }),
              },
              {
                label: 'Steps',
                value: steps,
                target: settings.stepsTarget,
                unit: '',
                color: FITNESS.carbs,
                gradient: RING_GRADIENT.carbs,
                glyph: 'figure.walk',
                info: `Steps today from Apple Health against your ${fmt(settings.stepsTarget)} goal. They come in when the Apple Health automation runs. Tap to set it up.`,
                onOpen: () => nav.push({ name: 'healthSetup' }),
              },
              {
                label: 'Workouts',
                value: workoutPct ?? 0,
                target: 100,
                unit: '',
                display: workoutPct === null ? 'Rest' : `${workoutPct}%`,
                color: FITNESS.exercise,
                gradient: RING_GRADIENT.exercise,
                glyph: 'figure.run',
                info: 'How much of today’s planned training you’ve done, counting each exercise you finish. Rest means nothing is planned today. Tap to see your workouts.',
                onOpen: () => nav.push({ name: 'screen', tab: 'lift' }),
              },
            ]}
          />
        </section>

        <FitCard bare title="Nutrition" onOpen={() => nav.push({ name: 'screen', tab: 'food' })}>
          <NutritionRow label="Calories" value={totals.kcal} target={settings.kcalTarget} unit="kcal" color={FITNESS.move} info="Calories eaten today against your daily target. Your target is set from your profile and goal in Settings." />
          <NutritionRow label="Protein" value={totals.protein} target={settings.proteinTarget} unit="g" color={FITNESS.exercise} info="Protein eaten today against your target. Protein is what your muscles are built and repaired from, so lifters aim higher than most people." />
          <NutritionRow label="Carbs" value={totals.carbs} target={carbs} unit="g" color={FITNESS.carbs} info="Carbs eaten today against your target. Carbs are your main fuel for training; the target is whatever calories are left after protein and fat." />
          <NutritionRow label="Fat" value={totals.fat} target={settings.fatTarget} unit="g" color={FITNESS.steps} info="Fat eaten today against your target. You need a steady amount for your hormones and to absorb some vitamins." />
        </FitCard>

        <FitCard bare title="Weight" onOpen={() => nav.push({ name: 'screen', tab: 'history', section: 'body' })}>
          <ChartHead
            label={weighedToday || !latest ? 'Weight' : `Weight · ${longDate(latest.date)}`}
            color={FITNESS.body}
            value={
              latest ? (
                <>
                  {fmt(latest.value, 1)}
                  <small>LB</small>
                  {/* The change since the weigh-in before, right after the weight. */}
                  {change ? (
                    <span className={`wt-change is-inline ${changeTone(change, settings.phase)}`}>
                      <Sym name={change > 0 ? 'arrow.up' : 'arrow.down'} size={13} />
                      {fmt(Math.abs(change), 1)} LB
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-[#8d8d93]">—</span>
              )
            }
            right={
              // Top right: a plus to weigh in today, or a pencil to fix today's weigh-in.
              <span className="wt-head-side">
                <LogBtn logged={weighedToday} what="Today’s Weight" onClick={() => setWeighing(true)} />
              </span>
            }
          />
          <div className="fit-chart">
            <LineChart labels={weightLabels} series={weightSeries} unit=" lb" height={120} />
          </div>
        </FitCard>

      </div>

      <NumberPrompt
        opened={weighing}
        title="Morning Weight"
        unit="lb"
        initial={latest ? fmt(latest.value, 1) : undefined}
        min={80}
        max={400}
        onCancel={() => setWeighing(false)}
        onSave={async (v) => {
          await saveMetric('weight', v, date, db);
          setWeighing(false);
          toast('Weight saved');
        }}
      />
    </Page>
  );
}
