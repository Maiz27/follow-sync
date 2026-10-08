import { create } from 'zustand';

/**
 * Accounts the user never wants suggested in the One-Way lists ("don't tell me
 * to unfollow @x"). Persisted in the cache gist alongside the network, keyed by
 * lowercased login.
 */
export type IgnoreStore = {
  ignoredLogins: Set<string>;
  setIgnoredLogins: (logins: string[]) => void;
  ignore: (login: string) => void;
  unignore: (login: string) => void;
  reset: () => void;
};

export const useIgnoreStore = create<IgnoreStore>((set, get) => ({
  ignoredLogins: new Set(),
  setIgnoredLogins: (logins) =>
    set({ ignoredLogins: new Set(logins.map((l) => l.toLowerCase())) }),
  ignore: (login) => {
    const next = new Set(get().ignoredLogins);
    next.add(login.toLowerCase());
    set({ ignoredLogins: next });
  },
  unignore: (login) => {
    const next = new Set(get().ignoredLogins);
    next.delete(login.toLowerCase());
    set({ ignoredLogins: next });
  },
  reset: () => set({ ignoredLogins: new Set() }),
}));

export const isIgnored = (ignored: ReadonlySet<string>, login: string) =>
  ignored.has(login.toLowerCase());
