import { describe, expect, it } from 'vitest';

import { sortRevisionsNewestFirst } from '@/lib/revisionOrder';

const at = (second: number) =>
  new Date(Date.UTC(2024, 0, 1) + second * 1000).toISOString();

const versions = (entries: Array<{ version?: string | null }>) =>
  entries.map((entry) => entry.version);

describe('sortRevisionsNewestFirst', () => {
  it('keeps a newest-first list as it is', () => {
    const list = [
      { version: 'c', committed_at: at(3) },
      { version: 'b', committed_at: at(2) },
      { version: 'a', committed_at: at(1) },
    ];
    expect(versions(sortRevisionsNewestFirst(list))).toEqual(['c', 'b', 'a']);
  });

  it('puts an oldest-first list newest first, ties included', () => {
    const list = [
      { version: 'a', committed_at: at(1) },
      { version: 'b', committed_at: at(2) },
      { version: 'c', committed_at: at(2) },
      { version: 'd', committed_at: at(3) },
    ];
    expect(versions(sortRevisionsNewestFirst(list))).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('sorts a shuffled list by commit time', () => {
    const list = [
      { version: 'b', committed_at: at(2) },
      { version: 'c', committed_at: at(3) },
      { version: 'a', committed_at: at(1) },
    ];
    expect(versions(sortRevisionsNewestFirst(list))).toEqual(['c', 'b', 'a']);
  });

  it('keeps the given order without commit times, dropping entries without a version', () => {
    const list = [{ version: 'b' }, null, { version: null }, { version: 'a' }];
    expect(versions(sortRevisionsNewestFirst(list))).toEqual(['b', 'a']);
  });
});
