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

  it('propagates a GraphQL fetch rejection', async () => {
    mocks.fetchGraphql.mockRejectedValue(
      new Error('GraphQL pagination failed')
    );
    mocks.fetchRestFollowing.mockResolvedValue([]);
    mocks.fetchRestFollowers.mockResolvedValue([]);

    await expect(fetchAndClassifyNetwork({ client })).rejects.toThrow(
      'GraphQL pagination failed'
    );
  });

  it('fetches the GraphQL and REST lists concurrently', async () => {
    let resolveGraphql: (value: unknown) => void = () => undefined;
    mocks.fetchGraphql.mockReturnValue(
      new Promise((resolve) => {
        resolveGraphql = resolve;
      })
    );
    mocks.fetchRestFollowing.mockResolvedValue([]);
    mocks.fetchRestFollowers.mockResolvedValue([]);

    const pending = fetchAndClassifyNetwork({ client });

    // REST is already in flight while GraphQL is still paginating.
    expect(mocks.fetchRestFollowing).toHaveBeenCalled();
    expect(mocks.fetchRestFollowers).toHaveBeenCalled();

    resolveGraphql({
      followers: { nodes: [], totalCount: 0 },
      following: { nodes: [], totalCount: 0 },
    });
    await expect(pending).resolves.toMatchObject({ followers: [] });
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

    await expect(fetchAndClassifyNetwork({ client })).rejects.toThrow(
      'REST pagination failed'
    );
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

    const result = await fetchAndClassifyNetwork({ client });

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

  describe('cancellation', () => {
    /** A fetch that only settles when its signal aborts. */
    const untilAborted = (options?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(options.signal?.reason)
        );
      });

    it('aborts the sibling paginations when one of them fails', async () => {
      mocks.fetchGraphql.mockRejectedValue(new Error('GraphQL failed'));
      mocks.fetchRestFollowing.mockImplementation(untilAborted);
      mocks.fetchRestFollowers.mockImplementation(untilAborted);

      await expect(fetchAndClassifyNetwork({ client })).rejects.toThrow(
        'GraphQL failed'
      );

      const restSignal = mocks.fetchRestFollowing.mock.calls[0][0]?.signal;
      expect(restSignal).toBeInstanceOf(AbortSignal);
      expect(restSignal.aborted).toBe(true);
      expect(mocks.fetchRestFollowers.mock.calls[0][0].signal.aborted).toBe(
        true
      );
    });

    it('aborts every pagination when the caller aborts (superseded sync)', async () => {
      mocks.fetchGraphql.mockImplementation(
        ({ signal }: { signal?: AbortSignal }) => untilAborted({ signal })
      );
      mocks.fetchRestFollowing.mockImplementation(untilAborted);
      mocks.fetchRestFollowers.mockImplementation(untilAborted);
      const controller = new AbortController();

      const pending = fetchAndClassifyNetwork({
        client,
        signal: controller.signal,
      });
      controller.abort(new DOMException('Superseded', 'AbortError'));

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(mocks.fetchGraphql.mock.calls[0][0].signal.aborted).toBe(true);
    });

    it('passes rate-limit pauses and one shared wait budget to every fetch', async () => {
      const onRateLimitPause = vi.fn();
      mocks.fetchGraphql.mockResolvedValue({
        followers: { nodes: [], totalCount: 0 },
        following: { nodes: [], totalCount: 0 },
      });
      mocks.fetchRestFollowing.mockResolvedValue([]);
      mocks.fetchRestFollowers.mockResolvedValue([]);

      await fetchAndClassifyNetwork({ client, onRateLimitPause });

      const graphqlOptions = mocks.fetchGraphql.mock.calls[0][0];
      const restOptions = mocks.fetchRestFollowing.mock.calls[0][0];
      expect(graphqlOptions.onPause).toBe(onRateLimitPause);
      expect(restOptions.onPause).toBe(onRateLimitPause);
      expect(restOptions.retryBudget).toBe(graphqlOptions.retryBudget);
    });
  });
});
