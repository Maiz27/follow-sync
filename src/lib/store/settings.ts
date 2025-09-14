import { create } from 'zustand';
import { PAGE_SIZE_LIST } from '../constants';

export type SettingsState = {
  isSettingsModalOpen: boolean;
  showAvatars: boolean;
  ghostDetectionBatchSize: number;
  paginationPageSize: number;
  customStaleTime: number | null;
};

export type SettingsActions = {
  toggleSettingsModal: () => void;
  setShowAvatars: (show: boolean) => void;
  setGhostDetectionBatchSize: (size: number) => void;
  setPaginationPageSize: (size: number) => void;
  setCustomStaleTime: (time: number | null) => void;
  saveSettings: (
    accessToken: string,
    persistChanges: (accessToken: string) => Promise<void>
  ) => Promise<void>;
};

export type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>((set) => ({
  isSettingsModalOpen: false,
  showAvatars: true,
  ghostDetectionBatchSize: 10,
  paginationPageSize: PAGE_SIZE_LIST[0],
  customStaleTime: null,
  toggleSettingsModal: () =>
    set((state) => ({ isSettingsModalOpen: !state.isSettingsModalOpen })),
  setShowAvatars: (show) => set({ showAvatars: show }),
  setGhostDetectionBatchSize: (size) => set({ ghostDetectionBatchSize: size }),
  setPaginationPageSize: (size) => set({ paginationPageSize: size }),
  setCustomStaleTime: (time) => set({ customStaleTime: time }),
  saveSettings: async (accessToken, persistChanges) => {
    await persistChanges(accessToken);
  },
}));
