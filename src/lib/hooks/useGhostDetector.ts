import { useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useGhostStore } from '@/lib/store/ghost';
import { useNetworkStore } from '@/lib/store/network';
import { useSettingsStore } from '@/lib/store/settings';
import { useCacheManager } from './useCacheManager';
import { UserInfoFragment } from '@/lib/gql/types';

const DELAY_BETWEEN_BATCHES = 250;

interface GhostDetectorProps {
  isNetworkReady: boolean;
}

export const useGhostDetector = ({ isNetworkReady }: GhostDetectorProps) => {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  const nonMutualsFollowingYou = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsFollowingYou
  );
  const nonMutualsYouFollow = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsYouFollow
  );
  const setIsCheckingGhosts = useGhostStore((state) => state.setIsCheckingGhosts);
  const ghostDetectionBatchSize = useSettingsStore(
    (state) => state.ghostDetectionBatchSize
  );
  const { updateGhosts } = useCacheManager();

  const potentialGhosts = useMemo(() => {
    const candidates = new Map<string, UserInfoFragment>();

    for (const user of [...nonMutualsYouFollow, ...nonMutualsFollowingYou]) {
      if (
        !user?.login ||
        user.followers.totalCount !== 0 ||
        user.following.totalCount !== 0
      ) {
        continue;
      }

      candidates.set(user.login, user);
    }

    return Array.from(candidates.values());
  }, [nonMutualsFollowingYou, nonMutualsYouFollow]);

  useEffect(() => {
    let isCancelled = false;

    const detectGhosts = async () => {
      if (!isNetworkReady || !accessToken) {
        setIsCheckingGhosts(false);
        return;
      }

      const existingGhosts = useGhostStore.getState().ghostsSet;
      const newPotentialGhosts = potentialGhosts.filter(
        (potentialGhost) => !existingGhosts.has(potentialGhost.login)
      );

      if (newPotentialGhosts.length === 0) {
        setIsCheckingGhosts(false);
        return;
      }

      setIsCheckingGhosts(true);
      const confirmedGhosts: UserInfoFragment[] = [];

      for (
        let i = 0;
        i < newPotentialGhosts.length && !isCancelled;
        i += ghostDetectionBatchSize
      ) {
        const batch = newPotentialGhosts.slice(i, i + ghostDetectionBatchSize);
        const usernames = batch.map((user) => user.login);

        try {
          const response = await fetch('/api/verify-ghosts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usernames }),
          });

          if (response.ok) {
            const { ghosts } = (await response.json()) as { ghosts: string[] };
            const ghostUsernames = new Set(ghosts);
            confirmedGhosts.push(
              ...batch.filter((user) => ghostUsernames.has(user.login))
            );
          }
        } catch (error) {
          console.error('Error verifying ghost batch:', error);
        }

        if (
          !isCancelled &&
          i + ghostDetectionBatchSize < newPotentialGhosts.length
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES)
          );
        }
      }

      if (!isCancelled && confirmedGhosts.length > 0) {
        await updateGhosts(confirmedGhosts);
      }

      if (!isCancelled) {
        setIsCheckingGhosts(false);
      }
    };

    void detectGhosts();

    return () => {
      isCancelled = true;
    };
  }, [
    isNetworkReady,
    accessToken,
    potentialGhosts,
    setIsCheckingGhosts,
    ghostDetectionBatchSize,
    updateGhosts,
  ]);
};
