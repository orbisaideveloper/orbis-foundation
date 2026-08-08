import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    },
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'jsdom',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.tsx']
        }
      }
    ]
  }
});
