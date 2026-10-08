import { create } from 'zustand';
import { CachedData } from '@/lib/types';
import type { NetworkDiff } from '@/lib/networkDiff';
import { gistIdStorageKey } from '@/lib/constants';
import { writeStorage } from '@/lib/storage';

export type GistState = {
  /** When the cache was last written. */
  timestamp: number | null;
  /** When the network was last fully synced from GitHub. */
  syncedAt: number | null;
  gistName: string | null;
  /**
   * Login the remembered gist id belongs to. The id is stored per account, so
   * nothing is written to localStorage until the owner is known.
   */
  ownerLogin: string | null;
  /**
   * The account's current login as GitHub reports it (GraphQL viewer, or the
   * owner of its gists). Differs from the session login after a GitHub rename
   * until the session refreshes; cache writes are labelled with it.
   */
  viewerLogin: string | null;
  metadata: CachedData['metadata'] | null;
  duplicateGistCount: number;
  forceNextRefresh: boolean;
  /** "Changes since last sync" summary, persisted in the cache. */
  lastDiff: NetworkDiff | null;
};

export type GistActions = {
  setOwnerLogin: (ownerLogin: string | null) => void;
  setViewerLogin: (viewerLogin: string | null) => void;
  setGistName: (gistName: string | null) => void;
  setDuplicateGistCount: (count: number) => void;
  setForceNextRefresh: (force: boolean) => void;
  setLastDiff: (diff: NetworkDiff | null) => void;
  /** Forgets everything about the current account (in memory only). */
  reset: () => void;
  setGistData: (data: {
    timestamp: number;
    /** Omit to keep the current sync time (a plain write). */
    syncedAt?: number;
    metadata: CachedData['metadata'];
  }) => void;
};

export type GistStore = GistState & GistActions;

const initialState: GistState = {
  timestamp: null,
  syncedAt: null,
  gistName: null,
  ownerLogin: null,
  viewerLogin: null,
  metadata: null,
  duplicateGistCount: 0,
  forceNextRefresh: false,
  lastDiff: null,
};

export const useGistStore = create<GistStore>((set, get) => ({
  ...initialState,
  setOwnerLogin: (ownerLogin) => {
    const next = ownerLogin?.toLowerCase() ?? null;
    // A different account: whatever identity was resolved for the previous
    // one no longer applies.
    if (next !== get().ownerLogin) set({ viewerLogin: null });
    set({ ownerLogin: next });
  },
  setViewerLogin: (viewerLogin) => {
    set({ viewerLogin: viewerLogin?.toLowerCase() ?? null });
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
  setLastDiff: (lastDiff) => {
    set({ lastDiff });
  },
  reset: () => {
    set(initialState);
  },
  setGistData: ({ timestamp, syncedAt, metadata }) => {
    set(
      syncedAt === undefined
        ? { timestamp, metadata }
        : { timestamp, syncedAt, metadata }
    );
  },
}));
