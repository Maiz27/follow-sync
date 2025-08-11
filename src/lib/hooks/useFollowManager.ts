import { useSession } from 'next-auth/react';
import { useMutation } from '@tanstack/react-query';
import { useCacheStore } from '@/lib/store/cache';
import { followUser, unfollowUser } from '@/lib/gql/fetchers';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { getNonMutuals } from '@/lib/utils';
import { UserInfoFragment } from '@/lib/gql/types';
import { CachedData } from '@/lib/types';

export const useFollowManager = () => {
  const { client } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { getState, gistName, writeCache, updateNetwork } = useCacheStore();

  const persistChanges = async () => {
    if (!session?.accessToken) return;

    const currentState = getState();
    const { network, ghosts, metadata } = currentState;

    if (!network) return;

    const dataToCache: CachedData = {
      network,
      ghosts,
      timestamp: Date.now(),
      metadata: {
        totalConnections:
          network.followers.length + network.following.length,
        fetchDuration: metadata?.fetchDuration || 0,
        cacheVersion: metadata?.cacheVersion || '1.0',
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
      const previousState = getState();
      const newFollowing = [...previousState.network.following, userToFollow];
      const newNetwork = { ...previousState.network, following: newFollowing };
      const newNonMutuals = getNonMutuals(newNetwork);

      updateNetwork({ network: newNetwork, nonMutuals: newNonMutuals });

      return { previousState };
    },
    onError: (err, userToFollow, context) => {
      if (context?.previousState) {
        updateNetwork({
          network: context.previousState.network,
          nonMutuals: context.previousState.nonMutuals,
        });
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
      const previousState = getState();
      const newFollowing = previousState.network.following.filter(
        (u) => u.id !== userToUnfollow.id
      );
      const newNetwork = { ...previousState.network, following: newFollowing };
      const newNonMutuals = getNonMutuals(newNetwork);

      updateNetwork({ network: newNetwork, nonMutuals: newNonMutuals });

      return { previousState };
    },
    onError: (err, userToUnfollow, context) => {
      if (context?.previousState) {
        updateNetwork({
          network: context.previousState.network,
          nonMutuals: context.previousState.nonMutuals,
        });
      }
    },
    onSuccess: persistChanges,
  });

  return { followMutation, unfollowMutation };
};
