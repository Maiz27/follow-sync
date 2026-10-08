/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { readStorage, writeStorage } from '@/lib/storage';

type Modal = {
  type: 'star' | 'settings';
  props?: any;
} | null;

/** Single follow/unfollow actions in a session before the star prompt. */
export const STAR_PROMPT_ACTION_THRESHOLD = 5;
/** Once shown, don't ask again for this long. */
export const STAR_PROMPT_INTERVAL_MS = 1000 * 60 * 60 * 24 * 180; // ~6 months
/** Browser preference (not account data), so it survives sign-out. */
export const STAR_PROMPT_STORAGE_KEY = 'follow-sync:pref:star-prompted-at';

/** Whether the star prompt may be shown now (exported for tests). */
export const canShowStarPrompt = (now = Date.now()) => {
  const lastShown = Number(readStorage(STAR_PROMPT_STORAGE_KEY));
  return !lastShown || now - lastShown > STAR_PROMPT_INTERVAL_MS;
};

interface ModalsState {
  modal: Modal;
  actionCount: number;
  openModal: (type: 'star' | 'settings', props?: any) => void;
  closeModal: () => void;
  /**
   * Counts a single (non-bulk) action. After a few, the "star the repo" prompt
   * is shown once, then not again for months.
   */
  incrementActionCount: () => void;
}

export const useModalsStore = create<ModalsState>((set, get) => ({
  modal: null,
  actionCount: 0,
  openModal: (type, props) => set({ modal: { type, props } }),
  closeModal: () => set({ modal: null }),
  incrementActionCount: () => {
    const actionCount = get().actionCount + 1;
    if (
      actionCount >= STAR_PROMPT_ACTION_THRESHOLD &&
      !get().modal &&
      canShowStarPrompt()
    ) {
      writeStorage(STAR_PROMPT_STORAGE_KEY, String(Date.now()));
      set({ actionCount: 0, modal: { type: 'star' } });
      return;
    }
    set({ actionCount });
  },
}));
