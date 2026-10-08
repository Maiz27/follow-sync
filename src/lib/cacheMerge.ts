import type { CachedData, GistRevision, NetworkUser } from './types';

/**
 * What this session last knew the cache gist to hold: the revision it read or
 * wrote, and just the parts of that snapshot a merge needs to tell what each
 * side changed since.
 */
export type CacheBase = {
  revision: GistRevision | null;
  /** When the network in that snapshot was last fully synced. */
  syncedAt: number;
  following: string[];
  ignoredLogins: string[];
};

const key = (login: string) => login.toLowerCase();

export const toCacheBase = (
  revision: GistRevision | null,
  data: CachedData
): CacheBase => ({
  revision,
  syncedAt: data.syncedAt ?? data.timestamp,
  following: data.network.following.map((user) => key(user.login)),
  ignoredLogins: (data.ignoredLogins ?? []).map(key),
});

const syncTime = (data: CachedData) => data.syncedAt ?? data.timestamp;

/**
 * Whether two revisions are the same: by history version when both have one
 * (exact), else by `updated_at` (to the second). Unknown never matches.
 */
export const isSameRevision = (
  a: GistRevision | null | undefined,
  b: GistRevision | null | undefined
) => {
  if (!a || !b) return false;
  if (a.version && b.version) return a.version === b.version;
  return a.updatedAt !== null && a.updatedAt === b.updatedAt;
};

/**
 * Re-applies `changed`'s follows/unfollows since `base` onto `following`:
 * accounts it added are added, accounts it dropped are removed.
 */
const applyFollowingDelta = (
  following: NetworkUser[],
  base: ReadonlySet<string>,
  changed: NetworkUser[]
) => {
  const changedLogins = new Set(changed.map((user) => key(user.login)));
  const removed = new Set(
    [...base].filter((login) => !changedLogins.has(login))
  );
  const added = changed.filter((user) => !base.has(key(user.login)));

  const result = following.filter((user) => !removed.has(key(user.login)));
  const present = new Set(result.map((user) => key(user.login)));
  for (const user of added) {
    if (!present.has(key(user.login))) {
      result.push(user);
      present.add(key(user.login));
    }
  }
  return result;
};

/**
 * Three-way merge for when the cache gist changed (another device or tab
 * wrote it) since this session read or wrote it as `base`. Pure.
 *
 * - The network with the newer full sync wins (followers, ghosts, the "since
 *   last sync" diff); the other side's follows/unfollows since `base` are
 *   re-applied to its following list (unless that side re-synced since
 *   `base`, which the newer sync supersedes).
 * - Ignore lists merge by what each side added or removed since `base`.
 * - Ghost removals (tombstones) are unioned.
 * - Settings and the write time are local: this write is the user's latest.
 */
export const mergeCacheData = (
  base: CacheBase,
  remote: CachedData,
  local: CachedData
): CachedData => {
  const localIsNewer = syncTime(local) >= syncTime(remote);
  const primary = localIsNewer ? local : remote;
  const other = localIsNewer ? remote : local;

  // The other side's following list differs from `base` by its follows and
  // unfollows, unless it also re-synced since: then it differs by everything
  // that sync saw, which the newer sync in `primary` already supersedes.
  const following =
    syncTime(other) > base.syncedAt
      ? primary.network.following
      : applyFollowingDelta(
          primary.network.following,
          new Set(base.following),
          other.network.following
        );

  const removedGhosts = [
    ...new Set(
      [...(remote.removedGhosts ?? []), ...(local.removedGhosts ?? [])].map(key)
    ),
  ];
  const tombstones = new Set(removedGhosts);

  const baseIgnored = new Set(base.ignoredLogins);
  const localIgnored = new Set((local.ignoredLogins ?? []).map(key));
  const ignoredLogins = new Set(
    [
      ...(remote.ignoredLogins ?? []).map(key),
      ...[...localIgnored].filter((login) => !baseIgnored.has(login)),
    ].filter((login) => !(baseIgnored.has(login) && !localIgnored.has(login)))
  );

  return {
    ...local,
    network: { followers: primary.network.followers, following },
    ghosts: primary.ghosts.filter((ghost) => !tombstones.has(key(ghost.login))),
    removedGhosts,
    ignoredLogins: [...ignoredLogins],
    lastDiff: primary.lastDiff ?? null,
    syncedAt: syncTime(primary),
    metadata: {
      ...local.metadata,
      totalConnections: primary.network.followers.length + following.length,
      fetchDuration: primary.metadata.fetchDuration,
    },
  };
};
