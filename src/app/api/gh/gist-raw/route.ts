import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/server/githubToken';
import { isSameOriginRequest } from '@/lib/server/requestGuards';
import { buildProxyHeaders } from '@/lib/server/proxyHeaders';

const RAW_GIST_HOST = 'gist.githubusercontent.com';
const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Fetches the full content of a gist file whose API response was truncated
 * (GitHub cuts `content` at 1 MB and points to `raw_url` instead). Only raw
 * gist URLs are accepted — this is not an open proxy — and only for signed-in
 * users. Proxied (rather than fetched by the browser) so the app keeps talking
 * to its own origin only.
 */
export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const target = req.nextUrl.searchParams.get('url');
  let url: URL;
  try {
    url = new URL(target ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== RAW_GIST_HOST ||
    url.username ||
    url.password ||
    url.port
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    // Raw URLs of secret gists are capability URLs and need no credentials,
    // so the token is not forwarded to the raw host at all. The session check
    // above only keeps this route from being usable by anonymous callers.
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
    });
    const data = await response.text();
    return new NextResponse(data || null, {
      status: response.status,
      headers: buildProxyHeaders(response, 'text/plain; charset=utf-8'),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upstream request to GitHub timed out.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to reach GitHub.' },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
