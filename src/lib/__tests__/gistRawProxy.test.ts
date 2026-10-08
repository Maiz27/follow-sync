import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getGitHubToken: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/githubToken', () => ({
  getGitHubToken: mocks.getGitHubToken,
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/gh/gist-raw/route';
import { MAX_GIST_RAW_BYTES } from '@/lib/server/readCapped';

const RAW_URL = 'https://gist.githubusercontent.com/octocat/abc/raw/def/file';

const request = (target: string, headers: Record<string, string> = {}) =>
  new NextRequest(
    `https://app.example/api/gh/gist-raw?url=${encodeURIComponent(target)}`,
    { headers: { host: 'app.example', ...headers } }
  );

/** A body streamed in chunks, with no Content-Length. */
const streamOf = (chunks: number, chunkSize: number) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < chunks; i++) {
        controller.enqueue(new Uint8Array(chunkSize).fill(97));
      }
      controller.close();
    },
  });

beforeEach(() => {
  mocks.getGitHubToken.mockResolvedValue('gh-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('/api/gh/gist-raw', () => {
  it('returns the raw file content', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(RAW_URL));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');
  });

  it.each([
    ['another host', 'https://evil.example/octocat/abc/raw/file'],
    ['plain http', 'http://gist.githubusercontent.com/o/a/raw/f'],
    ['credentials', 'https://user:pw@gist.githubusercontent.com/o/a/raw/f'],
    ['an explicit port', 'https://gist.githubusercontent.com:8443/o/a/raw/f'],
  ])('refuses %s', async (_label, target) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(target));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid url', async () => {
    expect((await GET(request('not a url'))).status).toBe(400);
  });

  it('rejects cross-site requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      request(RAW_URL, { 'sec-fetch-site': 'cross-site' })
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    mocks.getGitHubToken.mockResolvedValue(null);
    expect((await GET(request(RAW_URL))).status).toBe(401);
  });

  it('refuses to follow redirects and never forwards the token', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('unexpected redirect');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(RAW_URL));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(RAW_URL),
      expect.objectContaining({ redirect: 'error' })
    );
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(JSON.stringify(init.headers ?? {})).not.toContain('gh-token');
  });

  it('returns 413 when Content-Length exceeds the cap', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            headers: { 'content-length': String(MAX_GIST_RAW_BYTES + 1) },
          })
      )
    );

    const response = await GET(request(RAW_URL));

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
  });

  it('returns 413 when a streamed body grows past the cap', async () => {
    const chunk = 1024 * 1024;
    const chunks = Math.ceil(MAX_GIST_RAW_BYTES / chunk) + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(streamOf(chunks, chunk)))
    );

    const response = await GET(request(RAW_URL));

    expect(response.status).toBe(413);
  });
});
