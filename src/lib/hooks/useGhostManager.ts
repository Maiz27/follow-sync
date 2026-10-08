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
      const removed = await removeFollowingByLogin({ login: user.login });
      if (!removed) {
        // 404: GitHub couldn't resolve the account, so the follow wasn't
        // removed. Treat it as a failure instead of silently hiding the ghost.
        throw new Error(
          `GitHub could not find @${user.login} (404); the ghost was not removed.`
        );
      }
    } catch (error) {
      rollback();
      throw error;
    }
  };

  /**
   * Removes a single ghost and persists the change to the cache. Resolves to
   * whether the ghost was removed on GitHub.
   */
  const removeGhost = async (user: NetworkUser): Promise<boolean> => {
    if (removingLogins.has(user.login)) return false;

    setRemovingLogins((prev) => new Set(prev).add(user.login));
    let removed = false;
    try {
      await removeFromGitHub(user);
      removed = true;
      await persistChanges();
      toast.success(`Removed ghost @${user.login}.`);
    } catch (error) {
      if (!removed) {
        toast.error(toUserMessage(error, `Failed to remove @${user.login}.`));
        return false;
      }
      // Distinguish a removal failure (ghost still there, rolled back) from a
      // persistence failure (ghost removed on GitHub, only the cache didn't
      // save) so the toast isn't misleading.
      toast.warning(
        toUserMessage(
          error,
          `Removed @${user.login}, but updating the cache failed.`
        )
      );
    } finally {
      setRemovingLogins((prev) => {
        const next = new Set(prev);
        next.delete(user.login);
        return next;
      });
    }
    return true;
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
