/** Where a workout keeps its running rest (localStorage), readable before anything else loads. */
export const restKey = (sessionId: number) => `zoro.rest.${sessionId}`;

/**
 * The workout whose rest ends last (a rest is kept until the next set starts), read straight from
 * storage, so a "Your rest is over" link can open it on the very first frame.
 */
export function latestRestSession(): number | undefined {
  let best: { id: number; endsAt: number } | undefined;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^zoro\.rest\.(\d+)$/.exec(localStorage.key(i) ?? '');
      if (!m) continue;
      const endsAt = Number((JSON.parse(localStorage.getItem(m[0]) ?? 'null') as { endsAt?: number } | null)?.endsAt);
      if (Number.isFinite(endsAt) && (!best || endsAt > best.endsAt)) best = { id: Number(m[1]), endsAt };
    }
  } catch {
    /* none readable */
  }
  return best?.id;
}

/** Whether the page was opened from a rest notification's link (?open=workout). */
export const openedForWorkout = (search: string) => new URLSearchParams(search).get('open') === 'workout';
