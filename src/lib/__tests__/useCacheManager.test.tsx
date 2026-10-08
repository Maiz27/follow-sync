// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { GraphQLClient } from 'graphql-request';

const mocks = vi.hoisted(() => ({
  session: { login: 'octocat' },
  findCanonicalCacheGist: vi.fn(),
  writeCache: vi.fn(),
  cleanupDuplicateCacheGists: vi.fn(),
  fetchAndClassifyNetwork: vi.fn(),
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { login: mocks.session.login } },
  }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/networkSync', () => ({
  fetchAndClassifyNetwork: mocks.fetchAndClassifyNetwork,
}));
vi.mock('@/lib/gist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gist')>()),
  findCanonicalCacheGist: mocks.findCanonicalCacheGist,
  writeCache: mocks.writeCache,
  cleanupDuplicateCacheGists: mocks.cleanupDuplicateCacheGists,
}));

import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { buildCacheDescription, serializeCache } from '@/lib/gist';
import { encodeCache } from '@/lib/cacheCodec';
import { GIST_CACHE_VERSION, GIST_FILENAME } from '@/lib/constants';
import { useGistStore } from '@/lib/store/gist';
import { useNetworkStore } from '@/lib/store/network';
import { useGhostStore } from '@/lib/store/ghost';
import type { CacheGist, CachedData, NetworkUser } from '@/lib/types';

const client = new GraphQLClient('https://example.test/graphql');

const user = (login: string): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: '',
  url: `https://github.com/${login}`,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: 'user',
});

const cacheData = (
  ownerLogin: string,
  overrides: Partial<CachedData> = {}
): CachedData => ({
  network: { followers: [user('fan')], following: [user('friend')] },
  ghosts: [],
  removedGhosts: [],
  timestamp: Date.now(),
  ...overrides,
  metadata: {
    totalConnections: 2,
    fetchDuration: 1,
    cacheVersion: GIST_CACHE_VERSION,
    ownerLogin,
    cacheKey: `follow-sync:${ownerLogin}:network-cache`,
  },
});

const gistFor = (data: CachedData, ownerLogin: string): CacheGist => ({
  id: 'G1',
  name: 'G1',
  ownerLogin,
  description: buildCacheDescription(data.metadata.ownerLogin ?? ownerLogin),
  updatedAt: '2024-01-01T00:00:00Z',
  files: [{ name: GIST_FILENAME, text: serializeCache(encodeCache(data)) }],
});

const discovery = (gist: CacheGist | null, resolvedOwnerLogin = 'octocat') => ({
  canonicalGist: gist,
  duplicateGists: [],
  scannedAll: false,
  resolvedOwnerLogin,
});

const progress = () => ({
  show: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
});

const fetched = ({
  viewerLogin = 'octocat',
  followers = [user('fan')],
  following = [user('friend')],
}: {
  viewerLogin?: string;
  followers?: NetworkUser[];
  following?: NetworkUser[];
} = {}) => ({
  viewerLogin,
  followers,
  following,
  ghosts: [],
  graphqlFollowingLogins: new Set<string>(),
});

/** The last payload handed to writeCache. */
const lastWrite = (): CachedData =>
  mocks.writeCache.mock.calls.at(-1)?.[0] as CachedData;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.localStorage.clear();
  mocks.session.login = 'octocat';
  useGistStore.setState({
    timestamp: null,
    gistName: null,
    ownerLogin: null,
    viewerLogin: null,
    metadata: null,
    duplicateGistCount: 0,
    forceNextRefresh: false,
    lastDiff: null,
  });
  useNetworkStore.setState({
    network: { followers: [], following: [] },
    nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
    pendingOps: [],
  });
  useGhostStore.setState({
    ghosts: [],
    ghostsSet: new Set(),
    removedGhostLogins: new Set(),
  });
  mocks.writeCache.mockImplementation(async () => ({
    id: 'G1',
    name: 'G1',
    files: [],
  }));
});

describe('useCacheManager: renamed accounts', () => {
  it('labels the synced cache with the login GitHub reports, not a stale session login', async () => {
    mocks.session.login = 'oldname';
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null, 'oldname'));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(
      fetched({ viewerLogin: 'NewName' })
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'oldname',
        progress()
      );
    });

    expect(lastWrite().metadata.ownerLogin).toBe('newname');
    expect(lastWrite().metadata.cacheKey).toBe(
      'follow-sync:newname:network-cache'
    );

    // Later writes (follows, settings...) keep the current login too.
    await act(async () => {
      await result.current.persistChanges();
    });
    expect(lastWrite().metadata.ownerLogin).toBe('newname');
  });

  it('relabels a cache accepted under an older login of the same account', async () => {
    const data = cacheData('oldname');
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(data, 'newname'), 'newname')
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'newname',
        progress()
      );
    });

    expect(mocks.fetchAndClassifyNetwork).not.toHaveBeenCalled();
    expect(mocks.writeCache).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ownerLogin: 'newname' }),
      }),
      'G1'
    );
  });
});
