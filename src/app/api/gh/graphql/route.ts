import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/server/githubToken';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Server-side proxy for the GitHub GraphQL API. The browser sends queries here
 * (same-origin, authenticated by the session cookie) and the access token is
 * injected on the server, so it never reaches client code.
 */
export async function POST(req: NextRequest) {
  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.text();

  // Bound the upstream call so a stalled GitHub connection can't hang the
  // request indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });

    const data = await response.text();
    return new NextResponse(data, {
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
}
