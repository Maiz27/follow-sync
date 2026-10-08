import { create } from 'zustand';
import { NetworkUser } from '@/lib/types';
import { getNonMutuals } from '@/lib/utils';

type Network = {
  followers: NetworkUser[];
  following: NetworkUser[];
};

export type NetworkState = {
  network: Network;
  nonMutuals: {
    nonMutualsFollowingYou: NetworkUser[];
    nonMutualsYouFollow: NetworkUser[];
  };
  /**
   * Journal of local follow/unfollow changes. A sync reads GitHub over several
   * seconds (minutes for large networks); changes made meanwhile may be missing
   * from what it fetched. The journal lets the sync re-apply them on top of the
   * fetched lists instead of silently overwriting them.
   */
  pendingOps: PendingOp[];
};

export type PendingOp = {
  id: number;
  kind: 'follow' | 'unfollow';
  user: NetworkUser;
  startedAt: number;
  /** When GitHub confirmed the change; undefined while still in flight. */
  settledAt?: number;
};

/**
 * Handle for one optimistic change. `rollback` undoes only this change (other
 * changes made since are kept); `commit` records that GitHub confirmed it.
 */
export type OptimisticHandle = {
  rollback: () => void;
  commit: () => void;
};

export type NetworkActions = {
  setNetwork: (network: Network) => void;
  /**
   * Replaces the network with freshly synced lists, re-applying any local
   * change that may not be reflected in them (see `pendingOps`).
   */
  reconcileNetwork: (network: Network, syncStartedAt: number) => void;
  /**
   * Optimistically add a followed user (no-op if already followed),
   * recomputing non-mutuals.
   */
  optimisticFollow: (user: NetworkUser) => OptimisticHandle;
  /** Optimistically remove a followed user, recomputing non-mutuals. */
  optimisticUnfollow: (user: NetworkUser) => OptimisticHandle;
  /**
   * Back to the empty state for another account. Handles of changes made
   * before the reset become no-ops, so a late rollback can't edit the next
   * account's network.
   */
  reset: () => void;
};

export type NetworkStore = NetworkState & NetworkActions;

/**
 * Confirmed changes are still re-applied for this long after they settle, since
 * GitHub's GraphQL lists are eventually consistent and a sync that starts right
 * after a change can still read the old state.
 */
export const PENDING_OP_GRACE_MS = 2 * 60 * 1000;

const initialState: NetworkState = {
  network: { followers: [], following: [] },
  nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
  pendingOps: [],
};

const setNetworkState = (network: Network) => ({
  network,
  nonMutuals: getNonMutuals(network),
});

const isSameUser = (a: NetworkUser, b: NetworkUser) =>
  (Boolean(a.id) && a.id === b.id) ||
  a.login.toLowerCase() === b.login.toLowerCase();

const withFollow = (following: NetworkUser[], user: NetworkUser) =>
  following.some((u) => isSameUser(u, user)) ? following : [...following, user];

const withoutUser = (following: NetworkUser[], user: NetworkUser) =>
  following.filter((u) => !isSameUser(u, user));

/**
 * Applies journaled follow/unfollow changes onto a network, idempotently.
 * Exported for tests.
 */
export const applyPendingOps = (network: Network, ops: PendingOp[]): Network =>
  ops.reduce<Network>(
    (acc, op) => ({
      ...acc,
      following:
        op.kind === 'follow'
          ? withFollow(acc.following, op.user)
          : withoutUser(acc.following, op.user),
    }),
    network
  );

let nextOpId = 1;

export const useNetworkStore = create<NetworkStore>((set, get) => {
  // Bumped by `reset`; a handle only acts within the account it was made for.
  let accountEpoch = 0;
  const scoped = (fn: () => void) => {
    const epoch = accountEpoch;
    return () => {
      if (epoch === accountEpoch) fn();
    };
  };

  const addOp = (kind: PendingOp['kind'], user: NetworkUser) => {
    const op: PendingOp = {
      id: nextOpId++,
      kind,
      user,
      startedAt: Date.now(),
    };
    set({ pendingOps: [...get().pendingOps, op] });
    return op.id;
  };

  const dropOp = (id: number) =>
    set({ pendingOps: get().pendingOps.filter((op) => op.id !== id) });

  const settleOp = (id: number) =>
    set({
      pendingOps: get().pendingOps.map((op) =>
        op.id === id ? { ...op, settledAt: Date.now() } : op
      ),
    });

  return {
    ...initialState,
    setNetwork: (network) => {
      set(setNetworkState(network));
    },
    reconcileNetwork: (network, syncStartedAt) => {
      const cutoff = syncStartedAt - PENDING_OP_GRACE_MS;
      // Ops confirmed well before the sync started are already reflected in
      // what it fetched; everything else is re-applied on top.
      const relevant = get().pendingOps.filter(
        (op) => op.settledAt === undefined || op.settledAt >= cutoff
      );
      set({
        ...setNetworkState(applyPendingOps(network, relevant)),
        pendingOps: relevant,
      });
    },
    optimisticFollow: (user) => {
      const { network } = get();
      if (network.following.some((u) => isSameUser(u, user))) {
        // Already followed: nothing to add, so nothing to undo.
        return { rollback: () => undefined, commit: () => undefined };
      }
      set(
        setNetworkState({
          ...network,
          following: withFollow(network.following, user),
        })
      );
      const opId = addOp('follow', user);
      return {
        // Targeted undo: remove only this user from the *current* list, so
        // follows/unfollows made concurrently (or a sync that landed) survive.
        rollback: scoped(() => {
          dropOp(opId);
          const current = get().network;
          set(
            setNetworkState({
              ...current,
              following: withoutUser(current.following, user),
            })
          );
        }),
        commit: scoped(() => settleOp(opId)),
      };
    },
    optimisticUnfollow: (user) => {
      const { network } = get();
      const index = network.following.findIndex((u) => isSameUser(u, user));
      if (index === -1) {
        return { rollback: () => undefined, commit: () => undefined };
      }
      const removed = network.following[index];
      set(
        setNetworkState({
          ...network,
          following: withoutUser(network.following, user),
        })
      );
      const opId = addOp('unfollow', removed);
      return {
        // Targeted undo: put this one user back near its old position.
        rollback: scoped(() => {
          dropOp(opId);
          const current = get().network;
          if (current.following.some((u) => isSameUser(u, removed))) return;
          const following = [...current.following];
          following.splice(Math.min(index, following.length), 0, removed);
          set(setNetworkState({ ...current, following }));
        }),
        commit: scoped(() => settleOp(opId)),
      };
    },
    reset: () => {
      accountEpoch++;
      set(initialState);
    },
  };
});
