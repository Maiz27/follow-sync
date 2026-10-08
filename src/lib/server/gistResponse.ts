import 'server-only';

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

export const byteLength = (text: string) => Buffer.byteLength(text, 'utf8');

/**
 * Shrinks a single-gist response (GET/PATCH /gists/{id}, POST /gists) so the
 * proxy can return it under the host's response limit:
 *
 * - `history` is cut to its latest entry (the current revision), which is all
 *   the app reads;
 * - with `omitContent`, every file's inline content is dropped (the caller
 *   asked for file names and the revision only);
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

  if (Array.isArray(gist.history)) gist.history = gist.history.slice(0, 1);

  const files = Object.values(gist.files ?? {});
  const drop = (file: GistFileJson) => {
    file.content = null;
    file.truncated = true;
  };

  if (omitContent) {
    files.forEach(drop);
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
