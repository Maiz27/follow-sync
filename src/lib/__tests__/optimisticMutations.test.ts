import { beforeEach, describe, expect, it } from 'vitest';

import { useNetworkStore } from '@/lib/store/network';
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

describe('network store optimistic mutations', () => {
  beforeEach(() => {
    useNetworkStore.setState({
      network: { followers: [], following: [] },
      nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
    });
  });

  it('optimisticFollow adds the user and recomputes non-mutuals; rollback restores', () => {
    const { setNetwork } = useNetworkStore.getState();
    setNetwork({ followers: [], following: [makeUser('existing')] });

    const rollback = useNetworkStore.getState().optimisticFollow(makeUser('new'));

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

    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['existing']);
    expect(
      useNetworkStore.getState().nonMutuals.nonMutualsYouFollow.map((u) => u.login)
    ).not.toContain('new');
  });

  it('optimisticUnfollow removes by id; rollback restores', () => {
    const { setNetwork } = useNetworkStore.getState();
    const target = makeUser('target');
    setNetwork({ followers: [], following: [makeUser('keep'), target] });

    const rollback = useNetworkStore.getState().optimisticUnfollow(target.id);

    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['keep']);

    rollback();

    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['keep', 'target']);
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
});
