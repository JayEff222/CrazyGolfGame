import { defineConfig } from 'vitest/config'

/*
 * Rules tests run in node against the Firestore emulator, not in jsdom, and they
 * must not share the browser setup file. Hence a config of their own.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
