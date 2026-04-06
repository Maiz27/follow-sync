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
      const data = await client.request<
        GetUserFollowersAndFollowingQuery,
        GetUserFollowersAndFollowingQueryVariables
      >(GET_USER_FOLLOWERS_AND_FOLLOWING, variables);

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
