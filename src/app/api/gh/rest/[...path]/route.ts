import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/server/githubToken';
import { isSameOriginRequest } from '@/lib/server/requestGuards';
import { buildProxyHeaders } from '@/lib/server/proxyHeaders';

const GITHUB_REST_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const UPSTREAM_TIMEOUT_MS = 30_000;

// Gist ids are hex (very old ones are decimal). Requiring that keeps the
// sibling collection routes (`gists/public`, `gists/starred`) out.
const GIST_ID = /^[0-9a-f]{1,64}$/i;
// GitHub logins: letters, digits and hyphens (a few legacy ones differ, so
// this is deliberately loose — it only has to be a single path segment).
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Rule = { pattern: Array<string | RegExp>; methods: Method[] };

/**
 * Only the REST endpoints (and methods) this app actually calls are proxied —
 * this is NOT an open proxy to the GitHub API. Adding one here is a deliberate
 * decision; see `src/lib/gist.ts` and `src/lib/gql/fetchers.ts`.
 */
const ALLOWED: Rule[] = [
  // List the account's gists (cache discovery) / create the cache gist.
  { pattern: ['gists'], methods: ['GET', 'POST'] },
  // Read, write and delete (duplicate cleanup) a cache gist.
  { pattern: ['gists', GIST_ID], methods: ['GET', 'PATCH', 'DELETE'] },
  // REST follow lists (organizations and ghost detection).
  { pattern: ['user', 'following'], methods: ['GET'] },
  { pattern: ['user', 'followers'], methods: ['GET'] },
  // Ghost removal, and confirming one that 404'd.
  { pattern: ['user', 'following', LOGIN], methods: ['GET', 'DELETE'] },
];

const isAllowedRequest = (segments: string[], method: string) =>
  ALLOWED.some(
    (rule) =>
      rule.methods.includes(method as Method) &&
      rule.pattern.length === segments.length &&
      rule.pattern.every((part, i) =>
        typeof part === 'string' ? part === segments[i] : part.test(segments[i])
      )
  );

const proxy = async (req: NextRequest, segments: string[], method: string) => {
  if (!isAllowedRequest(segments, method) || !isSameOriginRequest(req)) {
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
      headers: buildProxyHeaders(response),
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
