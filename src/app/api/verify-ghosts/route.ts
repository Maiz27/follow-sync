import { NextRequest, NextResponse } from 'next/server';

const VERIFY_GHOST_CONCURRENCY = 5;

const verifyGhostUsername = async (username: string) => {
  try {
    const response = await fetch(`https://github.com/${username}`, {
      method: 'HEAD',
    });

    return {
      username,
      isGhost: response.status === 404,
    };
  } catch {
    return {
      username,
      isGhost: false,
    };
  }
};

export async function POST(req: NextRequest) {
  try {
    const { usernames } = await req.json();

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json(
        { error: 'Usernames must be a non-empty array' },
        { status: 400 }
      );
    }

    const uniqueUsernames = Array.from(
      new Set(
        usernames.filter(
          (username): username is string =>
            typeof username === 'string' && username.length > 0
        )
      )
    );

    if (uniqueUsernames.length === 0) {
      return NextResponse.json(
        { error: 'Usernames must be a non-empty array' },
        { status: 400 }
      );
    }

    const results = [] as Awaited<ReturnType<typeof verifyGhostUsername>>[];

    for (let i = 0; i < uniqueUsernames.length; i += VERIFY_GHOST_CONCURRENCY) {
      const currentBatch = uniqueUsernames.slice(
        i,
        i + VERIFY_GHOST_CONCURRENCY
      );
      const currentResults = await Promise.all(
        currentBatch.map(verifyGhostUsername)
      );

      results.push(...currentResults);
    }

    const ghosts = results
      .filter((result) => result.isGhost)
      .map((result) => result.username);

    return NextResponse.json({ ghosts });
  } catch {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
