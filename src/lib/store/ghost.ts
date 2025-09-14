import { create } from 'zustand';
import { UserInfoFragment } from '@/lib/gql/types';

export type GhostState = {
  ghosts: UserInfoFragment[];
  ghostsSet: Set<string>;
  isCheckingGhosts: boolean;
};

export type GhostActions = {
  setGhosts: (ghosts: UserInfoFragment[]) => void;
  addGhosts: (ghosts: UserInfoFragment[]) => void;
  isGhost: (login: string) => boolean;
  setIsCheckingGhosts: (isCheckingGhosts: boolean) => void;
};

export type GhostStore = GhostState & GhostActions;

const initialState: GhostState = {
  ghosts: [],
  ghostsSet: new Set(),
  isCheckingGhosts: true,
};

export const useGhostStore = create<GhostStore>((set, get) => ({
  ...initialState,
  setGhosts: (ghosts) => {
    set({
      ghosts,
      ghostsSet: new Set(ghosts.map((g) => g.login)),
    });
  },
  addGhosts: (ghosts) => {
    const allGhosts = [...get().ghosts, ...ghosts];
    const uniqueGhostsMap = new Map();
    allGhosts.forEach((g) => uniqueGhostsMap.set(g.login, g));
    const uniqueGhosts = Array.from(uniqueGhostsMap.values());

    set({
      ghosts: uniqueGhosts,
      ghostsSet: new Set(uniqueGhosts.map((g) => g.login)),
    });
  },
  isGhost: (login) => {
    return get().ghostsSet.has(login);
  },
  setIsCheckingGhosts: (isCheckingGhosts) => {
    set({ isCheckingGhosts });
  },
}));
