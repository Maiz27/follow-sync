import type { GraphQLClient } from 'graphql-request';

import {
  fetchAllUserFollowersAndFollowing,
  fetchRestFollowers,
  fetchRestFollowing,
  type FetchProgress,
  type RestFollowingEntry,
} from '@/lib/gql/fetchers';
import { createRetryBudget } from '@/lib/rateLimit';
import type { NetworkUser } from '@/lib/types';
import { classifyFollowers, classifyFollowing, mergeGhosts } from '@/lib/utils';

const hasLogin = (user: NetworkUser | null | undefined): user is NetworkUser =>
  Boolean(user?.login);

/**
 * Fetches every GraphQL and REST page before classifying any connection.
 * A rejected pagination request therefore leaves no partial list available to
 * the classifiers, and aborts the other paginations instead of letting them
 * keep spending rate limit on a sync that has already failed.
 */
export const fetchAndClassifyNetwork = async ({
  client,
  onProgress,
  onRateLimitPause,
  signal,
}: {
  client: GraphQLClient;
  onProgress?: (progress: FetchProgress) => void;
  /** Called before the sync sits out a rate limit, with the wait in ms. */
  onRateLimitPause?: (waitMs: number) => void;
  /** Aborts every pagination, e.g. when a newer sync supersedes this one. */
  signal?: AbortSignal;
}) => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  const options = {
    signal: controller.signal,
    onPause: onRateLimitPause,
    // One budget for the whole sync, so concurrent paginations can't each
    // wait out rate limits in turn for an unbounded total.
    retryBudget: createRetryBudget(),
  };
  const abortSiblingsOnFailure = <T>(promise: Promise<T>) =>
    promise.catch((error: unknown) => {
      controller.abort(error);
      throw error;
    });

  // Fetch the GraphQL and REST lists concurrently: ghosts are inferred by
  // diffing them, so the closer in time they're read, the fewer follows that
  // changed in between get misclassified (and the faster the sync).
  let networkData: Awaited<
    ReturnType<typeof fetchAllUserFollowersAndFollowing>
  >;
  let restFollowing: RestFollowingEntry[];
  let restFollowers: RestFollowingEntry[];
  try {
    [networkData, restFollowing, restFollowers] = await Promise.all([
      abortSiblingsOnFailure(
        fetchAllUserFollowersAndFollowing({ client, onProgress, ...options })
      ),
      abortSiblingsOnFailure(fetchRestFollowing(options)),
      abortSiblingsOnFailure(fetchRestFollowers(options)),
    ]);
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
  }

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
