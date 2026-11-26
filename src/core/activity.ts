import type { ActivityKind } from './types';

/**
 * Steps from a walk, run or stair session you add by hand (a treadmill, a run outside without
 * your phone, a StairMaster), worked out the way pedometers do:
 *
 * - Walking: a stride of about 41.5% of your height (41.3% for women), the usual pedometer rule,
 *   so a mile is 63,360 inches over that. Given only a time, a 3 mph pace.
 * - Running: strides lengthen with speed, so with both a distance and a time it's your cadence
 *   at that pace (about 150 steps a minute jogging up to 190 sprinting) times the minutes. With
 *   only a distance, a stride of 60% of your height (an easy 9–10 minute mile); with only a time,
 *   165 steps a minute.
 * - Stairs: StairMaster counts a floor as 16 steps; given only a time, about 70 steps a minute
 *   (a steady level 6–8).
 */
export const MILE_IN = 63360;
export const KM_PER_MILE = 1.609344;
const DEFAULT_HEIGHT_IN = { male: 69, female: 64 };

export interface ActivityInput {
  kind: ActivityKind;
  miles?: number;
  minutes?: number;
  floors?: number;
}

export interface Body {
  heightIn?: number;
  sex?: 'male' | 'female';
}

const pos = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Steps in a mile of walking, for your height. */
export function walkStepsPerMile(body: Body): number {
  const h = body.heightIn || DEFAULT_HEIGHT_IN[body.sex ?? 'male'];
  return MILE_IN / (h * (body.sex === 'female' ? 0.413 : 0.415));
}

/** Running cadence (steps a minute) at a speed in mph. */
export function runCadence(mph: number): number {
  return Math.min(190, Math.max(150, 130 + 5.5 * mph));
}

/** The steps an activity works out to (0 if there's nothing to go on). */
export function activitySteps(a: ActivityInput, body: Body): number {
  const h = body.heightIn || DEFAULT_HEIGHT_IN[body.sex ?? 'male'];
  if (a.kind === 'stairs') {
    if (pos(a.floors)) return Math.round(a.floors * 16);
    return pos(a.minutes) ? Math.round(a.minutes * 70) : 0;
  }
  if (a.kind === 'walk') {
    if (pos(a.miles)) return Math.round(a.miles * walkStepsPerMile(body));
    return pos(a.minutes) ? Math.round((a.minutes / 60) * 3 * walkStepsPerMile(body)) : 0;
  }
  // Running.
  if (pos(a.miles) && pos(a.minutes)) return Math.round(runCadence(a.miles / (a.minutes / 60)) * a.minutes);
  if (pos(a.miles)) return Math.round((a.miles * MILE_IN) / (h * 0.6));
  return pos(a.minutes) ? Math.round(a.minutes * 165) : 0;
}
