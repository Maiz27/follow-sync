/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';

type Modal = {
  type: 'star' | 'settings';
  props?: any;
} | null;

interface ModalsState {
  modal: Modal;
  actionCount: number;
  openModal: (type: 'star' | 'settings', props?: any) => void;
  closeModal: () => void;
  incrementActionCount: () => void;
}

export const useModalsStore = create<ModalsState>((set) => ({
  modal: null,
  actionCount: 0,
  openModal: (type, props) => set({ modal: { type, props } }),
  closeModal: () => set({ modal: null }),
  incrementActionCount: () =>
    set((state) => {
      const newCount = state.actionCount + 1;
      if (newCount >= 5) {
        return { actionCount: 0, modal: { type: 'star' } };
      }
      return { actionCount: newCount };
    }),
}));
