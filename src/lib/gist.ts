import { GraphQLClient } from 'graphql-request';
import { GET_GIST_BY_NAME, GET_VIEWER_GISTS } from './gql/queries';
import { CacheGist, CachedData } from './types';
import type { GetGistByNameQuery, GetViewerGistsQuery } from './gql/types';
import { GIST_FILENAME, GIST_DESCRIPTION } from './constants';

/**
 * Parses the content of a Gist object retrieved from the GraphQL API.
 * @param gist - The Gist object from GraphQL.
 * @returns The parsed CachedData object or null if parsing fails.
 */
export const parseCache = (gist: CacheGist): CachedData | null => {
  try {
    const file = gist?.files?.find((f) => f?.name === GIST_FILENAME);
    const content = file?.text;
    if (!content) return null;
    return JSON.parse(content) as CachedData;
  } catch (error) {
    console.error('Failed to parse cache content:', error);
    return null;
  }
};

/**
 * Finds the cache Gist. It first checks localStorage for a saved ID for a direct
 * fetch, and falls back to searching the user's gists if not found.
 * @param client - The authenticated GraphQL client.
 * @returns The Gist object from GraphQL or null if not found.
 */
export const findCacheGist = async (
  client: GraphQLClient,
  gistName?: string | null
): Promise<CacheGist | null> => {
  if (gistName) {
    try {
      const data = await client.request<GetGistByNameQuery>(GET_GIST_BY_NAME, {
        name: gistName,
      });
      const foundGist = data.viewer.gist;
      if (foundGist && foundGist.description === GIST_DESCRIPTION) {
        return foundGist;
      }
    } catch (error) {
      console.warn(
        'Failed to fetch Gist by stored ID, it may have been deleted.',
        error
      );
    }
  }

  const searchData = await client.request<GetViewerGistsQuery>(
    GET_VIEWER_GISTS,
    {
      number: 20,
    }
  );

  console.log('Searching for Gist:', searchData.viewer.gists.nodes);

  const foundGist = searchData.viewer.gists.nodes?.find(
    (gist) => gist?.description === GIST_DESCRIPTION
  );

  return (foundGist as CacheGist) || null;
};

/**
 * Creates or updates a Gist and saves the new Gist's ID to localStorage.
 * @param token - The user's raw OAuth token for REST API access.
 * @param data - The data to write to the cache.
 * @param gistId - The ID of an existing Gist to update (optional).
 */
export const writeCache = async (
  token: string,
  data: CachedData,
  gistId?: string | null
) => {
  const content = JSON.stringify(data, null, 2);
  const body = {
    description: GIST_DESCRIPTION,
    files: { [GIST_FILENAME]: { content } },
    public: false,
  };

  // If a gistId is provided, try to update it first.
  if (gistId) {
    const url = `https://api.github.com/gists/${gistId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });

    // If successful, we're done.
    if (response.ok) {
      return response.json();
    }

    // If the Gist was not found, we'll fall through to create a new one.
    // Any other error, however, should be thrown.
    if (response.status !== 404) {
      const errorBody = await response.json();
      console.error('Failed to update Gist cache:', errorBody);
      throw new Error('Failed to update Gist cache.');
    }
  }

  // If no gistId was provided or the update failed with a 404, create a new Gist.
  const createUrl = `https://api.github.com/gists`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.json();
    console.error('Failed to create Gist cache:', errorBody);
    throw new Error('Failed to create Gist cache.');
  }

  return createResponse.json();
};
