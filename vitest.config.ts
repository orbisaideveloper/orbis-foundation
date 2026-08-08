import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.test.*',
        'orbis-server/ai-healer.cjs'
      ]
    }
  }
});
