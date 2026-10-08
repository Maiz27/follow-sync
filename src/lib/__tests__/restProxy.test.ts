import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/githubToken', () => ({
  getGitHubToken: vi.fn(async () => 'gh-token'),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST } from '@/app/api/gh/rest/[...path]/route';

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
  const handlers = { GET, POST, PATCH, DELETE } as const;

  it.each([
    ['GET', 'gists'],
    ['POST', 'gists'],
    ['GET', `gists/${GIST_ID}`],
    ['PATCH', `gists/${GIST_ID}`],
    ['DELETE', `gists/${GIST_ID}`],
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
    ['GET', `gists/${GIST_ID}/commits`],
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
