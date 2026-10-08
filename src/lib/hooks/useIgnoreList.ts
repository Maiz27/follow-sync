import { useCallback } from 'react';
import { toast } from 'sonner';
import { isIgnored, useIgnoreStore } from '@/lib/store/ignore';
import { toUserMessage } from '@/lib/errors';
import { useCacheManager } from './useCacheManager';

/**
 * Reads and edits the ignore list. Changes apply immediately and are saved to
 * the cache gist in the background (the list only lives there).
 */
export const useIgnoreList = () => {
  const ignoredLogins = useIgnoreStore((state) => state.ignoredLogins);
  const { persistChanges } = useCacheManager();

  const save = useCallback(() => {
    persistChanges().catch((error) => {
      console.error('Failed to save the ignore list:', error);
      toast.warning(
        toUserMessage(error, 'Updated the ignore list, but saving it failed.')
      );
    });
  }, [persistChanges]);

  const toggleIgnored = useCallback(
    (login: string) => {
      const store = useIgnoreStore.getState();
      if (isIgnored(store.ignoredLogins, login)) {
        store.unignore(login);
        toast.success(`@${login} will be suggested again.`);
      } else {
        store.ignore(login);
        toast.success(`@${login} won't be suggested in the One-Way lists.`);
      }
      save();
    },
    [save]
  );

  const unignore = useCallback(
    (login: string) => {
      useIgnoreStore.getState().unignore(login);
      save();
    },
    [save]
  );

  return { ignoredLogins, toggleIgnored, unignore };
};
