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
  onProgress,
}: {
  client: GraphQLClient;
  onProgress?: (progress: FetchProgress) => void;
}) => {
  // Fetch the GraphQL and REST lists concurrently: ghosts are inferred by
  // diffing them, so the closer in time they're read, the fewer follows that
  // changed in between get misclassified (and the faster the sync).
  const [networkData, restFollowing, restFollowers] = await Promise.all([
    fetchAllUserFollowersAndFollowing({ client, onProgress }),
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
    viewerLogin: networkData.viewerLogin,
    followers,
    following,
    ghosts: mergeGhosts(followingGhosts, followerGhosts),
    graphqlFollowingLogins: new Set(
      graphqlFollowing.map((user) => user.login.toLowerCase())
    ),
  };
};
