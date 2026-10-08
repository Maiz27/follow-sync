import 'server-only';

import { GIST_FILENAME } from '@/lib/constants';
import { DatedRevision, sortRevisionsNewestFirst } from '@/lib/revisionOrder';

type GistFileJson = {
  content?: string | null;
  truncated?: boolean;
  [key: string]: unknown;
};

type GistJson = {
  files?: Record<string, GistFileJson>;
  history?: unknown[];
  [key: string]: unknown;
};

const isGistJson = (value: unknown): value is GistJson =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as GistJson).files === 'object' &&
  (value as GistJson).files !== null;

/**
 * History entries kept: enough for a writer to see every revision made since
 * it checked the gist (its own requests plus any other writer's). Each is cut
 * down to its version and time; the user object it carries isn't needed.
 */
export const MAX_HISTORY_ENTRIES = 30;

/**
 * A cache manifest (the file named GIST_FILENAME) at most this long keeps its
 * content in a `meta` view: it is what identifies the cache a revision holds.
 * Sharded manifests are a few KB; a single-file cache from before sharding is
 * far larger and dropped like any content.
 */
export const MAX_META_MANIFEST_CHARS = 64_000;

const slimHistoryEntry = (entry: unknown) => {
  if (typeof entry !== 'object' || entry === null) return entry;
  const { version, committed_at } = entry as Record<string, unknown>;
  return { version, committed_at };
};

export const byteLength = (text: string) => Buffer.byteLength(text, 'utf8');

/**
 * Shrinks a single-gist response (GET/PATCH /gists/{id}, POST /gists) so the
 * proxy can return it under the host's response limit:
 *
 * - `history` is put newest first (see sortRevisionsNewestFirst) and cut to
 *   its latest MAX_HISTORY_ENTRIES entries, each to its version and time
 *   (the app reads the revisions since its last check);
 * - with `omitContent`, every file's inline content is dropped (the caller
 *   asked for file names and the revision only), except a small cache
 *   manifest, which identifies the cache the gist holds;
 * - otherwise, while the body is over `maxBytes`, the largest inline contents
 *   are dropped first.
 *
 * A dropped content is reported as `truncated: true`, exactly like GitHub's
 * own 1 MB cut, so the client fetches that file from its `raw_url` instead.
 * Anything that isn't a single gist is returned unchanged.
 */
export const shapeGistResponse = (
  body: string,
  { omitContent, maxBytes }: { omitContent: boolean; maxBytes: number }
): string => {
  let gist: unknown;
  try {
    gist = JSON.parse(body);
  } catch {
    return body;
  }
  if (!isGistJson(gist)) return body;

  if (Array.isArray(gist.history)) {
    // Newest first before cutting, whatever order GitHub listed them in.
    gist.history = sortRevisionsNewestFirst(
      gist.history as Array<DatedRevision | null>
    )
      .slice(0, MAX_HISTORY_ENTRIES)
      .map(slimHistoryEntry);
  }

  const files = Object.values(gist.files ?? {});
  const drop = (file: GistFileJson) => {
    file.content = null;
    file.truncated = true;
  };

  if (omitContent) {
    for (const [name, file] of Object.entries(gist.files ?? {})) {
      const keep =
        name === GIST_FILENAME &&
        typeof file.content === 'string' &&
        !file.truncated &&
        file.content.length <= MAX_META_MANIFEST_CHARS;
      if (!keep) drop(file);
    }
    return JSON.stringify(gist);
  }

  const text = JSON.stringify(gist);
  let size = byteLength(text);
  if (size <= maxBytes) return text;

  const bySize = files
    .filter((file) => typeof file.content === 'string')
    .sort(
      (a, b) => (b.content as string).length - (a.content as string).length
    );
  for (const file of bySize) {
    // Dropping a content saves its serialized size, less the `null` and
    // `"truncated":true` that replace it.
    size -= byteLength(JSON.stringify(file.content)) - 32;
    drop(file);
    if (size <= maxBytes) break;
  }
  return JSON.stringify(gist);
};
