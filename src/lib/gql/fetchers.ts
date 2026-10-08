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
import {
  RateLimitError,
  sleep,
  withRetry,
  type RetryBudget,
} from '@/lib/rateLimit';

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

/** Options shared by the paginated fetchers of one sync. */
export type PaginationOptions = {
  /** Aborts the pagination (in-flight request, retries and waits). */
  signal?: AbortSignal;
  /** Called before sitting out a rate limit, with the wait in ms. */
  onPause?: (waitMs: number) => void;
  /** Shared cap on how long the whole sync may wait out rate limits. */
  retryBudget?: RetryBudget;
};

const retryOptions = ({ signal, onPause, retryBudget }: PaginationOptions) => ({
  signal,
  onPause,
  budget: retryBudget,
});

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

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
 * Fetches all followers and following of the signed-in user (GraphQL `viewer`),
 * with progress reporting. Also returns the viewer's current login as GitHub
 * reports it, which can differ from the login captured at sign-in.
 * @param client - The authenticated GraphQL client.
 * @param onProgress - An optional callback function that receives progress updates.
 */
export const fetchAllUserFollowersAndFollowing = async ({
  client,
  onProgress,
  ...options
}: {
  client: GraphQLClient;
  onProgress?: (progress: FetchProgress) => void;
} & PaginationOptions) => {
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
  let viewerLogin: string | null = null;

  while (hasNextPageFollowers || hasNextPageFollowing) {
    const variables: GetUserFollowersAndFollowingQueryVariables = {
      firstFollowers: hasNextPageFollowers ? pageSize : 0,
      afterFollowers: currentCursorFollowers,
      firstFollowing: hasNextPageFollowing ? pageSize : 0,
      afterFollowing: currentCursorFollowing,
    };

    try {
      const data = await withRetry(
        () =>
          client.request<
            GetUserFollowersAndFollowingQuery,
            GetUserFollowersAndFollowingQueryVariables
          >({
            document: GET_USER_FOLLOWERS_AND_FOLLOWING,
            variables,
            signal: options.signal,
          }),
        retryOptions(options)
      );
      options.signal?.throwIfAborted();

      viewerLogin = data.viewer?.login ?? viewerLogin;

      if (hasNextPageFollowers && data.viewer?.followers) {
        const { nodes, totalCount, pageInfo } = data.viewer.followers;
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

      if (hasNextPageFollowing && data.viewer?.following) {
        const { nodes, totalCount, pageInfo } = data.viewer.following;
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
        await sleep(200, options.signal);
      }
    } catch (error: unknown) {
      if (options.signal?.aborted || isAbortError(error)) throw error;
      console.error('Error fetching paginated follow data:', error);
      if (error instanceof RateLimitError) throw error;
      throw new Error(
        getErrorMessage(error, 'Failed to fetch paginated follow data.'),
        { cause: error }
      );
    }
  }

  return { followers: allFollowers, following: allFollowing, viewerLogin };
};

const REST_FOLLOWING_PATH = '/user/following';
const REST_FOLLOWERS_PATH = '/user/followers';
const REST_PER_PAGE = 100;

/**
 * A single entry from a REST follow list. REST exposes the account `type`, so
 * the classifier can restore organizations that cannot appear in GraphQL's
 * `FollowingConnection`, whose nodes are schema-typed as `User`.
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
  path: string,
  options: PaginationOptions = {}
): Promise<RestFollowingEntry[]> => {
  const all: RestFollowingEntry[] = [];

  for (let page = 1; ; page++) {
    const pageItems = await withRetry(async () => {
      const data = await ghRest<RawRestUser[]>(
        `${path}?per_page=${REST_PER_PAGE}&page=${page}`,
        { signal: options.signal }
      );
      return data ?? [];
    }, retryOptions(options));
    options.signal?.throwIfAborted();
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
 * organizations that GraphQL's User-only `FollowingConnection` cannot return
 * and to infer ghosts from entries present only in the completed GraphQL list.
 */
export const fetchRestFollowing = (options?: PaginationOptions) =>
  fetchRestUserList(REST_FOLLOWING_PATH, options);

/**
 * Fetches the authenticated user's full followers list via the REST API. Once
 * both paginated lists complete, GraphQL-only entries are treated as ghosts
 * under the API behavior observed by this app.
 */
export const fetchRestFollowers = (options?: PaginationOptions) =>
  fetchRestUserList(REST_FOLLOWERS_PATH, options);

/**
 * Unfollows an inferred ghost by login via the REST API. This path does not
 * require the live node id expected by the GraphQL `unfollowUser` mutation.
 * Returns `true` when the follow was removed (HTTP 204).
 */
export const removeFollowingByLogin = ({
  login,
}: {
  login: string;
}): Promise<boolean> =>
  ghRestOk(`${REST_FOLLOWING_PATH}/${encodeURIComponent(login)}`, {
    method: 'DELETE',
  });

/**
 * Whether the signed-in user follows `login`, via REST
 * `GET /user/following/{login}`: 204 means following, 404 means not. Used to
 * confirm a ghost removal that 404'd (deleted/suspended accounts do).
 */
export const isFollowingLogin = ({
  login,
}: {
  login: string;
}): Promise<boolean> =>
  ghRestOk(`${REST_FOLLOWING_PATH}/${encodeURIComponent(login)}`, {
    method: 'GET',
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
    // Keep the original as `cause` so rate limits stay detectable upstream.
    throw new Error(getErrorMessage(error, 'Failed to follow user.'), {
      cause: error,
    });
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
    throw new Error(getErrorMessage(error, 'Failed to unfollow user.'), {
      cause: error,
    });
  }
};
