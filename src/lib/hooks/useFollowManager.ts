import { useSession } from 'next-auth/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCacheStore, CacheStoreState } from '@/lib/store/cache';
import { followUser, unfollowUser } from '@/lib/gql/fetchers';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { QUERY_KEY_USER_NETWORK } from '@/lib/constants';
import { getNonMutuals } from '@/lib/utils';
import { UserInfoFragment } from '@/lib/gql/types';
import { CachedData } from '@/lib/types';

export const useFollowManager = (username?: string) => {
  const { client } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { getState, gistName, writeCache } = useCacheStore((state) => ({
    getState: state.getState,
    gistName: state.gistName,
    writeCache: state.writeCache,
  }));

  const persistChanges = async () => {
    if (!session?.accessToken) return;

    const queryState = queryClient.getQueryData<CacheStoreState>([
      QUERY_KEY_USER_NETWORK,
      username,
    ]);
    if (!queryState) return;

    const fullState = getState();
    const dataToCache: CachedData = {
      network: queryState.network,
      ghosts: fullState.ghosts,
      timestamp: Date.now(),
      metadata: {
        totalConnections:
          queryState.network.followers.length +
          queryState.network.following.length,
        fetchDuration: fullState.metadata?.fetchDuration || 0,
        cacheVersion: fullState.metadata?.cacheVersion || '1.0',
      },
    };

    await writeCache(session.accessToken, dataToCache, gistName);
  };

  const followMutation = useMutation({
    mutationFn: (userToFollow: UserInfoFragment) => {
      if (!client) throw new Error('GraphQL client not available');
      return followUser({ client, userId: userToFollow.id });
    },
    onMutate: async (userToFollow: UserInfoFragment) => {
      await queryClient.cancelQueries({
        queryKey: [QUERY_KEY_USER_NETWORK, username],
      });

      const previousState = queryClient.getQueryData<CacheStoreState>([
        QUERY_KEY_USER_NETWORK,
        username,
      ]);

      queryClient.setQueryData<CacheStoreState>(
        [QUERY_KEY_USER_NETWORK, username],
        (old) => {
          if (!old) return old;

          const newFollowing = [...old.network.following, userToFollow];
          const newNetwork = { ...old.network, following: newFollowing };
          const newNonMutuals = getNonMutuals(newNetwork);

          return {
            ...old,
            network: newNetwork,
            nonMutuals: newNonMutuals,
          };
        }
      );

      return { previousState };
    },
    onError: (err, userToFollow, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(
          [QUERY_KEY_USER_NETWORK, username],
          context.previousState
        );
      }
    },
    onSuccess: persistChanges,
  });

  const unfollowMutation = useMutation({
    mutationFn: (userToUnfollow: UserInfoFragment) => {
      if (!client) throw new Error('GraphQL client not available');
      return unfollowUser({ client, userId: userToUnfollow.id });
    },
    onMutate: async (userToUnfollow: UserInfoFragment) => {
      await queryClient.cancelQueries({
        queryKey: [QUERY_KEY_USER_NETWORK, username],
      });

      const previousState = queryClient.getQueryData<CacheStoreState>([
        QUERY_KEY_USER_NETWORK,
        username,
      ]);

      queryClient.setQueryData<CacheStoreState>(
        [QUERY_KEY_USER_NETWORK, username],
        (old) => {
          if (!old) return old;

          const newFollowing = old.network.following.filter(
            (u) => u.id !== userToUnfollow.id
          );
          const newNetwork = { ...old.network, following: newFollowing };
          const newNonMutuals = getNonMutuals(newNetwork);

          return {
            ...old,
            network: newNetwork,
            nonMutuals: newNonMutuals,
          };
        }
      );

      return { previousState };
    },
    onError: (err, userToUnfollow, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(
          [QUERY_KEY_USER_NETWORK, username],
          context.previousState
        );
      }
    },
    onSuccess: persistChanges,
  });

  return { followMutation, unfollowMutation };
};
