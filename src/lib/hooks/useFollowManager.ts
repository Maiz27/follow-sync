import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNetworkStore } from '@/lib/store/network';
import { followUser, unfollowUser } from '@/lib/gql/fetchers';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { UserInfoFragment } from '@/lib/gql/types';
import { useModalsStore } from '@/lib/store/modals';
import { useCacheManager } from './useCacheManager';

type FollowMutationInput = {
  user: UserInfoFragment;
  persist?: boolean;
};

export const useFollowManager = () => {
  const { client } = useClientAuthenticatedGraphQLClient();
  const { network, setNetwork } = useNetworkStore();
  const { persistChanges } = useCacheManager();
  const { incrementActionCount } = useModalsStore();

  const followMutation = useMutation({
    mutationFn: ({ user }: FollowMutationInput) => {
      if (!client) throw new Error('GraphQL client not available');
      return followUser({ client, userId: user.id });
    },
    onMutate: async ({ user }: FollowMutationInput) => {
      const previousNetwork = network;
      const newFollowing = [...network.following, user];
      const newNetwork = { ...network, following: newFollowing };
      setNetwork(newNetwork);
      return { previousNetwork };
    },
    onError: (err, { user }, context) => {
      if (context?.previousNetwork) {
        setNetwork(context.previousNetwork);
      }
      toast.error(`Failed to follow @${user.login}: ${err.message}`);
    },
    onSuccess: async (_, { persist = true }) => {
      if (persist) {
        await persistChanges();
      }
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: ({ user }: FollowMutationInput) => {
      if (!client) throw new Error('GraphQL client not available');
      return unfollowUser({ client, userId: user.id });
    },
    onMutate: async ({ user }: FollowMutationInput) => {
      const previousNetwork = network;
      const newFollowing = network.following.filter((u) => u.id !== user.id);
      const newNetwork = { ...network, following: newFollowing };
      setNetwork(newNetwork);
      return { previousNetwork };
    },
    onError: (err, { user }, context) => {
      if (context?.previousNetwork) {
        setNetwork(context.previousNetwork);
      }
      toast.error(`Failed to unfollow @${user.login}: ${err.message}`);
    },
    onSuccess: async (_, { persist = true }) => {
      if (persist) {
        await persistChanges();
      }
    },
  });

  return {
    followMutation,
    unfollowMutation,
    incrementActionCount,
  };
};
