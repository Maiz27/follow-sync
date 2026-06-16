import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNetworkStore } from '@/lib/store/network';
import { followUser, unfollowUser } from '@/lib/gql/fetchers';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { NetworkUser } from '@/lib/types';
import { useModalsStore } from '@/lib/store/modals';
import { toUserMessage } from '@/lib/errors';
import { useCacheManager } from './useCacheManager';

type FollowMutationInput = {
  user: NetworkUser;
};

type MutationContext = {
  rollback: () => void;
};

/**
 * Connection mutations. The optimistic update + rollback live in the network
 * store (the single source of truth); this hook just wires them to the API call
 * and persistence. Single-action mutations persist on success; the bulk
 * variants skip per-item persistence so callers can persist once at the end.
 */
export const useFollowManager = () => {
  const { client } = useClientAuthenticatedGraphQLClient();
  const optimisticFollow = useNetworkStore((state) => state.optimisticFollow);
  const optimisticUnfollow = useNetworkStore(
    (state) => state.optimisticUnfollow
  );
  const { persistChanges } = useCacheManager();
  const { incrementActionCount } = useModalsStore();

  const requireClient = () => {
    if (!client) throw new Error('GraphQL client not available');
    return client;
  };

  const followMutation = useMutation<unknown, Error, FollowMutationInput, MutationContext>({
    mutationFn: ({ user }) =>
      followUser({ client: requireClient(), userId: user.id }),
    onMutate: ({ user }) => ({ rollback: optimisticFollow(user) }),
    onError: (err, { user }, context) => {
      context?.rollback();
      toast.error(toUserMessage(err, `Failed to follow @${user.login}.`));
    },
    onSuccess: async () => {
      await persistChanges();
    },
  });

  const unfollowMutation = useMutation<unknown, Error, FollowMutationInput, MutationContext>({
    mutationFn: ({ user }) =>
      unfollowUser({ client: requireClient(), userId: user.id }),
    onMutate: ({ user }) => ({ rollback: optimisticUnfollow(user.id) }),
    onError: (err, { user }, context) => {
      context?.rollback();
      toast.error(toUserMessage(err, `Failed to unfollow @${user.login}.`));
    },
    onSuccess: async () => {
      await persistChanges();
    },
  });

  // Non-persisting variants for bulk operations: same store-owned optimistic
  // update + rollback, but the caller persists once after the whole batch.
  const followNoPersist = async (user: NetworkUser) => {
    const rollback = optimisticFollow(user);
    try {
      await followUser({ client: requireClient(), userId: user.id });
    } catch (error) {
      rollback();
      throw error;
    }
  };

  const unfollowNoPersist = async (user: NetworkUser) => {
    const rollback = optimisticUnfollow(user.id);
    try {
      await unfollowUser({ client: requireClient(), userId: user.id });
    } catch (error) {
      rollback();
      throw error;
    }
  };

  return {
    followMutation,
    unfollowMutation,
    followNoPersist,
    unfollowNoPersist,
    incrementActionCount,
  };
};
