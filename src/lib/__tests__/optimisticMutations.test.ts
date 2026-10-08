import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PENDING_OP_GRACE_MS,
  applyPendingOps,
  useNetworkStore,
} from '@/lib/store/network';
import { useGhostStore } from '@/lib/store/ghost';
import type { NetworkUser } from '@/lib/types';

const makeUser = (
  login: string,
  accountType: NetworkUser['accountType'] = 'user'
): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: `https://avatars.example/${login}.png`,
  url: `https://github.com/${login}`,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType,
});

const followingLogins = () =>
  useNetworkStore.getState().network.following.map((u) => u.login);

describe('network store optimistic mutations', () => {
  beforeEach(() => {
    useNetworkStore.setState({
      network: { followers: [], following: [] },
      nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
      pendingOps: [],
    });
  });

  it('optimisticFollow adds the user and recomputes non-mutuals; rollback restores', () => {
    const { setNetwork } = useNetworkStore.getState();
    setNetwork({ followers: [], following: [makeUser('existing')] });

    const { rollback } = useNetworkStore
      .getState()
      .optimisticFollow(makeUser('new'));

    const afterFollow = useNetworkStore.getState();
    expect(afterFollow.network.following.map((u) => u.login)).toEqual([
      'existing',
      'new',
    ]);
    // 'new' has no follow-back, so it's a one-way-out non-mutual.
    expect(
      afterFollow.nonMutuals.nonMutualsYouFollow.map((u) => u.login)
    ).toContain('new');

    rollback();

    expect(followingLogins()).toEqual(['existing']);
    expect(
      useNetworkStore
        .getState()
        .nonMutuals.nonMutualsYouFollow.map((u) => u.login)
    ).not.toContain('new');
  });

  it('optimisticFollow does not duplicate an already-followed user', () => {
    useNetworkStore
      .getState()
      .setNetwork({ followers: [], following: [makeUser('dup')] });

    const { rollback } = useNetworkStore
      .getState()
      .optimisticFollow(makeUser('dup'));
    expect(followingLogins()).toEqual(['dup']);

    // Undoing a no-op must not remove the pre-existing follow.
    rollback();
    expect(followingLogins()).toEqual(['dup']);
  });

  it('optimisticUnfollow removes the user; rollback restores its position', () => {
    const { setNetwork } = useNetworkStore.getState();
    const target = makeUser('target');
    setNetwork({
      followers: [],
      following: [makeUser('keep'), target, makeUser('last')],
    });

    const { rollback } = useNetworkStore.getState().optimisticUnfollow(target);

    expect(followingLogins()).toEqual(['keep', 'last']);

    rollback();

    expect(followingLogins()).toEqual(['keep', 'target', 'last']);
  });

  it('rollback only undoes its own change, keeping concurrent ones', () => {
    useNetworkStore.getState().setNetwork({ followers: [], following: [] });

    const first = useNetworkStore.getState().optimisticFollow(makeUser('a'));
    useNetworkStore.getState().optimisticFollow(makeUser('b'));

    // 'a' fails after 'b' was applied — 'b' must survive the rollback.
    first.rollback();

    expect(followingLogins()).toEqual(['b']);
  });

  it('rollback does not resurrect state replaced by a sync that landed meanwhile', () => {
    useNetworkStore.getState().setNetwork({ followers: [], following: [] });
    const { rollback } = useNetworkStore
      .getState()
      .optimisticFollow(makeUser('a'));

    useNetworkStore
      .getState()
      .reconcileNetwork(
        { followers: [makeUser('fresh-follower')], following: [makeUser('x')] },
        Date.now()
      );
    rollback();

    const { network } = useNetworkStore.getState();
    expect(network.following.map((u) => u.login)).toEqual(['x']);
    expect(network.followers.map((u) => u.login)).toEqual(['fresh-follower']);
  });
});

describe('sync reconciliation', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useNetworkStore.setState({
      network: { followers: [], following: [] },
      nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
      pendingOps: [],
    });
  });

  it('re-applies follows/unfollows made while a sync was running', () => {
    const store = useNetworkStore.getState();
    store.setNetwork({
      followers: [],
      following: [makeUser('old'), makeUser('gone')],
    });
    const syncStartedAt = Date.now();

    // During the refresh: follow 'new' and unfollow 'gone'.
    store.optimisticFollow(makeUser('new')).commit();
    store.optimisticUnfollow(makeUser('gone')).commit();

    // The sync fetched GitHub before those changes landed.
    useNetworkStore
      .getState()
      .reconcileNetwork(
        { followers: [], following: [makeUser('old'), makeUser('gone')] },
        syncStartedAt
      );

    expect(followingLogins()).toEqual(['old', 'new']);
  });

  it('drops changes confirmed long before the sync started', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useNetworkStore.getState().optimisticFollow(makeUser('ancient')).commit();

    vi.setSystemTime(PENDING_OP_GRACE_MS * 2);
    // GitHub (the source of truth) no longer has the follow.
    useNetworkStore
      .getState()
      .reconcileNetwork({ followers: [], following: [] }, Date.now());

    expect(followingLogins()).toEqual([]);
    expect(useNetworkStore.getState().pendingOps).toEqual([]);
    vi.useRealTimers();
  });

  it('applyPendingOps is idempotent', () => {
    const user = makeUser('a');
    const ops = [
      { id: 1, kind: 'follow' as const, user, startedAt: 0 },
      { id: 2, kind: 'follow' as const, user, startedAt: 1 },
    ];
    const result = applyPendingOps({ followers: [], following: [user] }, ops);
    expect(result.following).toHaveLength(1);
  });
});

describe('ghost store optimistic removal', () => {
  beforeEach(() => {
    useGhostStore.setState({
      ghosts: [],
      ghostsSet: new Set(),
      removedGhostLogins: new Set(),
    });
  });

  it('optimisticRemoveGhost drops the ghost and tombstones it; rollback restores all of it', () => {
    const { setGhosts } = useGhostStore.getState();
    setGhosts([
      { ...makeUser('g1', 'ghost'), removable: true },
      { ...makeUser('g2', 'ghost'), removable: true },
    ]);

    const rollback = useGhostStore.getState().optimisticRemoveGhost('g1');

    const afterRemove = useGhostStore.getState();
    expect(afterRemove.ghosts.map((g) => g.login)).toEqual(['g2']);
    expect(afterRemove.ghostsSet.has('g1')).toBe(false);
    expect(afterRemove.removedGhostLogins.has('g1')).toBe(true);

    rollback();

    const afterRollback = useGhostStore.getState();
    expect(afterRollback.ghosts.map((g) => g.login)).toEqual(['g1', 'g2']);
    expect(afterRollback.ghostsSet.has('g1')).toBe(true);
    expect(afterRollback.removedGhostLogins.has('g1')).toBe(false);
  });

  it('rolling back one removal keeps a concurrent removal', () => {
    useGhostStore.getState().setGhosts([
      { ...makeUser('g1', 'ghost'), removable: true },
      { ...makeUser('g2', 'ghost'), removable: true },
    ]);

    const rollbackG1 = useGhostStore.getState().optimisticRemoveGhost('g1');
    useGhostStore.getState().optimisticRemoveGhost('g2');
    rollbackG1();

    const state = useGhostStore.getState();
    expect(state.ghosts.map((g) => g.login)).toEqual(['g1']);
    expect(state.removedGhostLogins.has('g2')).toBe(true);
    expect(state.removedGhostLogins.has('g1')).toBe(false);
  });
});
