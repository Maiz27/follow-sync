import { LEGACY_GIST_ID_STORAGE_KEY, USER_STORAGE_PREFIX } from './constants';

/**
 * Thin, never-throwing wrappers around `localStorage`. Storage can be missing
 * (SSR), disabled (privacy mode) or full; none of that should break the app,
 * since everything stored here is a convenience that can be rebuilt.
 */
const getStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const readStorage = (key: string): string | null => {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const writeStorage = (key: string, value: string | null) => {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore quota/permission errors — see note above.
  }
};

/**
 * Removes every account-scoped key (and the legacy global gist id). Called on
 * sign-out so the next person on this browser starts clean.
 */
export const clearUserStorage = () => {
  try {
    const storage = getStorage();
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(USER_STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    storage.removeItem(LEGACY_GIST_ID_STORAGE_KEY);
  } catch {
    // Best effort.
  }
};
