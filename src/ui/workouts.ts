import { useEffect, useState } from 'react';
import { addDays } from '../core/calc';
import { buildPlan, startSession, today } from '../core/store';
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

/** The newest unfinished workout from today or yesterday, if any. */
export async function activeSession(): Promise<WorkoutSession | undefined> {
  const recent = await db.sessions.where('date').aboveOrEqual(addDays(today(), -1)).toArray();
  return recent.filter((s) => !s.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** Resume an unfinished session of this workout, or start a new one. Returns its id. */
export async function startWorkout(templateId: TemplateId): Promise<number> {
  const open = await activeSession();
  if (open?.id !== undefined && open.templateId === templateId) return open.id;
  const plan = await buildPlan(templateId, today(), db);
  return startSession(plan, today(), db);
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
};

/** Optional second session by weekday (0 = Sunday). */
export const SECOND_BY_WEEKDAY: Partial<Record<number, TemplateId>> = { 1: 'pmCardio', 2: 'pmForearms', 3: 'pmAbs', 4: 'pmCardio', 6: 'pmForearms' };
