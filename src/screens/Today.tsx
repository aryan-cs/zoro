import { useLiveQuery } from 'dexie-react-hooks';
import { Page } from 'konsta/react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addDays, carbTarget, formatMinutes, nextMonday, roundTo, weightTrend } from '../core/calc';
import { TEMPLATES } from '../core/program';
import { dayTotals, metricsOf, saveMetric, today, waterFor } from '../core/store';
import type { Meal } from '../core/types';
import { LineChart, type Series } from '../ui/LineChart';
import { Bar, db, FITNESS, FitCard, fmt, IconBtn, NumberPrompt, RING_GRADIENT, SingleRing, useSettings, useToast } from '../ui/kit';
import type { SFName } from '../ui/sf';
import { Sym } from '../ui/Sym';
import { useNav } from '../ui/nav';

export const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/** The meal you're most likely logging right now. */
export function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

/** One goal as a ring with its value under it (Sleep, Water, Workouts); the name is for VoiceOver. */
function RingTile(props: { label: string; value: string; progress: number; goal: number; colors: readonly [string, string]; glyph: SFName; color: string; onOpen: () => void }) {
  return (
    <button type="button" className="ring-tile" onClick={props.onOpen} aria-label={`${props.label}: ${props.value}`}>
      <SingleRing value={props.progress} target={props.goal} colors={props.colors} glyph={props.glyph} />
      <span className="ring-tile-value" style={{ color: props.color }}>
        {props.value}
      </span>
    </button>
  );
}

/** "Protein   120/185 g" over a bar in the macro's color. */
function NutritionRow(props: { label: string; value: number; target: number; unit: string; color: string }) {
  return (
    <div className="nut-row">
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
 * Today: a welcome page. A greeting, rings for sleep, water and the week's workouts, a bar for
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
  const monday = nextMonday(addDays(date, -6));
  const weekSessions = useLiveQuery(() => db.sessions.where('date').between(monday, addDays(monday, 6), true, true).toArray(), [monday]) ?? [];
  const weekDone = new Set(weekSessions.filter((x) => x.finishedAt && !TEMPLATES[x.templateId].secondary).map((x) => x.date)).size;
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
  const first = settings.name?.trim().split(/\s+/)[0];

  // The greeting stays on one line, like a large title: it steps down from 34pt if a long name
  // would wrap.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.fontSize = '';
    let size = 34;
    while (el.scrollWidth > el.clientWidth && size > 24) el.style.fontSize = `${(size -= 1)}px`;
  }, [first]);

  return (
    <Page className="tab-safe">
      {/* No navigation bar: the greeting is the title, with Settings beside it (as Fitness puts
          its profile button beside "Summary"), and both scroll away. Only the status bar keeps a
          thin fade so content doesn't run under the clock. */}
      <div className="status-edge" aria-hidden />
      <header className="hello">
        <div className="min-w-0 flex-1">
          <div className="hello-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 ref={titleRef} className="hello-title">
            {first ? `Welcome Back, ${first}` : 'Welcome Back'}
          </h1>
        </div>
        <IconBtn label="Settings" onClick={() => nav.push({ name: 'settings' })}>
          <Sym name="gearshape" size={16.5} />
        </IconBtn>
      </header>

      <div className="fit-stack">
        {/* Sleep, water and the week's workouts, each a ring: halfway is half a ring. */}
        <section className="fit-card is-bare today-rings">
          <RingTile
            label="Sleep"
            value={sleep ? formatMinutes(sleep.minutes) : '—'}
            progress={sleep?.minutes ?? 0}
            goal={settings.sleepTargetMin}
            colors={RING_GRADIENT.sleep}
            glyph="moon.fill"
            color={FITNESS.sleep}
            onOpen={() => nav.push({ name: 'logSleep' })}
          />
          <RingTile
            label="Water"
            value={`${fmt(waterOz)} oz`}
            progress={waterOz}
            goal={settings.waterTargetOz}
            colors={RING_GRADIENT.distance}
            glyph="drop.fill"
            color={FITNESS.distance}
            onOpen={() => nav.push({ name: 'screen', tab: 'water' })}
          />
          <RingTile
            label="Workouts"
            value={String(weekDone)}
            progress={weekDone}
            goal={settings.daysPerWeek}
            colors={RING_GRADIENT.exercise}
            glyph="figure.run"
            color={FITNESS.exercise}
            onOpen={() => nav.push({ name: 'screen', tab: 'lift' })}
          />
        </section>

        <FitCard bare title="Nutrition" onOpen={() => nav.push({ name: 'screen', tab: 'food' })}>
          <NutritionRow label="Calories" value={totals.kcal} target={settings.kcalTarget} unit="kcal" color={FITNESS.move} />
          <NutritionRow label="Protein" value={totals.protein} target={settings.proteinTarget} unit="g" color={FITNESS.exercise} />
          <NutritionRow label="Carbs" value={totals.carbs} target={carbs} unit="g" color={FITNESS.carbs} />
          <NutritionRow label="Fat" value={totals.fat} target={settings.fatTarget} unit="g" color={FITNESS.steps} />
        </FitCard>

        <FitCard bare title="Weight" onOpen={() => (weighedToday ? nav.push({ name: 'screen', tab: 'history', section: 'body' }) : setWeighing(true))}>
          <ChartHead
            label={weighedToday || !latest ? 'Weight' : `Weight · ${longDate(latest.date)}`}
            color={FITNESS.body}
            value={
              latest ? (
                <>
                  {fmt(latest.value, 1)}
                  <small>LB</small>
                </>
              ) : (
                <span className="text-[#8d8d93]">—</span>
              )
            }
            right={
              change ? (
                <span className={`wt-change ${change > 0 ? 'is-up' : 'is-down'}`}>
                  <Sym name={change > 0 ? 'arrow.up' : 'arrow.down'} size={13} />
                  {fmt(Math.abs(change), 1)} LB
                </span>
              ) : undefined
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
