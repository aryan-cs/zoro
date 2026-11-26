import { useSyncExternalStore } from 'react';

/**
 * Your free Gemini key for photo logging. Like the GitHub token (sync.ts), it's kept in this
 * phone's local storage only: not in the database, so never in a backup, and never logged.
 */

const KEY = 'zoro.gemini';

function load(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? ((JSON.parse(v) as { key?: string }).key ?? null) : null;
  } catch {
    return null;
  }
}

let current: string | null = load();
const listeners = new Set<() => void>();

export const aiKey = (): string | null => current;

export function setAiKey(key: string | null): void {
  current = key?.trim() || null;
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify({ key: current }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the key works until the app closes.
  }
  listeners.forEach((l) => l());
}

/** The saved key (null if none), kept current. */
export function useAiKey(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
