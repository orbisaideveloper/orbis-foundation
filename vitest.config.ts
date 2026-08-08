import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'orbis-server/**/*.test.cjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}', 'orbis-server/**/*.cjs'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.test.*'
      ]
    }
  }
});
