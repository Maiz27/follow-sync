import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useGhostStore } from '@/lib/store/ghost';
import { useNetworkStore } from '@/lib/store/network';
import { useSettingsStore } from '@/lib/store/settings';
import { useCacheManager } from './useCacheManager';

const DELAY_BETWEEN_BATCHES = 1000; // 1 second

export const useGhostDetector = () => {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  const { nonMutuals } = useNetworkStore();
  const { nonMutualsFollowingYou, nonMutualsYouFollow } = nonMutuals;
  const { ghosts, setIsCheckingGhosts } = useGhostStore();
  const { ghostDetectionBatchSize } = useSettingsStore();
  const { updateGhosts } = useCacheManager();

  useEffect(() => {
    const detectGhosts = async () => {
      if (
        nonMutualsYouFollow.length === 0 ||
        nonMutualsFollowingYou.length === 0 ||
        !accessToken
      ) {
        setIsCheckingGhosts(false);
        return;
      }

      setIsCheckingGhosts(true);

      const potentialGhosts = [
        ...nonMutualsYouFollow,
        ...nonMutualsFollowingYou,
      ].filter(
        (user) =>
          user?.followers.totalCount === 0 && user?.following.totalCount === 0
      );

      const newPotentialGhosts = potentialGhosts.filter(
        (potentialGhost) =>
          !ghosts.some((existingGhost) => existingGhost.login === potentialGhost.login)
      );

      if (newPotentialGhosts.length === 0) {
        setIsCheckingGhosts(false);
        return;
      }

      const confirmedGhosts = [];

      for (let i = 0; i < newPotentialGhosts.length; i += ghostDetectionBatchSize) {
        const batch = newPotentialGhosts.slice(i, i + ghostDetectionBatchSize);
        const usernames = batch.map((user) => user?.login);

        try {
          const response = await fetch('/api/verify-ghosts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usernames }),
          });

          if (response.ok) {
            const { ghosts: ghostUsernames } = await response.json();
            const batchGhosts = batch.filter((user) =>
              ghostUsernames.includes(user?.login)
            );
            confirmedGhosts.push(...batchGhosts);
          }
        } catch (error) {
          console.error('Error verifying ghost batch:', error);
        }

        if (i + ghostDetectionBatchSize < newPotentialGhosts.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES)
          );
        }
      }

      if (confirmedGhosts.length > 0) {
        await updateGhosts(confirmedGhosts, accessToken);
      }

      setIsCheckingGhosts(false);
    };

    detectGhosts();
  }, [
    nonMutualsFollowingYou,
    nonMutualsYouFollow,
    accessToken,
    ghosts,
    setIsCheckingGhosts,
    ghostDetectionBatchSize,
    updateGhosts,
  ]);
};
