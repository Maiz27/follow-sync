import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/server/githubToken';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

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

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  const data = await response.text();
  return new NextResponse(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
