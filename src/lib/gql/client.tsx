import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { GraphQLClient, Variables } from 'graphql-request';
import { auth } from '@/app/auth';
import { DocumentNode } from 'graphql';

const GITHUB_API_URL = 'https://api.github.com/graphql';

/**
 * Creates and returns a GraphQLClient instance for Server Components or API Routes.
 * Authenticates using either a user's session token or a provided custom token.
 *
 * This function should be used in server-side contexts where `auth()` is available
 * and can securely retrieve a user's session, or when a specific service token
 * is needed for API access.
 *
 * @param {object} [options] - Optional configuration object.
 * @param {string} [options.customToken] - An optional, explicit authorization token
 * to use for the GraphQL client. If provided, this token will take precedence
 * over the token obtained from the user's session. Useful for service-level
 * authentication or system-wide operations.
 * @returns {Promise<GraphQLClient>} A promise that resolves to a configured GraphQLClient instance.
 */
export const createServerGraphQLClient = async ({
  customToken,
}: {
  customToken?: string;
}): Promise<GraphQLClient> => {
  let token: string | undefined;

  if (customToken) {
    // If a custom token is provided, prioritize it
    token = customToken;
  } else {
    // Otherwise, try to get the token from the user's session (server-side)
    const session = await auth();
    token = session?.accessToken;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return new GraphQLClient(GITHUB_API_URL, {
    headers,
  });
};

/**
 * Custom React Hook to provide an authenticated GraphQLClient instance
 * for Client Components.
 * Uses 'useSession()' to obtain the access token from the client-side session.
 *
 * @returns {object} An object containing:
 * - client: The GraphQLClient instance, or null if not authenticated/loading.
 * - status: The authentication status ('loading', 'authenticated', 'unauthenticated').
 */
export const useClientAuthenticatedGraphQLClient = () => {
  // Mark this file or the component using this hook as 'use client'
  // if this file is not already marked as such and this hook is used directly in a component.
  // Example: 'use client'; at the top of a component file that imports this.
  const { data: session, status } = useSession(); // This is the client-side NextAuth.js 'useSession' hook
  const [client, setClient] = useState<GraphQLClient | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      const token = session?.accessToken;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      setClient(new GraphQLClient(GITHUB_API_URL, { headers }));
    } else {
      setClient(null); // Clear client if not authenticated or loading
    }
  }, [session, status]); // Re-create client when session or status changes

  return { client, status };
};

/**
 * Executes a GraphQL query or mutation using an authenticated GraphQLClient instance.
 *
 * Can be used generically across both queries and mutations in React Query
 * or any data-fetching context. Handles typed variables and responses.
 *
 * @template TData The expected shape of the GraphQL response.
 * @template TVariables The shape of the variables used in the query or mutation.
 * @param {GraphQLClient} client - An authenticated GraphQLClient instance.
 * @param {DocumentNode | string} query - The GraphQL query or mutation document.
 * @param {TVariables} variables - The variables for the GraphQL operation.
 * @returns {Promise<TData>} A promise that resolves with the typed response data.
 * @throws {Error} If the request fails, the error will be thrown for error handling.
 */
export const graphqlRequest = async <TData, TVariables extends Variables>({
  client,
  query,
  variables,
}: {
  client: GraphQLClient;
  query: DocumentNode | string;
  variables: TVariables;
}): Promise<TData> => {
  console.log(query, variables);
  try {
    const data = await client.request<TData>(query, { ...variables });
    return data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('GraphQL request failed:', error);
    throw new Error(error.message || 'GraphQL request failed.');
  }
};
