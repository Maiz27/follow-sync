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
 * Manages removal of ghost accounts (deleted/suspended users that still linger
 * in your following list). Removal goes through the REST `DELETE /user/following`
 * endpoint, which succeeds even for 404 accounts that the GraphQL `unfollowUser`
 * mutation cannot touch.
 */
export const useGhostManager = () => {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const removeGhostsFromStore = useGhostStore((state) => state.removeGhosts);
  const { persistChanges } = useCacheManager();
  const [removingLogins, setRemovingLogins] = useState<Set<string>>(new Set());

  const removeFromGitHub = async (user: NetworkUser) => {
    if (!isAuthenticated) {
      throw new Error('Authentication is required to remove ghosts.');
    }
    await removeFollowingByLogin({ login: user.login });
    removeGhostsFromStore([user.login]);
  };

  /** Removes a single ghost and persists the change to the cache. */
  const removeGhost = async (user: NetworkUser) => {
    if (removingLogins.has(user.login)) return;

    setRemovingLogins((prev) => new Set(prev).add(user.login));
    try {
      await removeFromGitHub(user);
      await persistChanges();
      toast.success(`Removed ghost @${user.login}.`);
    } catch (error) {
      toast.error(toUserMessage(error, `Failed to remove @${user.login}.`));
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
