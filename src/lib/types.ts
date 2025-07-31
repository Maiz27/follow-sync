import { FollowerFieldsFragment, GetGistByNameQuery } from './gql/types';

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
