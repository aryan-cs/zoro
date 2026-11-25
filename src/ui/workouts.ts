import { addDays } from '../core/calc';
import { buildPlan, startSession, today } from '../core/store';
import type { TemplateId, WorkoutSession } from '../core/types';
import { db } from './kit';

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
