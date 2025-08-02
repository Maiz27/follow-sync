import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { usernames } = await req.json();

    console.log('Verifying ghosts Hit...');

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json(
        { error: 'Usernames must be a non-empty array' },
        { status: 400 }
      );
    }

    const verificationPromises = usernames.map(async (username) => {
      try {
        const response = await fetch(`https://github.com/${username}`, {
          method: 'HEAD',
        });
        return {
          username,
          isGhost: response.status === 404,
        };
      } catch (error) {
        return {
          username,
          isGhost: false, // Assume not a ghost on network error
        };
      }
    });

    const results = await Promise.all(verificationPromises);
    const ghosts = results
      .filter((result) => result.isGhost)
      .map((result) => result.username);

    return NextResponse.json({ ghosts });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
