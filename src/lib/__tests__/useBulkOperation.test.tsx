// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/context/progress', () => ({
  useProgress: () => ({
    show: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import type { NetworkUser } from '@/lib/types';

const user = (login: string) => ({ login }) as NetworkUser;

describe('useBulkOperation', () => {
  it('hands only the rows that succeeded to onBulkSuccess', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onBulkSuccess = vi.fn();
    const run = vi.fn(async (u: NetworkUser) => {
      if (u.login === 'bad') throw new Error('nope');
    });
    const { result } = renderHook(() =>
      useBulkOperation(run, 'Unfollowing', onBulkSuccess)
    );

    await act(async () => {
      await result.current.execute([user('good'), user('bad')]);
    });

    expect(onBulkSuccess).toHaveBeenCalledWith([user('good')]);
  });
});
