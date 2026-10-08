// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  STAR_PROMPT_ACTION_THRESHOLD,
  STAR_PROMPT_STORAGE_KEY,
  useModalsStore,
} from '@/lib/store/modals';

const act = (times: number) => {
  for (let i = 0; i < times; i++) {
    useModalsStore.getState().incrementActionCount();
  }
};

describe('star prompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useModalsStore.setState({ modal: null, actionCount: 0 });
  });

  it('shows after the threshold and records that it was shown', () => {
    act(STAR_PROMPT_ACTION_THRESHOLD);
    expect(useModalsStore.getState().modal?.type).toBe('star');
    expect(window.localStorage.getItem(STAR_PROMPT_STORAGE_KEY)).not.toBeNull();
  });

  it('does not show again once it has been shown', () => {
    act(STAR_PROMPT_ACTION_THRESHOLD);
    useModalsStore.getState().closeModal();

    act(STAR_PROMPT_ACTION_THRESHOLD * 3);
    expect(useModalsStore.getState().modal).toBeNull();
  });
});
