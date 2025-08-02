import { useState, useEffect } from 'react';
import { UserInfoFragment } from '@/lib/gql/types';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES = 1000; // 1 second

type GhostDetectorResult = {
  ghosts: UserInfoFragment[];
  isChecking: boolean;
};

export const useGhostDetector = (
  nonMutuals: UserInfoFragment[]
): GhostDetectorResult => {
  const [ghosts, setGhosts] = useState<UserInfoFragment[]>([]);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  useEffect(() => {
    const detectGhosts = async () => {
      if (nonMutuals.length === 0) {
        return;
      }

      const potentialGhosts = nonMutuals.filter(
        (user) =>
          user?.followers.totalCount === 0 && user?.following.totalCount === 0
      );

      if (potentialGhosts.length === 0) {
        return;
      }

      setIsChecking(true);
      const confirmedGhosts: UserInfoFragment[] = [];

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
            confirmedGhosts.push(...(batchGhosts as UserInfoFragment[]));
            setGhosts((prev) => [
              ...prev,
              ...(batchGhosts as UserInfoFragment[]),
            ]);
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

      setIsChecking(false);
    };

    detectGhosts();
  }, [nonMutuals]);

  return { ghosts, isChecking };
};
