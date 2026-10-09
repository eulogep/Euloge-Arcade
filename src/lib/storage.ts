/**
 * localStorage wrapper that never throws (private mode, blocked storage, quota...).
 * Only used for per-browser conveniences and guest data.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: data simply won't persist.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  settings: 'ea:settings',
  favorites: 'ea:favorites',
  history: 'ea:history',
  runs: 'ea:runs',
  achievements: 'ea:achievements',
} as const;
