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
    setIsCheckingGhosts(true);

    const detectGhosts = async () => {
      if (
        ghosts.length > 0 ||
        nonMutualsYouFollow.length === 0 ||
        nonMutualsFollowingYou.length === 0 ||
        !accessToken
      ) {
        setIsCheckingGhosts(false);
        return;
      }

      const potentialGhosts = [
        ...nonMutualsYouFollow,
        ...nonMutualsFollowingYou,
      ].filter(
        (user) =>
          user?.followers.totalCount === 0 && user?.following.totalCount === 0
      );

      if (potentialGhosts.length === 0) {
        return;
      }

      const confirmedGhosts = [];

      for (let i = 0; i < potentialGhosts.length; i += BATCH_SIZE) {
        const batch = potentialGhosts.slice(i, i + BATCH_SIZE);
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

        if (i + BATCH_SIZE < potentialGhosts.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES)
          );
        }
      }

      setIsCheckingGhosts(false);
      await setGhosts(confirmedGhosts, accessToken);
    };

    detectGhosts();
  }, [
    nonMutualsFollowingYou,
    nonMutualsYouFollow,
    accessToken,
    setGhosts,
    ghosts.length,
    setIsCheckingGhosts,
  ]);
};
