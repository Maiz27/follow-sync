import { useSession } from 'next-auth/react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNetworkStore } from '@/lib/store/network';
import { followUser, unfollowUser } from '@/lib/gql/fetchers';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { UserInfoFragment } from '@/lib/gql/types';
import { useModalsStore } from '@/lib/store/modals';
import { useCacheManager } from './useCacheManager';

export const useFollowManager = () => {
  const { client } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { network, setNetwork } = useNetworkStore();
  const { persistChanges } = useCacheManager();
  const { incrementActionCount } = useModalsStore();

  const followMutation = useMutation({
    mutationFn: (userToFollow: UserInfoFragment) => {
      if (!client) throw new Error('GraphQL client not available');
      return followUser({ client, userId: userToFollow.id });
    },
    onMutate: async (userToFollow: UserInfoFragment) => {
      const previousNetwork = network;
      const newFollowing = [...network.following, userToFollow];
      const newNetwork = { ...network, following: newFollowing };
      setNetwork(newNetwork);
      return { previousNetwork };
    },
    onError: (err, userToFollow, context) => {
      if (context?.previousNetwork) {
        setNetwork(context.previousNetwork);
      }
      toast.error(`Failed to follow @${userToFollow.login}: ${err.message}`);
    },
    onSettled: () => {
      if (session?.accessToken) {
        persistChanges();
      }
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (userToUnfollow: UserInfoFragment) => {
      if (!client) throw new Error('GraphQL client not available');
      return unfollowUser({ client, userId: userToUnfollow.id });
    },
    onMutate: async (userToUnfollow: UserInfoFragment) => {
      const previousNetwork = network;
      const newFollowing = network.following.filter(
        (u) => u.id !== userToUnfollow.id
      );
      const newNetwork = { ...network, following: newFollowing };
      setNetwork(newNetwork);
      return { previousNetwork };
    },
    onError: (err, userToUnfollow, context) => {
      if (context?.previousNetwork) {
        setNetwork(context.previousNetwork);
      }
      toast.error(
        `Failed to unfollow @${userToUnfollow.login}: ${err.message}`
      );
    },
    onSettled: () => {
      if (session?.accessToken) {
        persistChanges();
      }
    },
  });

  return {
    followMutation,
    unfollowMutation,
    incrementActionCount,
  };
};
