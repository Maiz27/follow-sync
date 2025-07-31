import { GraphQLClient } from 'graphql-request';
import { GET_GIST_BY_NAME, GET_VIEWER_GISTS } from './gql/queries';
import type {
  FollowerFieldsFragment,
  GetGistByNameQuery,
  GetViewerGistsQuery,
} from './gql/types';
import {
  GIST_FILENAME,
  GIST_ID_STORAGE_KEY,
  GIST_DESCRIPTION,
} from './constants';

export interface CachedData {
  timestamp: number;
  ghosts: string[];
  network: {
    followers: FollowerFieldsFragment['nodes'];
    following: FollowerFieldsFragment['nodes'];
  };
  metadata: {
    totalConnections: number;
    fetchDuration: number;
    cacheVersion: string;
  };
}

// Type guard for our Gist object from GraphQL.
type CacheGist = GetGistByNameQuery['viewer']['gist'];

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
  client: GraphQLClient
): Promise<CacheGist | null> => {
  const storedGistId = window.localStorage.getItem(GIST_ID_STORAGE_KEY);

  if (storedGistId) {
    console.log('Found stored gist id in localStorage', storedGistId);
    try {
      // CHANGE the query being called and the variable name
      const data = await client.request<GetGistByNameQuery>(GET_GIST_BY_NAME, {
        name: storedGistId,
      });

      // ADJUST the path to the gist object
      const foundGist = data.viewer.gist;

      if (foundGist && foundGist.description === GIST_DESCRIPTION) {
        // The __typename check is no longer needed with this specific query
        return foundGist;
      }
    } catch (error) {
      console.warn(
        'Failed to fetch Gist by stored ID, it may have been deleted.',
        error
      );
    }
    window.localStorage.removeItem(GIST_ID_STORAGE_KEY);
  }

  const searchData = await client.request<GetViewerGistsQuery>(
    GET_VIEWER_GISTS,
    {
      number: 20,
    }
  );

  const foundGist = searchData.viewer.gists.nodes?.find(
    (gist) => gist?.description === GIST_DESCRIPTION
  );

  if (foundGist) {
    console.log('Found gist in user gists', searchData);
    window.localStorage.setItem(GIST_ID_STORAGE_KEY, foundGist.id);
    return foundGist as CacheGist;
  }

  return null;
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
  gistId?: string
) => {
  const content = JSON.stringify(data, null, 2);
  const method = gistId ? 'PATCH' : 'POST';
  const url = `https://api.github.com/gists${gistId ? `/${gistId}` : ''}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      files: { [GIST_FILENAME]: { content } },
      public: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    console.error('Failed to write cache:', errorBody);
    throw new Error('Failed to write to Gist cache.');
  }

  const newGist = await response.json();
  window.localStorage.setItem(GIST_ID_STORAGE_KEY, newGist.id);
  return newGist;
};
