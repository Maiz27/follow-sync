import { GET_USER_FOLLOWERS_AND_FOLLOWING } from '@/lib/gql/queries';
import type {
  FollowerFieldsFragment,
  FollowingFieldsFragment,
  GetUserFollowersAndFollowingQuery,
  GetUserFollowersAndFollowingQueryVariables,
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
  // We can add more details here later, like the current user being fetched.
}

/**
 * Fetches all followers and following for a given GitHub user, with progress reporting.
 * @param client - The authenticated GraphQL client.
 * @param username - The GitHub username to fetch data for.
 * @param onProgress - An optional callback function that receives progress updates.
 */
export const fetchAllUserFollowersAndFollowing = async ({
  client,
  username,
  onProgress, // The new callback parameter
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

      // Process Followers data
      if (hasNextPageFollowers && data.user?.followers) {
        const { nodes, totalCount, pageInfo } = data.user.followers;
        allFollowers.nodes?.push(...(nodes as User[]));
        if (allFollowers.totalCount === 0) {
          allFollowers.totalCount = totalCount;
        }
        hasNextPageFollowers = pageInfo?.hasNextPage || false;
        currentCursorFollowers = pageInfo?.endCursor || null;
      }

      // Process Following data
      if (hasNextPageFollowing && data.user?.following) {
        const { nodes, totalCount, pageInfo } = data.user.following;
        allFollowing.nodes?.push(...(nodes as User[]));
        if (allFollowing.totalCount === 0) {
          allFollowing.totalCount = totalCount;
        }
        hasNextPageFollowing = pageInfo?.hasNextPage || false;
        currentCursorFollowing = pageInfo?.endCursor || null;
      }

      // *** Report Progress ***
      // Invoke the callback with the latest numbers after each API call.
      onProgress?.({
        fetchedFollowers: allFollowers.nodes?.length || 0,
        totalFollowers: allFollowers.totalCount,
        fetchedFollowing: allFollowing.nodes?.length || 0,
        totalFollowing: allFollowing.totalCount,
      });

      // Small delay to be polite to the GitHub API
      if (hasNextPageFollowers || hasNextPageFollowing) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error fetching paginated follow data:', error);
      // Re-throw the error to be caught by React Query
      throw new Error(
        error.response?.errors?.[0]?.message ||
          'Failed to fetch paginated follow data.'
      );
    }
  }

  return { followers: allFollowers, following: allFollowing };
};
