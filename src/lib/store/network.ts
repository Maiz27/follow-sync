import { create } from 'zustand';
import { UserInfoFragment } from '@/lib/gql/types';
import { getNonMutuals } from '@/lib/utils';

export type NetworkState = {
  network: {
    followers: UserInfoFragment[];
    following: UserInfoFragment[];
  };
  nonMutuals: {
    nonMutualsFollowingYou: UserInfoFragment[];
    nonMutualsYouFollow: UserInfoFragment[];
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
