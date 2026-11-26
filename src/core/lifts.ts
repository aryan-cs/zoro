import { e1rm } from './calc';
import type { ISODate } from './types';

/** One day's best set of a lift, by its estimated one-rep max. */
export interface LiftPoint {
  date: ISODate;
  e1rm: number;
  weight: number;
  reps: number;
  /** Entered by hand on the Lifts card, not logged in a workout. */
  manual?: boolean;
}

type AnySet = { date: ISODate; exerciseId: string; weight: number; reps: number; manual?: boolean };

/**
 * Each lift's best set per day, oldest first, from workout sets and sets entered by hand alike:
 * whichever has the higher estimated max (Epley) that day. Sets with no weight don't count.
 */
export function bestSetsByDay(sets: AnySet[], lifts: string[]): Record<string, LiftPoint[]> {
  const wanted = new Set(lifts);
  const byKey = new Map<string, LiftPoint & { id: string }>();
  for (const s of sets) {
    if (!wanted.has(s.exerciseId) || !(s.weight > 0) || !(s.reps > 0)) continue;
    const point = { id: s.exerciseId, date: s.date, e1rm: e1rm(s.weight, s.reps), weight: s.weight, reps: s.reps, manual: s.manual };
    const key = `${s.exerciseId} ${s.date}`;
    const had = byKey.get(key);
    if (!had || point.e1rm > had.e1rm) byKey.set(key, point);
  }
  const out: Record<string, LiftPoint[]> = {};
  for (const { id, ...p } of byKey.values()) (out[id] ??= []).push(p);
  for (const list of Object.values(out)) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
