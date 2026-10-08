import { create } from 'zustand';
import { CachedData } from '@/lib/types';
import { gistIdStorageKey } from '@/lib/constants';
import { writeStorage } from '@/lib/storage';

export type GistState = {
  timestamp: number | null;
  gistName: string | null;
  /**
   * Login the remembered gist id belongs to. The id is stored per account, so
   * nothing is written to localStorage until the owner is known.
   */
  ownerLogin: string | null;
  metadata: CachedData['metadata'] | null;
  duplicateGistCount: number;
  forceNextRefresh: boolean;
};

export type GistActions = {
  setOwnerLogin: (ownerLogin: string | null) => void;
  setGistName: (gistName: string | null) => void;
  setDuplicateGistCount: (count: number) => void;
  setForceNextRefresh: (force: boolean) => void;
  setGistData: (data: {
    timestamp: number;
    metadata: CachedData['metadata'];
  }) => void;
};

export type GistStore = GistState & GistActions;

const initialState: GistState = {
  timestamp: null,
  gistName: null,
  ownerLogin: null,
  metadata: null,
  duplicateGistCount: 0,
  forceNextRefresh: false,
};

export const useGistStore = create<GistStore>((set, get) => ({
  ...initialState,
  setOwnerLogin: (ownerLogin) => {
    set({ ownerLogin: ownerLogin?.toLowerCase() ?? null });
  },
  setGistName: (gistName) => {
    const { ownerLogin } = get();
    if (ownerLogin) {
      writeStorage(gistIdStorageKey(ownerLogin), gistName);
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
}));
