import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { saveSettings } from '../core/db';
import { estimateEnergy, weightTrend } from '../core/calc';
import { dailyIntake, metricsOf, today } from '../core/store';
import { ageOn, defaultRate, recommend, type Profile, type Targets } from '../core/targets';
import type { Settings } from '../core/types';
import { db, useSettings } from './kit';

/** Your profile from Settings plus your latest weigh-in, or null until it's filled in. */
export function profileFrom(settings: Settings, weightLb: number | undefined, bodyFatPct?: number, waistIn?: number): Profile | null {
  if (!settings.sex || !settings.birthDate || !settings.heightIn || !settings.activity || !weightLb) return null;
  return {
    sex: settings.sex,
    age: ageOn(settings.birthDate, today()),
    heightIn: settings.heightIn,
    weightLb,
    bodyFat: bodyFatPct ? bodyFatPct / 100 : undefined,
    activity: settings.activity,
    phase: settings.phase,
    ratePerWeek: settings.targetRate ?? defaultRate(settings.phase, weightLb),
    waistIn,
    liftDays: settings.daysPerWeek,
  };
}

/** The latest weigh-in (lb), live. */
export function useLatestWeight(): number | undefined {
  return useLiveQuery(async () => (await metricsOf('weight', 3650, db)).at(-1)?.value, []);
}

/** The last body-fat reading (%) from the past 90 days, live. */
function useRecentBodyFat(): number | undefined {
  return useLiveQuery(async () => (await metricsOf('bodyfat', 90, db)).at(-1)?.value, []);
}

/** The last waist measurement (in) from the past 90 days, live. */
function useRecentWaist(): number | undefined {
  return useLiveQuery(async () => (await metricsOf('waist', 90, db)).at(-1)?.value, []);
}

/**
 * What you burn, measured: the last 4 weeks' food against your weight trend, once at least 18
 * of those days are logged in full (half the calorie target or more; a half-logged day would read
 * as a smaller appetite) and the weigh-ins span 2 weeks. Null until then.
 */
function useMeasuredBurn(kcalTarget: number | undefined): number | null {
  return (
    useLiveQuery(async () => {
      if (!kcalTarget) return null;
      const [intake, weights] = await Promise.all([dailyIntake(28, db), metricsOf('weight', 28, db)]);
      const full = intake.filter((d) => d.kcal >= kcalTarget * 0.5);
      if (full.length < 18 || weights.length < 4) return null;
      return estimateEnergy(full, weightTrend(weights), 0, 28)?.tdee ?? null;
    }, [kcalTarget]) ?? null
  );
}

/** The profile and what it recommends, live (null until the profile is filled in). */
export function useRecommendation(): { profile: Profile | null; rec: Targets | null; measured: boolean } {
  const settings = useSettings();
  const weight = useLatestWeight();
  const bodyFat = useRecentBodyFat();
  const waist = useRecentWaist();
  const profile = profileFrom(settings, weight, bodyFat, waist);
  const formula = profile ? recommend(profile) : null;
  const burn = useMeasuredBurn(formula?.kcal);
  return { profile, rec: profile ? recommend(profile, burn) : null, measured: burn !== null };
}

/**
 * Keeps the saved targets on the profile's recommendation (as your weight, goal or profile
 * changes) unless you've set targets yourself. Mounted once, at the app's root.
 */
export function useAutoTargets() {
  const settings = useSettings();
  const { rec } = useRecommendation();
  useEffect(() => {
    if (!rec || settings.autoTargets === false) return;
    const next: Partial<Settings> = {
      kcalTarget: rec.kcal,
      proteinTarget: rec.protein,
      fatTarget: rec.fat,
      fiberTarget: rec.fiber,
      waterTargetOz: rec.waterOz,
      waterTrainingOz: rec.waterTrainingOz,
      sleepTargetMin: rec.sleepMin,
    };
    const changed = (Object.keys(next) as (keyof Settings)[]).some((k) => settings[k] !== next[k]);
    if (changed) void saveSettings({ ...next, autoTargets: true });
  }, [rec, settings]);
}
