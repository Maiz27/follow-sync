import 'server-only';
import { MAX_PROXY_BODY_BYTES } from '@/lib/constants';

/**
 * Largest gist file the raw proxy relays: what the host can return from a
 * function (Vercel refuses responses over 4.5 MB). Cache chunk files are far
 * smaller; only an old single-file cache can exceed it, and is then resynced
 * and rewritten in chunks.
 */
export const MAX_GIST_RAW_BYTES = MAX_PROXY_BODY_BYTES;

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
