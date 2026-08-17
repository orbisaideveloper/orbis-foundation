/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // TASK-017: One Canonical Backend — dev-only proxy.
    //
    // In production there is exactly one process/one port (see
    // orbis-server/bridge.cjs + render.yaml), so /api/* calls are already
    // same-origin and need no proxy there. In local/Termux development,
    // Vite (this server, port 3000) and the canonical backend
    // (orbis-server/bridge.cjs) are two separate processes, so /api/* must
    // be forwarded to wherever the backend is actually running.
    //
    // Start the backend on a different port than Vite's (3000 is taken by
    // Vite itself), e.g.:
    //   PORT=3001 node orbis-server/bridge.cjs
    // and this proxy will forward to it. Override the target port with
    // BACKEND_PORT if you start the backend on something else.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true, // শুধু এই লাইনটি নতুন যোগ করা হয়েছে
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
