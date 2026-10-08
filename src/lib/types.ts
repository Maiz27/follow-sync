import { UserInfoFragment } from './gql/types';
import { SettingsState } from './store/settings';
import type { NetworkDiff } from './networkDiff';

/**
 * How a connection is classified.
 * - `user`: an active GitHub user account.
 * - `organization`: an org you follow. GitHub's GraphQL `FollowingConnection`
 *   is typed to `User`, so organizations come from REST and are excluded from
 *   follow-back analysis because orgs cannot follow you back.
 * - `ghost`: an account present only in a completed GraphQL follow list under
 *   the API behavior observed by this app. This is an inferred classification,
 *   not an account-status flag returned by GitHub.
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
  /** The API cut `text` at its 1 MB inline limit; full content is at rawUrl. */
  truncated?: boolean;
  rawUrl?: string | null;
}

/**
 * What identifies the cache a gist revision holds (see isSameRevision).
 */
export interface GistRevision {
  /**
   * The gist's latest history version (a commit SHA), when GitHub returned
   * one. `history` is documented as deprecated, so it may be missing.
   */
  version: string | null;
  /**
   * The write generation of the cache manifest at this revision: unique per
   * cache write. Null for a single-file cache from before sharding, or a gist
   * without a cache.
   */
  generation: string | null;
}

export interface CacheGist {
  id: string;
  name?: string | null;
  /** GitHub login of the account that owns the gist, when the API returned it. */
  ownerLogin?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  /**
   * The gist's current revision, used to notice writes made elsewhere since
   * this session read it.
   */
  revision?: GistRevision | null;
  /**
   * The gist has more files than GitHub lists in one response (300), so
   * `files` is only part of them.
   */
  filesTruncated?: boolean;
  files: CacheGistFile[];
}

/** The subset of settings that is saved to the cache gist. */
export type CachedSettings = Pick<
  SettingsState,
  'showAvatars' | 'paginationPageSize' | 'customStaleTime'
>;

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
  /** Optional: caches written before settings were persisted omit it. */
  settings?: CachedSettings;
  /** Lowercased logins never suggested in the One-Way lists. */
  ignoredLogins?: string[];
  /** Changes found by the most recent sync that had something to compare. */
  lastDiff?: NetworkDiff | null;
  /** When the cache was last written (any change: follows, settings...). */
  timestamp: number;
  /**
   * When the network was last fully synced from GitHub. Drives staleness and
   * "Last synced". Absent in caches written before it existed, which fall
   * back to `timestamp`.
   */
  syncedAt?: number;
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
  /** `message` replaces the status line; omit it to keep the current one. */
  update: (items: ProgressCallbackItem[], message?: string) => void;
  complete: () => void;
  fail: (config: { message: string }) => void;
}
