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

/** Restores the pre-mutation ghost state. Call on mutation failure. */
export type Rollback = () => void;

export type GhostActions = {
  setGhosts: (ghosts: NetworkUser[]) => void;
  removeGhosts: (logins: string[]) => void;
  /**
   * Optimistically remove a ghost by login, returning a rollback that undoes
   * only this removal (re-adds the ghost and clears its tombstone) if the REST
   * removal fails — other ghosts removed meanwhile stay removed.
   */
  optimisticRemoveGhost: (login: string) => Rollback;
  setRemovedGhostLogins: (logins: string[]) => void;
  isGhost: (login: string) => boolean;
  /**
   * Back to the empty state for another account; rollbacks returned before
   * the reset become no-ops.
   */
  reset: () => void;
};

export type GhostStore = GhostState & GhostActions;

const initialState: GhostState = {
  ghosts: [],
  ghostsSet: new Set(),
  removedGhostLogins: new Set(),
};

// Bumped by `reset`; a rollback only acts within the account it was made for.
let accountEpoch = 0;

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
  optimisticRemoveGhost: (login) => {
    const key = login.toLowerCase();
    const before = get().ghosts;
    const index = before.findIndex((g) => g.login.toLowerCase() === key);
    const removed = index === -1 ? null : before[index];
    const wasTombstoned = get().removedGhostLogins.has(key);
    get().removeGhosts([login]);
    const epoch = accountEpoch;

    return () => {
      if (epoch !== accountEpoch) return;
      const { ghosts, removedGhostLogins } = get();
      const nextGhosts = [...ghosts];
      if (removed && !ghosts.some((g) => g.login.toLowerCase() === key)) {
        nextGhosts.splice(Math.min(index, nextGhosts.length), 0, removed);
      }
      const tombstone = new Set(removedGhostLogins);
      if (!wasTombstoned) tombstone.delete(key);
      set({
        ghosts: nextGhosts,
        ghostsSet: new Set(nextGhosts.map((g) => g.login)),
        removedGhostLogins: tombstone,
      });
    };
  },
  setRemovedGhostLogins: (logins) => {
    set({ removedGhostLogins: new Set(logins.map((l) => l.toLowerCase())) });
  },
  isGhost: (login) => {
    return get().ghostsSet.has(login);
  },
  reset: () => {
    accountEpoch++;
    set({
      ghosts: [],
      ghostsSet: new Set(),
      removedGhostLogins: new Set(),
    });
  },
}));
