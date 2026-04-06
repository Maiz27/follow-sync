import { UserInfoFragment } from './gql/types';
import { SettingsState } from './store/settings';

export interface CacheGistFile {
  name: string;
  text?: string | null;
}

export interface CacheGist {
  id: string;
  name?: string | null;
  description?: string | null;
  updatedAt?: string | null;
  files: CacheGistFile[];
}

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
    ownerLogin?: string;
    cacheKey?: string;
  };
}

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

export interface ProgressCallbackItem {
  label: string;
  current: number;
  total: number;
  isApproximateTotal?: boolean;
}

// Define the structure for progress callbacks to decouple from the hook
export interface ProgressCallbacks {
  show: (config: {
    title: string;
    message: string;
    items: ProgressCallbackItem[];
  }) => void;
  update: (items: ProgressCallbackItem[]) => void;
  complete: () => void;
  fail: (config: { message: string }) => void;
}
