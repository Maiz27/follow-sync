import { GetGistByNameQuery, UserInfoFragment } from './gql/types';
import { SettingsState } from './store/settings';

export interface CachedData {
  network: {
    followers: UserInfoFragment[];
    following: UserInfoFragment[];
  };
  ghosts: UserInfoFragment[];
  settings: SettingsState;
  timestamp: number;
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
