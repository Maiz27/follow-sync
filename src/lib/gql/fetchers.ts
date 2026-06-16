import { GET_USER_FOLLOWERS_AND_FOLLOWING } from '@/lib/gql/queries';
import { FOLLOW_USER, UNFOLLOW_USER } from '@/lib/gql/mutations';

import type {
  FollowerFieldsFragment,
  FollowingFieldsFragment,
  FollowUserMutation,
  FollowUserMutationVariables,
  GetUserFollowersAndFollowingQuery,
  GetUserFollowersAndFollowingQueryVariables,
  UnfollowUserMutation,
  UnfollowUserMutationVariables,
  User,
} from '@/lib/gql/types';
import { GraphQLClient } from 'graphql-request';
import { ghRest, ghRestOk } from '@/lib/ghRest';

/**
 * Defines the shape of the progress update object.
 */
export interface FetchProgress {
  fetchedFollowers: number;
  totalFollowers: number;
  fetchedFollowing: number;
  totalFollowing: number;
  hasFollowerTotalMismatch: boolean;
  hasFollowingTotalMismatch: boolean;
  // We can add more details here later, like the current user being fetched.
}

type GraphQLErrorLike = {
  response?: {
    errors?: Array<{
      message?: string;
    }>;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a transient-failing async task with exponential backoff. GitHub's
 * GraphQL endpoint occasionally returns 5xx/secondary-rate-limit errors during
 * long paginated syncs; a few bounded retries make large-network fetches far
 * more resilient than the previous fail-on-first-error behaviour.
 */
const withRetry = async <T>(
  task: () => Promise<T>,
  { retries = 3, baseDelayMs = 500 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      // Exponential backoff with jitter.
      const delay = baseDelayMs * 2 ** attempt + Math.floor(attempt * 137);
      await sleep(delay);
    }
  }
  throw lastError;
};

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (typeof error === 'object' && error !== null) {
    const graphQLError = error as GraphQLErrorLike;
    const responseMessage = graphQLError.response?.errors?.[0]?.message;

    if (responseMessage) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
};

const getAccountKey = (user: Pick<User, 'id' | 'login'>) =>
  user.id || user.login.toLowerCase();

const mergeUniqueUsers = (
  target: User[],
  incoming: User[] | null | undefined,
  seen: Set<string>
) => {
  if (!incoming?.length) return;

  for (const user of incoming) {
    if (!user?.login) continue;

    const accountKey = getAccountKey(user);
    if (seen.has(accountKey)) continue;

    seen.add(accountKey);
    target.push(user);
  }
};

/**
 * Fetches all followers and following for a given GitHub user, with progress reporting.
 * @param client - The authenticated GraphQL client.
 * @param username - The GitHub username to fetch data for.
 * @param onProgress - An optional callback function that receives progress updates.
 */
export const fetchAllUserFollowersAndFollowing = async ({
  client,
  username,
  onProgress,
}: {
  client: GraphQLClient;
  username: string;
  onProgress?: (progress: FetchProgress) => void;
}) => {
  const allFollowers: Pick<FollowerFieldsFragment, 'nodes' | 'totalCount'> = {
    nodes: [],
    totalCount: 0,
  };
  const allFollowing: Pick<FollowingFieldsFragment, 'nodes' | 'totalCount'> = {
    nodes: [],
    totalCount: 0,
  };
  const seenFollowerAccounts = new Set<string>();
  const seenFollowingAccounts = new Set<string>();

  let hasNextPageFollowers = true;
  let hasNextPageFollowing = true;

  let currentCursorFollowers: string | null = null;
  let currentCursorFollowing: string | null = null;

  const pageSize = 100;

  while (hasNextPageFollowers || hasNextPageFollowing) {
    const variables: GetUserFollowersAndFollowingQueryVariables = {
      login: username,
      firstFollowers: hasNextPageFollowers ? pageSize : 0,
      afterFollowers: currentCursorFollowers,
      firstFollowing: hasNextPageFollowing ? pageSize : 0,
      afterFollowing: currentCursorFollowing,
    };

    try {
      const data = await withRetry(() =>
        client.request<
          GetUserFollowersAndFollowingQuery,
          GetUserFollowersAndFollowingQueryVariables
        >(GET_USER_FOLLOWERS_AND_FOLLOWING, variables)
      );

      if (hasNextPageFollowers && data.user?.followers) {
        const { nodes, totalCount, pageInfo } = data.user.followers;
        mergeUniqueUsers(
          allFollowers.nodes as User[],
          nodes as User[],
          seenFollowerAccounts
        );
        if (allFollowers.totalCount === 0) {
          allFollowers.totalCount = totalCount;
        }
        hasNextPageFollowers = pageInfo?.hasNextPage || false;
        currentCursorFollowers = pageInfo?.endCursor || null;
      }

      if (hasNextPageFollowing && data.user?.following) {
        const { nodes, totalCount, pageInfo } = data.user.following;
        mergeUniqueUsers(
          allFollowing.nodes as User[],
          nodes as User[],
          seenFollowingAccounts
        );
        if (allFollowing.totalCount === 0) {
          allFollowing.totalCount = totalCount;
        }
        hasNextPageFollowing = pageInfo?.hasNextPage || false;
        currentCursorFollowing = pageInfo?.endCursor || null;
      }

      onProgress?.({
        fetchedFollowers: allFollowers.nodes?.length || 0,
        totalFollowers: allFollowers.totalCount,
        fetchedFollowing: allFollowing.nodes?.length || 0,
        totalFollowing: allFollowing.totalCount,
        hasFollowerTotalMismatch:
          (allFollowers.nodes?.length || 0) > allFollowers.totalCount,
        hasFollowingTotalMismatch:
          (allFollowing.nodes?.length || 0) > allFollowing.totalCount,
      });

      if (hasNextPageFollowers || hasNextPageFollowing) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error: unknown) {
      console.error('Error fetching paginated follow data:', error);
      throw new Error(
        getErrorMessage(error, 'Failed to fetch paginated follow data.')
      );
    }
  }

  return { followers: allFollowers, following: allFollowing };
};

const REST_FOLLOWING_PATH = '/user/following';
const REST_FOLLOWERS_PATH = '/user/followers';
const REST_PER_PAGE = 100;

/**
 * A single entry from the REST `/user/following` list. Unlike the GraphQL
 * `following` connection, the REST list includes organizations (exposed via
 * `type`) and excludes deleted/suspended accounts — the exact inverse of the
 * GraphQL behaviour. We diff the two to classify orgs and ghosts.
 */
export type RestFollowingEntry = {
  login: string;
  nodeId: string;
  avatarUrl: string;
  htmlUrl: string;
  type: 'User' | 'Organization';
};

type RawRestUser = {
  login: string;
  node_id: string;
  avatar_url: string;
  html_url: string;
  type: 'User' | 'Organization';
};

const fetchRestUserList = async (
  path: string
): Promise<RestFollowingEntry[]> => {
  const all: RestFollowingEntry[] = [];

  for (let page = 1; ; page++) {
    const pageItems = await withRetry(async () => {
      const data = await ghRest<RawRestUser[]>(
        `${path}?per_page=${REST_PER_PAGE}&page=${page}`
      );
      return data ?? [];
    });
    if (!pageItems.length) break;

    for (const item of pageItems) {
      all.push({
        login: item.login,
        nodeId: item.node_id,
        avatarUrl: item.avatar_url,
        htmlUrl: item.html_url,
        type: item.type,
      });
    }

    if (pageItems.length < REST_PER_PAGE) break;
  }

  return all;
};

/**
 * Fetches the authenticated user's full following list via the REST API
 * (through the same-origin proxy). Used alongside the GraphQL fetch to recover
 * organizations (which GraphQL omits) and to detect ghosts (logins present in
 * GraphQL but absent here).
 */
export const fetchRestFollowing = () =>
  fetchRestUserList(REST_FOLLOWING_PATH);

/**
 * Fetches the authenticated user's full followers list via the REST API. Used
 * to detect ghosts among followers (deleted accounts that GraphQL still lists
 * as followers but REST drops).
 */
export const fetchRestFollowers = () =>
  fetchRestUserList(REST_FOLLOWERS_PATH);

/**
 * Unfollows an account by login via the REST API. This works for ghost
 * accounts (deleted/suspended) that the GraphQL `unfollowUser` mutation
 * cannot remove because it requires a live node id. Returns `true` when the
 * follow was removed (HTTP 204).
 */
export const removeFollowingByLogin = ({
  login,
}: {
  login: string;
}): Promise<boolean> =>
  ghRestOk(`${REST_FOLLOWING_PATH}/${encodeURIComponent(login)}`, {
    method: 'DELETE',
  });

export const followUser = async ({
  client,
  userId,
}: {
  client: GraphQLClient;
  userId: string;
}) => {
  try {
    const response = await client.request<
      FollowUserMutation,
      FollowUserMutationVariables
    >(FOLLOW_USER, { userId });
    return response;
  } catch (error: unknown) {
    console.error('Error following user:', error);
    throw new Error(getErrorMessage(error, 'Failed to follow user.'));
  }
};

export const unfollowUser = async ({
  client,
  userId,
}: {
  client: GraphQLClient;
  userId: string;
}) => {
  try {
    const response = await client.request<
      UnfollowUserMutation,
      UnfollowUserMutationVariables
    >(UNFOLLOW_USER, { userId });
    return response;
  } catch (error: unknown) {
    console.error('Error unfollowing user:', error);
    throw new Error(getErrorMessage(error, 'Failed to unfollow user.'));
  }
};
