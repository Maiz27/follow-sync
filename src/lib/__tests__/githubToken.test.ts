import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { getGitHubToken, resolveAuthSecrets } from '@/lib/server/githubToken';

const COOKIE = 'authjs.session-token';

const requestWithSession = async (secret: string) => {
  const jwt = await encode({
    token: { accessToken: 'gho_test' },
    secret,
    salt: COOKIE,
  });
  return new NextRequest('http://app.example/api/gh/graphql', {
    headers: { cookie: `${COOKIE}=${jwt}` },
  });
};

const clearSecrets = () => {
  for (const name of [
    'AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'AUTH_SECRET_1',
    'AUTH_SECRET_2',
    'AUTH_SECRET_3',
  ]) {
    vi.stubEnv(name, undefined);
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveAuthSecrets', () => {
  it('uses AUTH_SECRET alone when set, as next-auth does', () => {
    expect(
      resolveAuthSecrets({ AUTH_SECRET: 'a', AUTH_SECRET_1: 'one' })
    ).toEqual(['a']);
  });

  it('falls back to NEXTAUTH_SECRET', () => {
    expect(resolveAuthSecrets({ NEXTAUTH_SECRET: 'n' })).toEqual(['n']);
  });

  it('orders rotated secrets newest (highest number) first', () => {
    expect(
      resolveAuthSecrets({
        AUTH_SECRET_1: 'one',
        AUTH_SECRET_2: 'two',
        AUTH_SECRET_3: 'three',
      })
    ).toEqual(['three', 'two', 'one']);
  });

  it('is empty when nothing is configured', () => {
    expect(resolveAuthSecrets({})).toEqual([]);
  });
});

describe('getGitHubToken', () => {
  it('reads the access token from a session encrypted with AUTH_SECRET', async () => {
    clearSecrets();
    vi.stubEnv('AUTH_SECRET', 'primary-secret');
    const req = await requestWithSession('primary-secret');
    await expect(getGitHubToken(req)).resolves.toBe('gho_test');
  });

  it('decodes a session issued under an older rotated secret', async () => {
    clearSecrets();
    vi.stubEnv('AUTH_SECRET_1', 'old-secret');
    vi.stubEnv('AUTH_SECRET_2', 'new-secret');
    const req = await requestWithSession('old-secret');
    await expect(getGitHubToken(req)).resolves.toBe('gho_test');
  });

  it('returns null (401 upstream) instead of throwing when no secret is configured', async () => {
    clearSecrets();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = await requestWithSession('whatever');
    await expect(getGitHubToken(req)).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('No AUTH_SECRET')
    );
  });
});
