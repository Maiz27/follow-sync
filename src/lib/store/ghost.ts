import { create } from 'zustand';
import { NetworkUser } from '@/lib/types';

export type GhostState = {
  ghosts: NetworkUser[];
  ghostsSet: Set<string>;
  /**
   * Lowercased logins of ghosts already removed — used to suppress GitHub's
   * eventually-consistent GraphQL `following` from re-surfacing them.
   */
  removedGhostLogins: Set<string>;
};

export type GhostActions = {
  setGhosts: (ghosts: NetworkUser[]) => void;
  removeGhosts: (logins: string[]) => void;
  setRemovedGhostLogins: (logins: string[]) => void;
  isGhost: (login: string) => boolean;
};

export type GhostStore = GhostState & GhostActions;

const initialState: GhostState = {
  ghosts: [],
  ghostsSet: new Set(),
  removedGhostLogins: new Set(),
};

export const useGhostStore = create<GhostStore>((set, get) => ({
  ...initialState,
  setGhosts: (ghosts) => {
    set({
      ghosts,
      ghostsSet: new Set(ghosts.map((g) => g.login)),
    });
  },
  removeGhosts: (logins) => {
    const removed = new Set(logins.map((l) => l.toLowerCase()));
    const remaining = get().ghosts.filter(
      (g) => !removed.has(g.login.toLowerCase())
    );
    const tombstone = new Set(get().removedGhostLogins);
    removed.forEach((l) => tombstone.add(l));
    set({
      ghosts: remaining,
      ghostsSet: new Set(remaining.map((g) => g.login)),
      removedGhostLogins: tombstone,
    });
  },
  setRemovedGhostLogins: (logins) => {
    set({ removedGhostLogins: new Set(logins.map((l) => l.toLowerCase())) });
  },
  isGhost: (login) => {
    return get().ghostsSet.has(login);
  },
}));
