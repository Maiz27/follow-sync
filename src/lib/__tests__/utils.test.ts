import { describe, it, expect } from 'vitest';
import {
  getNonMutuals,
  classifyFollowing,
  classifyFollowers,
  mergeGhosts,
  formatNumber,
  timeAgo,
} from '@/lib/utils';
import type { NetworkUser } from '@/lib/types';
import type { RestFollowingEntry } from '@/lib/gql/fetchers';

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

const makeRestEntry = (
  login: string,
  type: RestFollowingEntry['type'] = 'User'
): RestFollowingEntry => ({
  login,
  nodeId: `node-${login}`,
  avatarUrl: `https://avatars.example/${login}.png`,
  htmlUrl: `https://github.com/${login}`,
  type,
});

describe('getNonMutuals', () => {
  it('excludes mutual connections from both outputs', () => {
    const mutual = makeUser('mutual');
    const onlyFollowsYou = makeUser('fan');
    const onlyYouFollow = makeUser('idol');

    const { nonMutualsFollowingYou, nonMutualsYouFollow } = getNonMutuals({
      followers: [mutual, onlyFollowsYou],
      following: [mutual, onlyYouFollow],
    });

    expect(nonMutualsFollowingYou.map((u) => u.login)).toEqual(['fan']);
    expect(nonMutualsYouFollow.map((u) => u.login)).toEqual(['idol']);
  });

  it('excludes organizations and ghosts from both outputs', () => {
    const org = makeUser('acme', 'organization');
    const ghost = makeUser('deleted', 'ghost');
    const realUser = makeUser('real');

    const { nonMutualsFollowingYou, nonMutualsYouFollow } = getNonMutuals({
      followers: [ghost, realUser],
      following: [org, ghost, realUser],
    });

    // realUser is mutual -> excluded; org and ghost excluded by accountType.
    expect(nonMutualsYouFollow).toEqual([]);
    expect(nonMutualsFollowingYou).toEqual([]);
  });

  it('handles empty inputs', () => {
    const { nonMutualsFollowingYou, nonMutualsYouFollow } = getNonMutuals({
      followers: [],
      following: [],
    });
    expect(nonMutualsFollowingYou).toEqual([]);
    expect(nonMutualsYouFollow).toEqual([]);
  });
});

describe('classifyFollowing', () => {
  it('classifies ghosts, orgs, and active users and keeps counts consistent', () => {
    // GraphQL returns active users AND ghosts (but no orgs).
    const graphqlFollowing: NetworkUser[] = [
      makeUser('activeOne'),
      makeUser('activeTwo'),
      makeUser('ghostOne'),
    ];
    // REST returns active users AND orgs (but no ghosts).
    const restFollowing: RestFollowingEntry[] = [
      makeRestEntry('activeOne', 'User'),
      makeRestEntry('activeTwo', 'User'),
      makeRestEntry('acmeOrg', 'Organization'),
    ];

    const { following, ghosts } = classifyFollowing({
      graphqlFollowing,
      restFollowing,
    });

    const ghostLogins = ghosts.map((u) => u.login);
    expect(ghostLogins).toEqual(['ghostOne']);
    expect(ghosts.every((u) => u.accountType === 'ghost')).toBe(true);

    const byLogin = new Map(following.map((u) => [u.login, u]));
    expect(byLogin.get('activeOne')?.accountType).toBe('user');
    expect(byLogin.get('activeTwo')?.accountType).toBe('user');
    // Org recovered from REST (absent from GraphQL).
    expect(byLogin.get('acmeOrg')?.accountType).toBe('organization');

    // Every GraphQL login lands in exactly one of following/ghosts, plus the
    // recovered org appended to following.
    expect(following.length + ghosts.length).toBe(
      graphqlFollowing.length + 1
    );
  });

  it('matches logins case-insensitively', () => {
    const { following, ghosts } = classifyFollowing({
      graphqlFollowing: [makeUser('CamelCase')],
      restFollowing: [makeRestEntry('camelcase', 'User')],
    });
    expect(ghosts).toEqual([]);
    expect(following[0]?.accountType).toBe('user');
  });
});

describe('classifyFollowers', () => {
  it('flags followers missing from REST as non-removable ghosts', () => {
    const { followers, ghosts } = classifyFollowers({
      graphqlFollowers: [makeUser('active'), makeUser('deadFan')],
      restFollowers: [makeRestEntry('active', 'User')],
    });

    expect(followers.map((u) => u.login)).toEqual(['active']);
    expect(ghosts.map((u) => u.login)).toEqual(['deadFan']);
    expect(ghosts[0]?.accountType).toBe('ghost');
    expect(ghosts[0]?.removable).toBe(false);
  });
});

describe('mergeGhosts', () => {
  it('dedupes by login and prefers the removable entry', () => {
    const followingGhost = { ...makeUser('both', 'ghost'), removable: true };
    const followerGhost = { ...makeUser('both', 'ghost'), removable: false };
    const followerOnly = { ...makeUser('fanGhost', 'ghost'), removable: false };

    const merged = mergeGhosts([followingGhost], [followerGhost, followerOnly]);

    expect(merged).toHaveLength(2);
    expect(merged.find((g) => g.login === 'both')?.removable).toBe(true);
    expect(merged.find((g) => g.login === 'fanGhost')?.removable).toBe(false);
  });
});

describe('formatNumber', () => {
  it('returns small numbers as-is without a suffix', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });

  it('abbreviates large numbers with a + suffix', () => {
    expect(formatNumber(1500)).toBe('1.5K+');
    expect(formatNumber(1000)).toBe('1K+');
    expect(formatNumber(2_000_000)).toBe('2M+');
  });
});

describe('timeAgo', () => {
  it('returns "just now" for the current moment', () => {
    expect(timeAgo(Date.now())).toBe('just now');
  });

  it('returns a singular unit label', () => {
    expect(timeAgo(Date.now() - 60 * 1000)).toBe('1 minute ago');
  });

  it('returns a pluralized unit label', () => {
    expect(timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5 minutes ago');
  });
});
