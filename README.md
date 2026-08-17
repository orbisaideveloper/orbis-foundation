# ORBIS Termux / Android / Offline Intelligence Observatory

FIXED installer package.

Run in Termux:
cd ~/orbis-foundation
unzip -o ORBIS-Termux-Observatory-Installer-FIXED.zip
bash install.sh

The installer creates a safety backup, installs the observatory, adds the repository-backed API, documents the workflow, runs type-check/tests/build, commits, and pushes main.

## Backend architecture (TASK-017: One Canonical Backend)

There is exactly **one** backend process/entrypoint: `orbis-server/bridge.cjs`.
It owns every API route the frontend needs — chat (`/api/chat`), Brain
(`/api/brain/request`), Termux bridge (`/api/termux/*`), AI provider status
(`/api/ai/*`), the Observatory (`/api/termux-observatory`), system info
(`/api/system`, `/api/system-stats`), telemetry (`/api/metrics`,
`/api/diagnostics`, `/api/internal/log`) — and serves the built frontend
(`dist/`).

`orbis-server/server.cjs` and `orbis-server/master-gateway.cjs` are
**retired**: nothing starts them anymore. They remain on disk only for
historical reference (their logic was copied into `bridge.cjs`, not deleted)
and are clearly marked `DEPRECATED` at the top of each file. Do not add a
script that launches them again.

### Local / Termux development

Two processes run side by side: Vite (the frontend dev server) and the
canonical backend, on two different ports, with Vite proxying `/api/*` to
the backend.

```bash
# Terminal 1 — canonical backend, on a port other than Vite's 3000
PORT=3001 node orbis-server/bridge.cjs

# Terminal 2 — frontend dev server (proxies /api/* to the backend above)
npm run dev
```

If you start the backend on a different port than `3001`, set
`BACKEND_PORT` for Vite to match, e.g. `BACKEND_PORT=4000 npm run dev` with
`PORT=4000 node orbis-server/bridge.cjs`.

### Render production

No change: `render.yaml`'s `startCommand` (`node orbis-server/bridge.cjs`)
and `healthCheckPath` (`/api/system-stats`) already pointed at the canonical
backend before this task — that's what proved it was the one process that
mattered in production. `npm run build` now also produces a working
`npm start` (`node orbis-server/bridge.cjs`) for any environment that needs
a plain "build then start" flow instead of Render's own startCommand.
