import { useProgress } from '@/lib/context/progress';
import { UserInfoFragment } from '@/lib/gql/types';
import { useState } from 'react';

// The mutation function can be any async function that takes a user and returns a promise.
// This is compatible with the `mutateAsync` function from TanStack Query.
type AsyncMutationFn = (user: UserInfoFragment) => Promise<unknown>;

export const useBulkOperation = (
  mutationFn: AsyncMutationFn,
  actionName: string,
  onBulkSuccess?: () => void
) => {
  const { show, update, complete, fail } = useProgress();
  const [isPending, setIsPending] = useState(false);

  const execute = async (users: UserInfoFragment[]) => {
    if (isPending) return;
    const total = users.length;
    if (total === 0) return;

    setIsPending(true);
    show({
      title: `Bulk ${actionName}`,
      message: `Processing ${total} users...`,
      items: [{ label: 'Users', current: 0, total }],
    });

    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      const user = users[i];
      try {
        await mutationFn(user);
      } catch (error) {
        console.error(`Failed to ${actionName} user @${user.login}:`, error);
        errorCount++;
      }

      update([
        {
          label: 'Users',
          current: i + 1,
          total,
        },
      ]);

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (onBulkSuccess) {
      onBulkSuccess();
    }

    if (errorCount > 0) {
      fail({
        message: `Completed with ${errorCount} errors. See console for details.`,
      });
    } else {
      complete();
    }
    setIsPending(false);
  };

  return { execute, isPending };
};
