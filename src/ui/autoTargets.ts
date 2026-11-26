import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { saveSettings } from '../core/db';
import { metricsOf, today } from '../core/store';
import { ageOn, defaultRate, recommend, type Profile, type Targets } from '../core/targets';
import type { Settings } from '../core/types';
import { db, useSettings } from './kit';

/** Your profile from Settings plus your latest weigh-in, or null until it's filled in. */
export function profileFrom(settings: Settings, weightLb: number | undefined): Profile | null {
  if (!settings.sex || !settings.birthDate || !settings.heightIn || !settings.activity || !weightLb) return null;
  return {
    sex: settings.sex,
    age: ageOn(settings.birthDate, today()),
    heightIn: settings.heightIn,
    weightLb,
    activity: settings.activity,
    phase: settings.phase,
    ratePerWeek: settings.targetRate ?? defaultRate(settings.phase, weightLb),
  };
}

/** The latest weigh-in (lb), live. */
export function useLatestWeight(): number | undefined {
  return useLiveQuery(async () => (await metricsOf('weight', 3650, db)).at(-1)?.value, []);
}

/** The profile and what it recommends, live (null until the profile is filled in). */
export function useRecommendation(): { profile: Profile | null; rec: Targets | null } {
  const settings = useSettings();
  const weight = useLatestWeight();
  const profile = profileFrom(settings, weight);
  return { profile, rec: profile ? recommend(profile) : null };
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
      sleepTargetMin: rec.sleepMin,
    };
    const changed = (Object.keys(next) as (keyof Settings)[]).some((k) => settings[k] !== next[k]);
    if (changed) void saveSettings({ ...next, autoTargets: true });
  }, [rec, settings]);
}
