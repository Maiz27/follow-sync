import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useCacheStore } from '@/lib/store/cache';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES = 1000; // 1 second

export const useGhostDetector = () => {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  const {
    nonMutuals: { nonMutualsYouFollow, nonMutualsFollowingYou },
    ghosts,
    setGhosts,
    setIsCheckingGhosts,
  } = useCacheStore();

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

      for (let i = 0; i < newPotentialGhosts.length; i += BATCH_SIZE) {
        const batch = newPotentialGhosts.slice(i, i + BATCH_SIZE);
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

        if (i + BATCH_SIZE < newPotentialGhosts.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES)
          );
        }
      }

      if (confirmedGhosts.length > 0) {
        await setGhosts([...ghosts, ...confirmedGhosts], accessToken);
      }

      setIsCheckingGhosts(false);
    };

    detectGhosts();
  }, [
    nonMutualsFollowingYou,
    nonMutualsYouFollow,
    accessToken,
    setGhosts,
    ghosts,
    setIsCheckingGhosts,
  ]);
};
