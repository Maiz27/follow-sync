import { getQueryClient } from '@/app/get-query-client';
import { QUERY_KEY_USER_NETWORK } from '@/lib/constants';
import { forgetCacheBases } from '@/lib/gist';
import { useGhostStore } from './ghost';
import { useGistStore } from './gist';
import { useIgnoreStore } from './ignore';
import { useNetworkStore } from './network';
import { usePaginationStore } from './pagination';
import { useSettingsStore } from './settings';

/**
 * Forgets every piece of in-memory state that belongs to the signed-in
 * account: its network (and journaled follows), ghosts and their tombstones,
 * ignore list, cache gist id/metadata/diff, the settings saved in its cache,
 * list pagination, and the cache revision its writes are based on. The single
 * place both an account switch and sign-out go through, so nothing of one
 * account can end up in another's cache.
 */
export const resetAccountState = () => {
  useNetworkStore.getState().reset();
  useGhostStore.getState().reset();
  useIgnoreStore.getState().reset();
  useGistStore.getState().reset();
  useSettingsStore.getState().resetPersistedSettings();
  usePaginationStore.getState().reset();
  // What this session last read from the account's cache gist: the next
  // account's writes must never be merged against it.
  forgetCacheBases();
};

/**
 * Makes `login` the account the stores belong to. When they belonged to a
 * different account (signed out and back in as someone else in another tab),
 * everything is reset first, and the previous account's cached network
 * queries are dropped so switching back loads that account again instead of
 * showing whatever the stores hold.
 */
export const switchAccount = (login: string) => {
  const next = login.toLowerCase();
  const current = useGistStore.getState().ownerLogin;
  if (current !== null && current !== next) {
    resetAccountState();
    getQueryClient().removeQueries({
      queryKey: [QUERY_KEY_USER_NETWORK],
      predicate: ({ queryKey }) =>
        String(queryKey[1] ?? '').toLowerCase() !== next,
    });
  }
  useGistStore.getState().setOwnerLogin(next);
};
