import type { GraphQLClient } from 'graphql-request';

import {
  fetchAllUserFollowersAndFollowing,
  fetchRestFollowers,
  fetchRestFollowing,
  type FetchProgress,
} from '@/lib/gql/fetchers';
import type { NetworkUser } from '@/lib/types';
import { classifyFollowers, classifyFollowing, mergeGhosts } from '@/lib/utils';

const hasLogin = (user: NetworkUser | null | undefined): user is NetworkUser =>
  Boolean(user?.login);

/**
 * Fetches every GraphQL and REST page before classifying any connection.
 * A rejected pagination request therefore leaves no partial list available to
 * the classifiers.
 */
export const fetchAndClassifyNetwork = async ({
  client,
  username,
  onProgress,
}: {
  client: GraphQLClient;
  username: string;
  onProgress?: (progress: FetchProgress) => void;
}) => {
  const networkData = await fetchAllUserFollowersAndFollowing({
    client,
    username,
    onProgress,
  });

  const [restFollowing, restFollowers] = await Promise.all([
    fetchRestFollowing(),
    fetchRestFollowers(),
  ]);

  const graphqlFollowers = (networkData.followers.nodes ?? []).filter(hasLogin);
  const graphqlFollowing = (networkData.following.nodes ?? []).filter(hasLogin);

  const { followers, ghosts: followerGhosts } = classifyFollowers({
    graphqlFollowers,
    restFollowers,
  });
  const { following, ghosts: followingGhosts } = classifyFollowing({
    graphqlFollowing,
    restFollowing,
  });

  return {
    followers,
    following,
    ghosts: mergeGhosts(followingGhosts, followerGhosts),
    graphqlFollowingLogins: new Set(
      graphqlFollowing.map((user) => user.login.toLowerCase())
    ),
  };
};
