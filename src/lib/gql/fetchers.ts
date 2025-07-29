import { GET_USER_FOLLOWERS_AND_FOLLOWING } from '@/lib/gql/queries';
import type {
  FollowerFieldsFragment,
  FollowingFieldsFragment,
  GetUserFollowersAndFollowingQuery,
  GetUserFollowersAndFollowingQueryVariables,
} from '@/lib/gql/types';
import { GraphQLClient } from 'graphql-request';

export const fetchAllUserFollowersAndFollowing = async ({
  client,
  username,
}: {
  client: GraphQLClient;
  username: string;
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

  const pageSize = 100; // Your desired page size for fetching

  // Continue looping as long as either followers or following still has a next page
  while (hasNextPageFollowers || hasNextPageFollowing) {
    const _variables: GetUserFollowersAndFollowingQueryVariables = {
      login: username,
      // Only request next page if it exists for followers
      firstFollowers: hasNextPageFollowers ? pageSize : 0,
      afterFollowers: currentCursorFollowers,
      // Only request next page if it exists for following
      firstFollowing: hasNextPageFollowing ? pageSize : 0,
      afterFollowing: currentCursorFollowing,
    };

    try {
      const data = await client.request<
        GetUserFollowersAndFollowingQuery,
        GetUserFollowersAndFollowingQueryVariables
      >(GET_USER_FOLLOWERS_AND_FOLLOWING, _variables);

      // Process Followers data
      if (hasNextPageFollowers) {
        // Only process if we were expecting more
        const currentFollowerNodes = data.user?.followers.nodes || [];
        allFollowers.nodes?.push(...currentFollowerNodes);
        // totalCount should be set once from the first page, or updated if it can change
        if (
          allFollowers.totalCount === 0 &&
          data.user?.followers.totalCount !== undefined
        ) {
          allFollowers.totalCount = data.user.followers.totalCount;
        }

        hasNextPageFollowers =
          data.user?.followers.pageInfo?.hasNextPage || false;
        currentCursorFollowers =
          data.user?.followers.pageInfo?.endCursor || null;
      }

      // Process Following data
      if (hasNextPageFollowing) {
        // Only process if we were expecting more
        const currentFollowingNodes = data.user?.following.nodes || [];
        allFollowing.nodes?.push(...currentFollowingNodes);
        if (
          allFollowing.totalCount === 0 &&
          data.user?.following.totalCount !== undefined
        ) {
          allFollowing.totalCount = data.user.following.totalCount;
        }

        hasNextPageFollowing =
          data.user?.following.pageInfo?.hasNextPage || false;
        currentCursorFollowing =
          data.user?.following.pageInfo?.endCursor || null;
      }

      // Small delay between requests to be polite to the GitHub API
      if (hasNextPageFollowers || hasNextPageFollowing) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error fetching all follow and following data:', error);
      throw new Error(
        error.message || 'Failed to fetch all follow and following data.'
      );
    }
  }

  return { followers: allFollowers, following: allFollowing };
};
