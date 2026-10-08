import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/githubToken', () => ({
  getGitHubToken: vi.fn(async () => 'gh-token'),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET } from '@/app/api/gh/rest/[...path]/route';

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
});
