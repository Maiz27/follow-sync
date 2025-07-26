import {
  ApolloClient,
  InMemoryCache,
  ApolloLink,
  HttpLink,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { registerApolloClient } from '@apollo/client-integration-nextjs';
import { auth } from '@/app/auth';

export const { getClient, query, PreloadQuery } = registerApolloClient(
  async () => {
    const session = await auth();
    const token = session?.accessToken;

    const authLink = setContext((_, { headers }) => ({
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    }));

    const httpLink = new HttpLink({
      uri: 'https://api.github.com/graphql',
    });

    return new ApolloClient({
      cache: new InMemoryCache(),
      link: ApolloLink.from([authLink, httpLink]),
    });
  }
);
