import { create } from 'zustand';
import { NetworkUser } from '@/lib/types';
import { getNonMutuals } from '@/lib/utils';

export type NetworkState = {
  network: {
    followers: NetworkUser[];
    following: NetworkUser[];
  };
  nonMutuals: {
    nonMutualsFollowingYou: NetworkUser[];
    nonMutualsYouFollow: NetworkUser[];
  };
};

export type NetworkActions = {
  setNetwork: (network: NetworkState['network']) => void;
  updateNetwork: (network: NetworkState['network']) => void;
};

export type NetworkStore = NetworkState & NetworkActions;

const initialState: NetworkState = {
  network: { followers: [], following: [] },
  nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
};

export const useNetworkStore = create<NetworkStore>((set) => ({
  ...initialState,
  setNetwork: (network) => {
    set({
      network,
      nonMutuals: getNonMutuals(network),
    });
  },
  updateNetwork: (network) => {
    set(() => ({
      network,
      nonMutuals: getNonMutuals(network),
    }));
  },
}));
