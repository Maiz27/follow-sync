'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { useGhostStore } from '@/lib/store/ghost';
import { removeFollowingByLogin } from '@/lib/gql/fetchers';
import { NetworkUser } from '@/lib/types';
import { toUserMessage } from '@/lib/errors';
import { useCacheManager } from './useCacheManager';

/**
 * Manages removal of inferred ghost accounts (GraphQL-only entries that linger
 * in your following list). Removal goes through the REST `DELETE /user/following`
 * endpoint and does not require the live node id expected by the GraphQL
 * `unfollowUser` mutation.
 */
export const useGhostManager = () => {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const optimisticRemoveGhost = useGhostStore(
    (state) => state.optimisticRemoveGhost
  );
  const { persistChanges } = useCacheManager();
  const [removingLogins, setRemovingLogins] = useState<Set<string>>(new Set());

  const removeFromGitHub = async (user: NetworkUser) => {
    if (!isAuthenticated) {
      throw new Error('Authentication is required to remove ghosts.');
    }
    // Optimistically drop the ghost, then roll back if the REST removal fails —
    // uniform with the follow/unfollow mutations.
    const rollback = optimisticRemoveGhost(user.login);
    try {
      await removeFollowingByLogin({ login: user.login });
    } catch (error) {
      rollback();
      throw error;
    }
  };

  /** Removes a single ghost and persists the change to the cache. */
  const removeGhost = async (user: NetworkUser) => {
    if (removingLogins.has(user.login)) return;

    setRemovingLogins((prev) => new Set(prev).add(user.login));
    let removed = false;
    try {
      await removeFromGitHub(user);
      removed = true;
      await persistChanges();
      toast.success(`Removed ghost @${user.login}.`);
    } catch (error) {
      // Distinguish a removal failure (ghost still there, rolled back) from a
      // persistence failure (ghost removed on GitHub, only the cache didn't
      // save) so the toast isn't misleading.
      toast.error(
        removed
          ? toUserMessage(
              error,
              `Removed @${user.login}, but updating the cache failed.`
            )
          : toUserMessage(error, `Failed to remove @${user.login}.`)
      );
    } finally {
      setRemovingLogins((prev) => {
        const next = new Set(prev);
        next.delete(user.login);
        return next;
      });
    }
  };

  /**
   * Removes a ghost without persisting — used by bulk operations that persist
   * once at the end via `onBulkSuccess`.
   */
  const removeGhostSilently = (user: NetworkUser) => removeFromGitHub(user);

  return {
    removeGhost,
    removeGhostSilently,
    removingLogins,
    persistChanges,
  };
};
