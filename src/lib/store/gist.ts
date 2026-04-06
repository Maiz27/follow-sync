import { create } from 'zustand';
import { CachedData } from '@/lib/types';
import { GIST_ID_STORAGE_KEY } from '@/lib/constants';

export type GistState = {
  timestamp: number | null;
  gistName: string | null;
  metadata: CachedData['metadata'] | null;
  duplicateGistCount: number;
  forceNextRefresh: boolean;
};

export type GistActions = {
  setGistName: (gistName: string | null) => void;
  setDuplicateGistCount: (count: number) => void;
  setForceNextRefresh: (force: boolean) => void;
  setGistData: (data: {
    timestamp: number;
    metadata: CachedData['metadata'];
  }) => void;
  setTimestamp: (timestamp: number) => void;
};

export type GistStore = GistState & GistActions;

const initialState: GistState = {
  timestamp: null,
  gistName: null,
  metadata: null,
  duplicateGistCount: 0,
  forceNextRefresh: false,
};

export const useGistStore = create<GistStore>((set) => ({
  ...initialState,
  setGistName: (gistName) => {
    if (gistName) {
      window.localStorage.setItem(GIST_ID_STORAGE_KEY, gistName);
    } else {
      window.localStorage.removeItem(GIST_ID_STORAGE_KEY);
    }
    set({ gistName });
  },
  setDuplicateGistCount: (duplicateGistCount) => {
    set({ duplicateGistCount });
  },
  setForceNextRefresh: (force) => {
    set({ forceNextRefresh: force });
  },
  setGistData: (data) => {
    set(data);
  },
  setTimestamp: (timestamp) => {
    set({ timestamp });
  },
}));
