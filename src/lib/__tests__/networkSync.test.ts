import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLClient } from 'graphql-request';

const mocks = vi.hoisted(() => ({
  fetchGraphql: vi.fn(),
  fetchRestFollowing: vi.fn(),
  fetchRestFollowers: vi.fn(),
}));

vi.mock('@/lib/gql/fetchers', () => ({
  fetchAllUserFollowersAndFollowing: mocks.fetchGraphql,
  fetchRestFollowing: mocks.fetchRestFollowing,
  fetchRestFollowers: mocks.fetchRestFollowers,
}));

import { fetchAndClassifyNetwork } from '@/lib/networkSync';
import type { RestFollowingEntry } from '@/lib/gql/fetchers';
import type { NetworkUser } from '@/lib/types';

const client = new GraphQLClient('https://example.test/graphql');

const makeUser = (login: string): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: `https://avatars.example/${login}.png`,
  url: `https://github.com/${login}`,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
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

describe('fetchAndClassifyNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates a GraphQL fetch rejection before starting REST fetches', async () => {
    mocks.fetchGraphql.mockRejectedValue(
      new Error('GraphQL pagination failed')
    );

    await expect(
      fetchAndClassifyNetwork({ client, username: 'octocat' })
    ).rejects.toThrow('GraphQL pagination failed');

    expect(mocks.fetchRestFollowing).not.toHaveBeenCalled();
    expect(mocks.fetchRestFollowers).not.toHaveBeenCalled();
  });

  it('propagates a REST fetch rejection without returning classified data', async () => {
    mocks.fetchGraphql.mockResolvedValue({
      followers: { nodes: [makeUser('follower')], totalCount: 1 },
      following: { nodes: [makeUser('following')], totalCount: 1 },
    });
    mocks.fetchRestFollowing.mockRejectedValue(
      new Error('REST pagination failed')
    );
    mocks.fetchRestFollowers.mockResolvedValue([]);

    await expect(
      fetchAndClassifyNetwork({ client, username: 'octocat' })
    ).rejects.toThrow('REST pagination failed');
  });

  it('runs the real classifiers after every fetch completes', async () => {
    mocks.fetchGraphql.mockResolvedValue({
      followers: {
        nodes: [makeUser('ActiveFollower'), makeUser('FollowerGhost')],
        totalCount: 2,
      },
      following: {
        nodes: [makeUser('ActiveFollowing'), makeUser('FollowingGhost')],
        totalCount: 2,
      },
    });
    mocks.fetchRestFollowing.mockResolvedValue([
      makeRestEntry('activefollowing'),
      makeRestEntry('AcmeOrg', 'Organization'),
    ]);
    mocks.fetchRestFollowers.mockResolvedValue([
      makeRestEntry('activefollower'),
    ]);

    const result = await fetchAndClassifyNetwork({
      client,
      username: 'octocat',
    });

    expect(result.followers).toEqual([
      expect.objectContaining({
        login: 'ActiveFollower',
        accountType: 'user',
      }),
    ]);
    expect(result.following).toEqual([
      expect.objectContaining({
        login: 'ActiveFollowing',
        accountType: 'user',
      }),
      expect.objectContaining({
        login: 'AcmeOrg',
        accountType: 'organization',
      }),
    ]);
    expect(result.ghosts).toEqual([
      expect.objectContaining({
        login: 'FollowingGhost',
        accountType: 'ghost',
        removable: true,
      }),
      expect.objectContaining({
        login: 'FollowerGhost',
        accountType: 'ghost',
        removable: false,
      }),
    ]);
    expect(result.graphqlFollowingLogins).toEqual(
      new Set(['activefollowing', 'followingghost'])
    );
  });
});
