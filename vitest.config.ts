import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/admin/__tests__/backend/**/*.cjs', 'orbis-server/**/*.test.{cjs,mjs}'],
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
