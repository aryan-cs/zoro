import { useEffect, useState } from 'react';
import { buildPlan, openSession, startSession, today } from '../core/store';
import type { TemplateId, WorkoutSession } from '../core/types';
import type { SFName } from './sf';
import { db } from './kit';

/** A rest between sets that's counting down: when it started and when it ends. */
export interface RunningRest {
  after: string;
  startedAt?: number;
  endsAt: number;
}

/** Where a workout keeps its running rest, so leaving and coming back (or the Lift tab) can see it. */
export const restKey = (sessionId: number) => `zoro.rest.${sessionId}`;

export function readRest(sessionId: number): RunningRest | null {
  try {
    const r = JSON.parse(localStorage.getItem(restKey(sessionId)) ?? 'null') as RunningRest | null;
    return r && r.endsAt > Date.now() ? r : null;
  } catch {
    return null;
  }
}

/** The rest running in a workout now (null when there isn't one), checked each second. */
export function useRunningRest(sessionId: number | undefined): RunningRest | null {
  const [rest, setRest] = useState<RunningRest | null>(() => (sessionId === undefined ? null : readRest(sessionId)));
  useEffect(() => {
    if (sessionId === undefined) return setRest(null);
    let last = '';
    const check = () => {
      const r = readRest(sessionId);
      const key = JSON.stringify(r);
      if (key !== last) {
        last = key;
        setRest(r);
      }
    };
    check();
    const t = window.setInterval(check, 1000);
    return () => window.clearInterval(t);
  }, [sessionId]);
  return rest;
}

/** Today's unfinished workout, if any (see openSession). */
export function activeSession(): Promise<WorkoutSession | undefined> {
  return openSession(db);
}

/**
 * Resume an unfinished session of this workout, or start a new one. Returns its id. A past `date`
 * logs it for that day (a workout you did but didn't log at the time).
 */
export async function startWorkout(templateId: TemplateId, date: string = today()): Promise<number> {
  const sameDay = (await db.sessions.where('date').equals(date).toArray())
    .filter((s) => s.templateId === templateId && !s.finishedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (sameDay?.id !== undefined) return sameDay.id;
  const plan = await buildPlan(templateId, date, db);
  return startSession(plan, date, db);
}

/** The Fitness workout glyph for each session. */
export const TEMPLATE_GLYPH: Record<TemplateId, SFName> = {
  upperA: 'figure.strengthtraining.traditional',
  lowerA: 'figure.strengthtraining.traditional',
  arms: 'figure.strengthtraining.traditional',
  upperB: 'figure.strengthtraining.traditional',
  lowerB: 'figure.strengthtraining.traditional',
  pmForearms: 'figure.strengthtraining.functional',
  pmAbs: 'figure.core.training',
  pmArms: 'figure.strengthtraining.functional',
  pmCardio: 'figure.walk',
  extra: 'figure.strengthtraining.functional',
};

/** The optional workout offered by weekday (0 = Sunday): see optionalForWeekday. */
export { optionalForWeekday } from '../core/program';

/**
 * The workout whose rest ended last (its rest is kept until the next set starts), else today's
 * unfinished one: what a "Your rest is over" notification opens.
 */
export async function restingSession(): Promise<number | undefined> {
  let best: { id: number; endsAt: number } | undefined;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^zoro\.rest\.(\d+)$/.exec(localStorage.key(i) ?? '');
      if (!m) continue;
      const endsAt = Number((JSON.parse(localStorage.getItem(m[0]) ?? 'null') as RunningRest | null)?.endsAt);
      if (Number.isFinite(endsAt) && (!best || endsAt > best.endsAt)) best = { id: Number(m[1]), endsAt };
    }
  } catch {
    /* none readable */
  }
  if (best) {
    const s = await db.sessions.get(best.id);
    if (s && !s.finishedAt) return best.id;
  }
  return (await activeSession())?.id;
}
