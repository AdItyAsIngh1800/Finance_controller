import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * Test scope is deliberately narrow (see docs/TECH_STACK.md §9): the pure
 * reconciliation core is the only load-bearing test target, because its output
 * is what docs/EVALUATION.md reports. There are no component or E2E tests.
 */
export default defineConfig({
  test: {
    include: ['src/core/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
