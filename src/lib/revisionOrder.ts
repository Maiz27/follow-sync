/** A gist `history` entry or `GET /gists/{id}/commits` item. */
export type DatedRevision = {
  version?: string | null;
  committed_at?: string | null;
};

const commitTime = (entry: DatedRevision) => {
  const time = Date.parse(entry.committed_at ?? '');
  return Number.isNaN(time) ? null : time;
};

/**
 * Revision entries newest first. GitHub lists a gist's `history` and its
 * commits newest first, but doesn't document that as a guarantee, so the
 * order is checked rather than assumed: a list whose first entry is older
 * than its last is reversed, then entries are sorted by `committed_at`,
 * newest first. `committed_at` has one-second resolution, so entries with
 * the same time keep the (corrected) order the list gave them. Entries
 * without a version are dropped.
 */
export const sortRevisionsNewestFirst = <T extends DatedRevision>(
  entries: ReadonlyArray<T | null | undefined>
): T[] => {
  const list = entries.filter(
    (entry): entry is T => typeof entry?.version === 'string'
  );
  if (list.length < 2) return list;

  const first = commitTime(list[0]);
  const last = commitTime(list[list.length - 1]);
  const ordered =
    first !== null && last !== null && first < last
      ? [...list].reverse()
      : list;

  // Only a fully dated list is sorted; one with gaps keeps the given order.
  if (ordered.some((entry) => commitTime(entry) === null)) return ordered;
  return ordered
    .map((entry, index) => ({ entry, index, time: commitTime(entry)! }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .map(({ entry }) => entry);
};
