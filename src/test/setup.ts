import { afterEach } from 'vitest';

// Testing Library only auto-unmounts between tests when vitest globals are
// enabled; do it explicitly so hooks rendered in one test can't leak state
// (e.g. pagination clamping) into the next. Node-environment tests skip it.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
