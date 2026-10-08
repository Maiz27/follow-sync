import 'server-only';

/**
 * Largest gist file the raw proxy relays. GitHub serves files of any size from
 * raw URLs; a cache is a few MB even for very large networks, so anything far
 * past that is not ours to buffer in server memory.
 */
export const MAX_GIST_RAW_BYTES = 20 * 1024 * 1024;

export type CappedText = { ok: true; text: string } | { ok: false };

/**
 * Reads a response body as text, giving up (and cancelling the upstream body)
 * as soon as it is known to exceed `maxBytes`: up front from Content-Length,
 * otherwise by counting bytes while streaming.
 */
export const readTextCapped = async (
  response: Response,
  maxBytes: number
): Promise<CappedText> => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false };
  }

  if (!response.body) return { ok: true, text: '' };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    text += decoder.decode(value, { stream: true });
  }

  return { ok: true, text: text + decoder.decode() };
};
