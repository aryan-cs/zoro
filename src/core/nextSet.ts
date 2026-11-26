/**
 * The set to do next in a workout: the first one not yet logged after the set you logged last,
 * going on down the list and coming back around to the top for any you skipped. With nothing
 * logged yet, the first set.
 */
export function nextSet(order: string[], done: Set<string>, last?: string): string | undefined {
  const from = last === undefined ? -1 : order.indexOf(last);
  const around = from < 0 ? order : [...order.slice(from + 1), ...order.slice(0, from + 1)];
  return around.find((k) => !done.has(k));
}
