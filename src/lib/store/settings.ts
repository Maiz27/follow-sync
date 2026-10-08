import { create } from 'zustand';
import { PAGE_SIZE_LIST } from '../constants';

export type SettingsState = {
  isSettingsModalOpen: boolean;
  showAvatars: boolean;
  paginationPageSize: number;
  customStaleTime: number | null;
};

export type SettingsActions = {
  toggleSettingsModal: () => void;
  setShowAvatars: (show: boolean) => void;
  setPaginationPageSize: (size: number) => void;
  setCustomStaleTime: (time: number | null) => void;
  saveSettings: (persistChanges: () => Promise<void>) => Promise<void>;
};

export type SettingsStore = SettingsState & SettingsActions;

/**
 * Snaps a page size to the supported options (older caches may hold 500).
 */
export const clampPageSize = (size: number) => {
  if (PAGE_SIZE_LIST.includes(size)) return size;
  const allowed = PAGE_SIZE_LIST.filter((option) => option <= size);
  return allowed.length ? allowed[allowed.length - 1] : PAGE_SIZE_LIST[0];
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  isSettingsModalOpen: false,
  showAvatars: true,
  paginationPageSize: PAGE_SIZE_LIST[0],
  customStaleTime: null,
  toggleSettingsModal: () =>
    set((state) => ({ isSettingsModalOpen: !state.isSettingsModalOpen })),
  setShowAvatars: (show) => set({ showAvatars: show }),
  setPaginationPageSize: (size) =>
    set({ paginationPageSize: clampPageSize(size) }),
  setCustomStaleTime: (time) => set({ customStaleTime: time }),
  saveSettings: async (persistChanges) => {
    await persistChanges();
  },
}));

/**
 * Extracts the user-facing settings that are persisted to the cache gist —
 * never UI state such as whether the settings modal is open.
 */
export const pickPersistedSettings = (
  state: SettingsState
): Pick<
  SettingsState,
  'showAvatars' | 'paginationPageSize' | 'customStaleTime'
> => ({
  showAvatars: state.showAvatars,
  paginationPageSize: state.paginationPageSize,
  customStaleTime: state.customStaleTime,
});
