import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/server/githubToken';

const GITHUB_REST_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Only the REST endpoints this app actually needs are proxied — this is NOT an
 * open proxy to the GitHub API. Adding a path here is a deliberate decision.
 */
const isAllowedPath = (segments: string[]) => {
  if (segments[0] === 'gists') return true; // gists, gists/{id}
  if (
    segments[0] === 'user' &&
    (segments[1] === 'following' || segments[1] === 'followers')
  ) {
    return true; // user/following[/{login}], user/followers
  }
  return false;
};

const proxy = async (
  req: NextRequest,
  segments: string[],
  method: string
) => {
  if (!isAllowedPath(segments)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = segments.map(encodeURIComponent).join('/');
  const url = `${GITHUB_REST_URL}/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };

  const init: RequestInit = { method, headers };
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    headers['Content-Type'] = 'application/json';
    init.body = await req.text();
  }

  // Bound the upstream call so a stalled GitHub connection can't hang the
  // request indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.text();

    return new NextResponse(data || null, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
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
};

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'GET');
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'POST');
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'PATCH');
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path, 'DELETE');
}
