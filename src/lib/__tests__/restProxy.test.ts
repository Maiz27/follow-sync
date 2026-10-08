import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/githubToken', () => ({
  getGitHubToken: vi.fn(async () => 'gh-token'),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST } from '@/app/api/gh/rest/[...path]/route';
import { GIST_FILENAME, MAX_PROXY_BODY_BYTES } from '@/lib/constants';

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (path: string, method = 'GET') =>
  new NextRequest(`https://app.example/api/gh/rest/${path}`, {
    method,
    headers: { host: 'app.example', 'sec-fetch-site': 'same-origin' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('/api/gh/rest allowlist', () => {
  it('proxies GET /user/following/{login} (used to confirm ghost removals)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      request('user/following/ghost'),
      ctx(['user', 'following', 'ghost'])
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/following/ghost',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('proxies DELETE /user/following/{login}', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(
      request('user/following/ghost', 'DELETE'),
      ctx(['user', 'following', 'ghost'])
    );

    expect(response.status).toBe(204);
  });

  it('refuses paths outside the allowlist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('user/emails'), ctx(['user', 'emails']));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const GIST_ID = 'aa5a315d61ae9438b18d';
  const REVISION = '468aac8caed5f0c3b859b8286968a1b2c3d4e5f6';
  const handlers = { GET, POST, PATCH, DELETE } as const;

  it.each([
    ['GET', 'gists'],
    ['POST', 'gists'],
    ['GET', `gists/${GIST_ID}`],
    ['PATCH', `gists/${GIST_ID}`],
    ['DELETE', `gists/${GIST_ID}`],
    ['GET', `gists/${GIST_ID}/commits`],
    ['GET', `gists/${GIST_ID}/${REVISION}`],
    ['GET', 'user/following'],
    ['GET', 'user/followers'],
    ['GET', 'user/following/octo-cat'],
    ['DELETE', 'user/following/octo-cat'],
  ] as const)('allows %s /%s', async (method, path) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handlers[method](
      request(path, method),
      ctx(path.split('/'))
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['POST', `gists/${GIST_ID}/forks`],
    ['POST', `gists/${GIST_ID}/commits`],
    ['PATCH', `gists/${GIST_ID}/${REVISION}`],
    ['DELETE', `gists/${GIST_ID}/${REVISION}`],
    ['GET', `gists/${GIST_ID}/${REVISION.slice(0, 39)}`],
    ['GET', `gists/${GIST_ID}/${REVISION}/extra`],
    ['GET', `gists/${GIST_ID}/forks`],
    ['GET', 'gists/public'],
    ['GET', 'gists/starred'],
    ['DELETE', `gists/${GIST_ID}/star`],
    ['GET', `gists/${GIST_ID}/comments`],
    ['PATCH', 'gists'],
    ['DELETE', 'gists'],
    ['POST', `gists/${GIST_ID}`],
    ['DELETE', 'user/followers'],
    ['POST', 'user/following'],
    ['PATCH', 'user/following/octocat'],
    ['GET', 'user'],
    ['GET', 'user/following/octocat/extra'],
  ] as const)('refuses %s /%s', async (method, path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handlers[method](
      request(path, method),
      ctx(path.split('/'))
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/api/gh/rest body limits', () => {
  const GIST_ID = 'aa5a315d61ae9438b18d';
  const gistJson = (files: Record<string, string>) =>
    JSON.stringify({
      id: GIST_ID,
      updated_at: '2024-01-01T00:00:00Z',
      history: Array.from({ length: 40 }, (_, i) => ({
        version: `v${40 - i}`,
        committed_at: '2024-01-01T00:00:00Z',
        user: { login: 'o', avatar_url: 'x'.repeat(200) },
      })),
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [
          name,
          {
            filename: name,
            content,
            truncated: false,
            raw_url: `https://gist.githubusercontent.com/o/${GIST_ID}/raw/${name}`,
          },
        ])
      ),
    });

  it('refuses a request body over the host limit with 413, without calling GitHub', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({
      files: { a: { content: 'x'.repeat(MAX_PROXY_BODY_BYTES) } },
    });

    const response = await PATCH(
      new NextRequest(`https://app.example/api/gh/rest/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: { host: 'app.example', 'sec-fetch-site': 'same-origin' },
        body,
      }),
      ctx(['gists', GIST_ID])
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops the largest inline contents from a gist response that would exceed the limit', async () => {
    const big = 'b'.repeat(1_000_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            gistJson({
              manifest: '{"m":1}',
              c1: big,
              c2: big,
              c3: big,
              c4: big,
              c5: big,
            })
          )
      )
    );

    const response = await GET(
      request(`gists/${GIST_ID}`),
      ctx(['gists', GIST_ID])
    );
    const text = await response.text();
    const gist = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(text.length).toBeLessThanOrEqual(MAX_PROXY_BODY_BYTES);
    expect(gist.files.manifest.content).toBe('{"m":1}');
    const dropped = Object.values(
      gist.files as Record<
        string,
        { content: string | null; truncated: boolean; raw_url: string }
      >
    ).filter((file) => file.content === null);
    expect(dropped.length).toBeGreaterThan(0);
    for (const file of dropped) {
      expect(file.truncated).toBe(true);
      expect(file.raw_url).toContain('gist.githubusercontent.com');
    }
    expect(gist.history).toHaveLength(30);
    expect(gist.history[0]).toEqual({
      version: 'v40',
      committed_at: '2024-01-01T00:00:00Z',
    });
  });

  it('drops every content but a small cache manifest when only the file list is asked for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            gistJson({ a: 'aaa', b: 'bbb', [GIST_FILENAME]: '{"m":1}' })
          )
      )
    );

    const response = await GET(
      new NextRequest(`https://app.example/api/gh/rest/gists/${GIST_ID}`, {
        headers: {
          host: 'app.example',
          'sec-fetch-site': 'same-origin',
          'x-follow-sync-gist-view': 'meta',
        },
      }),
      ctx(['gists', GIST_ID])
    );
    const gist = await response.json();

    expect(Object.keys(gist.files)).toEqual(['a', 'b', GIST_FILENAME]);
    expect(gist.files.a).toMatchObject({ content: null, truncated: true });
    expect(gist.files[GIST_FILENAME]).toMatchObject({ content: '{"m":1}' });
  });

  it('drops a large single-file cache from a file-list view too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(gistJson({ [GIST_FILENAME]: 'x'.repeat(100_000) }))
      )
    );

    const response = await GET(
      new NextRequest(`https://app.example/api/gh/rest/gists/${GIST_ID}`, {
        headers: {
          host: 'app.example',
          'sec-fetch-site': 'same-origin',
          'x-follow-sync-gist-view': 'meta',
        },
      }),
      ctx(['gists', GIST_ID])
    );
    const gist = await response.json();

    expect(gist.files[GIST_FILENAME]).toMatchObject({
      content: null,
      truncated: true,
    });
  });

  it('answers 413 instead of relaying a non-gist response over the limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(['x'.repeat(MAX_PROXY_BODY_BYTES)]))
      )
    );

    const response = await GET(
      request('user/following'),
      ctx(['user', 'following'])
    );

    expect(response.status).toBe(413);
  });
});
