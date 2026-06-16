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

export const useSettingsStore = create<SettingsStore>((set) => ({
  isSettingsModalOpen: false,
  showAvatars: true,
  paginationPageSize: PAGE_SIZE_LIST[0],
  customStaleTime: null,
  toggleSettingsModal: () =>
    set((state) => ({ isSettingsModalOpen: !state.isSettingsModalOpen })),
  setShowAvatars: (show) => set({ showAvatars: show }),
  setPaginationPageSize: (size) => set({ paginationPageSize: size }),
  setCustomStaleTime: (time) => set({ customStaleTime: time }),
  saveSettings: async (persistChanges) => {
    await persistChanges();
  },
}));
