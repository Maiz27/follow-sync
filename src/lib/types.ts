import { GetGistByNameQuery, UserInfoFragment } from './gql/types';

export interface CachedData {
  timestamp: number;
  ghosts: UserInfoFragment[];
  network: {
    followers: UserInfoFragment[];
    following: UserInfoFragment[];
  };
  metadata: {
    totalConnections: number;
    fetchDuration: number;
    cacheVersion: string;
  };
}

// Type guard for our Gist object from GraphQL.
export type CacheGist = GetGistByNameQuery['viewer']['gist'];

export type textSizes =
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl';
