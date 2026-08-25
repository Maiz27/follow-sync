import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLClient } from 'graphql-request';

const restMocks = vi.hoisted(() => ({
  ghRest: vi.fn(),
  ghRestOk: vi.fn(),
}));

vi.mock('@/lib/ghRest', () => restMocks);

import {
  fetchAllUserFollowersAndFollowing,
  fetchRestFollowing,
} from '@/lib/gql/fetchers';
import type { GetUserFollowersAndFollowingQuery } from '@/lib/gql/types';

const makeGraphqlUser = (login: string) => ({
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: `https://avatars.example/${login}.png`,
  url: `https://github.com/${login}`,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
});

const firstGraphqlPage = {
  user: {
    followers: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    },
    following: {
      totalCount: 101,
      pageInfo: { hasNextPage: true, endCursor: 'following-page-1' },
      nodes: [makeGraphqlUser('first-page-user')],
    },
  },
} satisfies GetUserFollowersAndFollowingQuery;

const makeRawRestUser = (index: number) => ({
  login: `user-${index}`,
  node_id: `node-${index}`,
  avatar_url: `https://avatars.example/user-${index}.png`,
  html_url: `https://github.com/user-${index}`,
  type: 'User',
});

describe('paginated follow fetchers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects the GraphQL fetch instead of returning page 1 when page 2 fails', async () => {
    const client = new GraphQLClient('https://example.test/graphql');
    const request = vi.spyOn(client, 'request');
    request.mockResolvedValueOnce(firstGraphqlPage);
    request.mockRejectedValue(new Error('GraphQL page 2 failed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fetchPromise = fetchAllUserFollowersAndFollowing({
      client,
      username: 'octocat',
    });
    const rejection = expect(fetchPromise).rejects.toThrow(
      'GraphQL page 2 failed'
    );

    await vi.runAllTimersAsync();
    await rejection;

    expect(request).toHaveBeenCalledTimes(5);
  });

  it('rejects the REST fetch instead of returning page 1 when page 2 fails', async () => {
    restMocks.ghRest.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, index) => makeRawRestUser(index))
    );
    restMocks.ghRest.mockRejectedValue(new Error('REST page 2 failed'));

    const fetchPromise = fetchRestFollowing();
    const rejection =
      expect(fetchPromise).rejects.toThrow('REST page 2 failed');

    await vi.runAllTimersAsync();
    await rejection;

    expect(restMocks.ghRest).toHaveBeenCalledTimes(5);
    expect(restMocks.ghRest).toHaveBeenNthCalledWith(
      2,
      '/user/following?per_page=100&page=2'
    );
  });
});
