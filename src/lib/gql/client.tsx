import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { GraphQLClient } from 'graphql-request';
import { GH_GRAPHQL_PROXY } from '@/lib/constants';

/**
 * Provides a GraphQLClient for client components that points at the same-origin
 * GraphQL proxy (`/api/gh/graphql`). The proxy injects the GitHub access token
 * server-side, so no token is ever held or sent by the browser.
 *
 * @returns {object}
 * - client: the GraphQLClient instance, or null while unauthenticated/loading.
 * - status: the authentication status.
 */
export const useClientAuthenticatedGraphQLClient = () => {
  const { status } = useSession();
  const [client, setClient] = useState<GraphQLClient | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      // graphql-request resolves the endpoint with `new URL()`, which rejects
      // relative paths — so build an absolute same-origin URL.
      const endpoint = `${window.location.origin}${GH_GRAPHQL_PROXY}`;
      setClient(
        new GraphQLClient(endpoint, {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } else {
      setClient(null);
    }
  }, [status]);

  return { client, status };
};
