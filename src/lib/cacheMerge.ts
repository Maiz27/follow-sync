import { READABLE_CACHE_VERSIONS } from './constants';
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
 * Whether two revisions hold the same cache. The manifest's write generation
 * is the primary token: every cache write gets a fresh one, so equal
 * generations mean the cache content is exactly what it was (edits that
 * don't touch the cache, like a renamed description, don't count). Without a
 * generation on both sides (a single-file cache from before sharding), the
 * gist history version decides; GitHub documents `history` as deprecated, so
 * when that is missing too the answer is "changed" and the caller reads and
 * merges. Unknown never matches.
 */
export const isSameRevision = (
  a: GistRevision | null | undefined,
  b: GistRevision | null | undefined
) => {
  if (!a || !b) return false;
  if (a.generation && b.generation) return a.generation === b.generation;
  if (a.generation || b.generation) return false;
  return a.version !== null && a.version === b.version;
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

/** A cache this code can take a network from (see READABLE_CACHE_VERSIONS). */
const hasUsableNetwork = (data: CachedData) =>
  READABLE_CACHE_VERSIONS.includes(data.metadata.cacheVersion);

/**
 * Merges the cache another device or tab wrote (`remote`) into the one this
 * session is about to write (`local`). Pure.
 *
 * With `base` (what this session last read or wrote), a three-way merge:
 *
 * - The network with the newer full sync wins (followers, ghosts, the "since
 *   last sync" diff); the other side's follows/unfollows since `base` are
 *   re-applied to its following list (unless that side re-synced since
 *   `base`, which the newer sync supersedes).
 * - Ignore lists merge by what each side added or removed since `base`.
 *
 * Without a base (this session never read the gist, e.g. a forced refresh
 * straight after page load), a difference between the two sides can't be
 * attributed to either one, so the merge only ever keeps:
 *
 * - The network with the newer full sync wins whole, never mixed: follows and
 *   unfollows live on GitHub, and a full sync observed every one made before
 *   it started. One made elsewhere after that sync shows up with the next
 *   sync; it is never undone on GitHub.
 * - Ignore lists are unioned: an ignore made elsewhere is kept. (An un-ignore
 *   made elsewhere can come back; ignoring only hides, so that is the safe
 *   direction.)
 *
 * Either way:
 *
 * - Ghost removals (tombstones) are unioned.
 * - Settings and the write time are local: this write is the user's latest.
 * - A remote cache from a schema this code can't serve contributes its ignore
 *   list and ghost removals, never its network.
 */
export const mergeCacheData = (
  base: CacheBase | null,
  remote: CachedData,
  local: CachedData
): CachedData => {
  const remoteIsNewer =
    hasUsableNetwork(remote) && syncTime(remote) > syncTime(local);
  const primary = remoteIsNewer ? remote : local;
  const other = remoteIsNewer ? local : remote;

  // The other side's following list differs from `base` by its follows and
  // unfollows, unless it also re-synced since: then it differs by everything
  // that sync saw, which the newer sync in `primary` already supersedes.
  const following =
    !base || !hasUsableNetwork(other) || syncTime(other) > base.syncedAt
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

  const remoteIgnored = (remote.ignoredLogins ?? []).map(key);
  const localIgnored = new Set((local.ignoredLogins ?? []).map(key));
  let ignoredLogins: Set<string>;
  if (base) {
    const baseIgnored = new Set(base.ignoredLogins);
    ignoredLogins = new Set(
      [
        ...remoteIgnored,
        ...[...localIgnored].filter((login) => !baseIgnored.has(login)),
      ].filter((login) => !(baseIgnored.has(login) && !localIgnored.has(login)))
    );
  } else {
    ignoredLogins = new Set([...remoteIgnored, ...localIgnored]);
  }

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
