# ORBIS Foundation

Shared ORBIS AI/backend platform, Foundation application and Accounting domain.
The Termux Observatory is one subsystem, not the whole application.

Current Maya/accounting checkpoint and database application evidence:
[`docs/MIGRATION-CHECKPOINT-20261006.md`](docs/MIGRATION-CHECKPOINT-20261006.md).
Permanent local preview: [`docs/LOCAL-RUNTIME.md`](docs/LOCAL-RUNTIME.md).
Source edits and verification originate in owner Termux; commit/push and deploy
remain explicit owner actions. Do not use a historical installer as an automatic
commit/push or startup path.

## Backend architecture (TASK-017: One Canonical Backend)

There is exactly **one** backend process/entrypoint: `orbis-server/bridge.cjs`.
It owns every API route the frontend needs — chat (`/api/chat`), Brain
(`/api/brain/request`), Termux bridge (`/api/termux/*`), AI provider status
(`/api/ai/*`), the Observatory (`/api/termux-observatory`), system info
(`/api/system`, `/api/system-stats`), Admin-only telemetry (`/api/metrics`,
`/api/diagnostics`) — and serves the built frontend
(`dist/`).

`orbis-server/server.cjs` and `orbis-server/master-gateway.cjs` are
**retired** and no longer exist as active backend entrypoints. Historical
copies are kept under `docs/archive/retired-backend/` as backup-only text
files. Do not restore either one as a startup path.

### Local / Termux development

Two processes run side by side: Vite (the frontend dev server) and the
canonical backend, on two different ports, with Vite proxying `/api/*` to
the backend.

```bash
# Session 1 — frontend on localhost:3000
bash scripts/orbis-local-dev.sh

# Session 2 — canonical backend on localhost:3001
bash scripts/orbis-local-backend.sh
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
