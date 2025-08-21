import { create } from 'zustand';

type PaginationStore = {
  pagination: { [key: string]: { currentPage: number } };
  setCurrentPage: (key: string, page: number) => void;
};

export const usePaginationStore = create<PaginationStore>((set) => ({
  pagination: {},
  setCurrentPage: (key, page) =>
    set((state) => ({
      pagination: {
        ...state.pagination,
        [key]: { currentPage: page },
      },
    })),
}));
