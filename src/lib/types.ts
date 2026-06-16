import { UserInfoFragment } from './gql/types';
import { SettingsState } from './store/settings';

/**
 * How a connection is classified.
 * - `user`: an active GitHub user account.
 * - `organization`: an org you follow. Returned only by the REST API
 *   (GitHub's GraphQL `following` connection silently omits organizations),
 *   and excluded from non-mutual / follow-back analysis since orgs cannot
 *   follow you back.
 * - `ghost`: a deleted or suspended account that still lingers in your
 *   GraphQL following list but is absent from the REST list (a 404 account).
 */
export type AccountType = 'user' | 'organization' | 'ghost';

/**
 * A connection enriched with its account classification. Superset of the
 * generated `UserInfoFragment`, so it remains assignable wherever the raw
 * fragment is expected. `accountType` is optional for backwards compatibility
 * with caches written before classification existed (treated as `user`).
 */
export type NetworkUser = UserInfoFragment & {
  accountType?: AccountType;
  /**
   * For ghosts only: whether the account can actually be removed. Ghosts in
   * your following list are removable (REST unfollow); ghosts that merely
   * follow you are not (you can't unfollow someone you don't follow).
   */
  removable?: boolean;
};

export interface CacheGistFile {
  name: string;
  text?: string | null;
}

export interface CacheGist {
  id: string;
  name?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  files: CacheGistFile[];
}

export interface CachedData {
  network: {
    followers: NetworkUser[];
    following: NetworkUser[];
  };
  ghosts: NetworkUser[];
  /**
   * Logins of ghosts the user has removed. GitHub's GraphQL `following` list is
   * eventually consistent, so a just-unfollowed ghost can still appear there for
   * a while; this tombstone suppresses re-detecting it until GraphQL catches up.
   * Self-cleaning: pruned to only logins still present in the GraphQL following
   * list on each fetch.
   */
  removedGhosts?: string[];
  settings: SettingsState;
  timestamp: number;
  metadata: {
    totalConnections: number;
    fetchDuration: number;
    cacheVersion: string;
    ownerLogin?: string;
    cacheKey?: string;
  };
}

export type textSizes =
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl';

export interface ProgressCallbackItem {
  label: string;
  current: number;
  total: number;
  isApproximateTotal?: boolean;
}

// Define the structure for progress callbacks to decouple from the hook
export interface ProgressCallbacks {
  show: (config: {
    title: string;
    message: string;
    items: ProgressCallbackItem[];
  }) => void;
  update: (items: ProgressCallbackItem[]) => void;
  complete: () => void;
  fail: (config: { message: string }) => void;
}
