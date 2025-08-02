import { useState, useEffect } from 'react';
import { UserInfoFragment } from '@/lib/gql/types';

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
    if (nonMutuals.length === 0) {
      return;
    }

    const potentialGhosts = nonMutuals.filter(
      (user) =>
        user.followers.totalCount === 0 && user.following.totalCount === 0
    );

    if (potentialGhosts.length > 0) {
      // Next steps: batching and fetching will be added here.
      console.log('Potential ghosts found:', potentialGhosts);
    }
  }, [nonMutuals]);

  return { ghosts, isChecking };
};
