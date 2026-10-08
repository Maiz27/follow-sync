import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next compiles JSX with the automatic runtime; match it so components that
  // don't import React (most app/ files) render in tests too.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
