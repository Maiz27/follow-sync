import { useCallback, useMemo } from 'react';
import { useMutation, useMutationState } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNetworkStore, type OptimisticHandle } from '@/lib/store/network';
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
  handle: OptimisticHandle;
};

const FOLLOW_MUTATION_KEY = ['follow-user'];
const UNFOLLOW_MUTATION_KEY = ['unfollow-user'];

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
  const incrementActionCount = useModalsStore(
    (state) => state.incrementActionCount
  );

  const requireClient = useCallback(() => {
    if (!client) throw new Error('GraphQL client not available');
    return client;
  }, [client]);

  /**
   * Saves the cache after a change GitHub already applied. Deliberately not
   * awaited inside `onSuccess`: a throw there would route the mutation to
   * `onError` and roll back a follow/unfollow that actually happened. A failed
   * save only means the cache is behind, so it gets its own warning.
   */
  const persistInBackground = () => {
    persistChanges().catch((error) => {
      console.error('Failed to persist cache after a change:', error);
      toast.warning(
        toUserMessage(
          error,
          'Your change was applied on GitHub, but saving the cache failed.'
        )
      );
    });
  };

  const followMutation = useMutation<
    unknown,
    Error,
    FollowMutationInput,
    MutationContext
  >({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: ({ user }) =>
      followUser({ client: requireClient(), userId: user.id }),
    onMutate: ({ user }) => ({ handle: optimisticFollow(user) }),
    onError: (err, { user }, context) => {
      context?.handle.rollback();
      toast.error(toUserMessage(err, `Failed to follow @${user.login}.`));
    },
    onSuccess: (_data, _variables, context) => {
      context?.handle.commit();
      persistInBackground();
    },
  });

  const unfollowMutation = useMutation<
    unknown,
    Error,
    FollowMutationInput,
    MutationContext
  >({
    mutationKey: UNFOLLOW_MUTATION_KEY,
    mutationFn: ({ user }) =>
      unfollowUser({ client: requireClient(), userId: user.id }),
    onMutate: ({ user }) => ({ handle: optimisticUnfollow(user) }),
    onError: (err, { user }, context) => {
      context?.handle.rollback();
      toast.error(toUserMessage(err, `Failed to unfollow @${user.login}.`));
    },
    onSuccess: (_data, _variables, context) => {
      context?.handle.commit();
      persistInBackground();
    },
  });

  // Logins with a follow/unfollow in flight (from any component), so each card
  // shows its own busy state instead of one shared flag disabling every card.
  const pendingVariables = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) => ({
      key: mutation.options.mutationKey?.[0],
      login: (mutation.state.variables as FollowMutationInput | undefined)?.user
        ?.login,
    }),
  });
  const pendingLogins = useMemo(
    () =>
      new Set(
        pendingVariables
          .filter(
            (m) =>
              m.login &&
              (m.key === FOLLOW_MUTATION_KEY[0] ||
                m.key === UNFOLLOW_MUTATION_KEY[0])
          )
          .map((m) => m.login as string)
      ),
    [pendingVariables]
  );

  /**
   * Single-card actions: run the mutation, confirm with an Undo action, and
   * count it toward the (one-time) star prompt. Resolve to whether GitHub
   * accepted the change; failures are already toasted by the mutation.
   */
  const { mutateAsync: followAsync } = followMutation;
  const { mutateAsync: unfollowAsync } = unfollowMutation;

  const follow = useCallback(
    async (user: NetworkUser) => {
      try {
        await followAsync({ user });
      } catch {
        return false;
      }
      incrementActionCount();
      toast.success(`Followed @${user.login}.`, {
        action: {
          label: 'Undo',
          onClick: () => {
            unfollowAsync({ user }).catch(() => undefined);
          },
        },
      });
      return true;
    },
    [followAsync, unfollowAsync, incrementActionCount]
  );

  const unfollow = useCallback(
    async (user: NetworkUser) => {
      try {
        await unfollowAsync({ user });
      } catch {
        return false;
      }
      incrementActionCount();
      toast.success(`Unfollowed @${user.login}.`, {
        action: {
          label: 'Undo',
          onClick: () => {
            followAsync({ user }).catch(() => undefined);
          },
        },
      });
      return true;
    },
    [followAsync, unfollowAsync, incrementActionCount]
  );

  // Non-persisting variants for bulk operations: same store-owned optimistic
  // update + rollback, but the caller persists once after the whole batch.
  const followNoPersist = useCallback(
    async (user: NetworkUser) => {
      const handle = optimisticFollow(user);
      try {
        await followUser({ client: requireClient(), userId: user.id });
        handle.commit();
      } catch (error) {
        handle.rollback();
        throw error;
      }
    },
    [optimisticFollow, requireClient]
  );

  const unfollowNoPersist = useCallback(
    async (user: NetworkUser) => {
      const handle = optimisticUnfollow(user);
      try {
        await unfollowUser({ client: requireClient(), userId: user.id });
        handle.commit();
      } catch (error) {
        handle.rollback();
        throw error;
      }
    },
    [optimisticUnfollow, requireClient]
  );

  return {
    followMutation,
    unfollowMutation,
    follow,
    unfollow,
    pendingLogins,
    followNoPersist,
    unfollowNoPersist,
    incrementActionCount,
  };
};
