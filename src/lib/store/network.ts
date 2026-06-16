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

/** Restores the pre-mutation state. Call on mutation failure. */
export type Rollback = () => void;

export type NetworkActions = {
  setNetwork: (network: NetworkState['network']) => void;
  /**
   * Optimistically add a followed user, recomputing non-mutuals. Returns a
   * rollback that restores the exact prior state if the API call fails.
   */
  optimisticFollow: (user: NetworkUser) => Rollback;
  /**
   * Optimistically remove a followed user by id, recomputing non-mutuals.
   * Returns a rollback that restores the exact prior state on failure.
   */
  optimisticUnfollow: (userId: string) => Rollback;
};

export type NetworkStore = NetworkState & NetworkActions;

const initialState: NetworkState = {
  network: { followers: [], following: [] },
  nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
};

const setNetworkState = (network: NetworkState['network']) => ({
  network,
  nonMutuals: getNonMutuals(network),
});

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  ...initialState,
  setNetwork: (network) => {
    set(setNetworkState(network));
  },
  optimisticFollow: (user) => {
    const previous = get().network;
    set(setNetworkState({ ...previous, following: [...previous.following, user] }));
    return () => set(setNetworkState(previous));
  },
  optimisticUnfollow: (userId) => {
    const previous = get().network;
    set(
      setNetworkState({
        ...previous,
        following: previous.following.filter((u) => u.id !== userId),
      })
    );
    return () => set(setNetworkState(previous));
  },
}));
