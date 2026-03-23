import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false }
  }
});
