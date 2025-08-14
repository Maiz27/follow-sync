import { create } from 'zustand';

interface ModalState {
  isStarModalOpen: boolean;
  actionCount: number;
  openStarModal: () => void;
  closeStarModal: () => void;
  incrementActionCount: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isStarModalOpen: false,
  actionCount: 0,
  openStarModal: () => set({ isStarModalOpen: true }),
  closeStarModal: () => set({ isStarModalOpen: false }),
  incrementActionCount: () =>
    set((state) => {
      const newCount = state.actionCount + 1;
      if (newCount >= 5) {
        return { actionCount: 0, isStarModalOpen: true };
      }
      return { actionCount: newCount };
    }),
}));
