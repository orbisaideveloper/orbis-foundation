================================================================================
ORBIS FOUNDATION — TASK-017 AUDIT REPORT
================================================================================

AUDIT ID           : ORBIS-AUDIT-017
DATE                : 2026-08-17
IMPLEMENTER         : Claude (Anthropic) — Admin Supervised
TASK                : TASK-017 — One Canonical Backend Consolidation
STATUS              : IMPLEMENTATION COMPLETE — VALIDATION PARTIAL
                       (sandbox has no node_modules / no network — see
                       section 9). NOT COMMITTED, NOT PUSHED per explicit
                       instruction.
DEPENDENCY          : Approved "Backend Entrypoint Fragmentation Decision
                       Report" (investigation-only, no code changed)

================================================================================
1. OBJECTIVE
================================================================================

Eliminate the four-entrypoint confusion (bridge.cjs, server.cjs,
master-gateway.cjs, `serve -s dist`) by making orbis-server/bridge.cjs the
ONE canonical backend process — owning every route (chat/Brain, Termux
bridge, system telemetry, static frontend serving) on one port, in both
local/Termux development and Render production — without touching any
Brain/execution component, without adding a new server/gateway/Decision
component, and without breaking any existing route.

================================================================================
2. PRE-IMPLEMENTATION TRACE (per TASK-017's instruction to trace routes/
   imports/dependencies/ports before changing anything)
================================================================================

- orbis-server/bridge.cjs (810 lines): owned /api/brain/request, /health,
  /api/termux/handshake, /api/termux/capability, /api/system (mounted
  source-api.cjs), /api/system-stats, /api/ai/providers/status, /api/chat,
  /api/termux-observatory, /api/orbis-command, static frontend serving.
  Port: process.env.PORT || 3000. No Postgres/Prisma dependency.
- orbis-server/server.cjs (101 lines): owned /api/internal/log,
  /api/metrics, /api/diagnostics, plus a duplicate /api/system mount.
  Port: process.env.PORT || 3001. Depends on telemetry-module.cjs, pg,
  @prisma/adapter-pg, @prisma/client, dotenv.
- orbis-server/master-gateway.cjs (114 lines): spawned both of the above
  as child processes (forcing bridge.cjs to PORT=3002, server.cjs to
  PORT=3001) and reverse-proxied between them on process.env.PORT || 10000.
  No route logic of its own.
- package.json "start": "serve -s dist" — a static-file server with zero
  knowledge of /api/*; not invoked by render.yaml (which uses its own
  startCommand) or by any other script.
- render.yaml (unchanged, confirmed): startCommand "node
  orbis-server/bridge.cjs", healthCheckPath "/api/system-stats" — already
  proved bridge.cjs-alone is the only process that matters in production
  today.
- vite.config.ts: server.port 3000, strictPort true, no server.proxy key —
  npm run dev started no backend and proxied nothing.
- Frontend consumers of the telemetry routes: src/components/
  SystemDiagnosticConsole.tsx and src/admin/dashboard/AdminDashboard.tsx
  both fetch("/api/diagnostics"); both would 404 against a bridge.cjs-only
  deployment before this task (confirmed root cause the Decision Report
  identified).
- orbis-server/bridge.cjs.backup: grepped repo-wide, zero references
  anywhere — confirmed dead.
- knip.json's "entry" list and src/admin/registry/system-map.json's
  "connected_files" both still reference orbis-server/server.cjs by path
  — this is why server.cjs was DEPRECATED IN PLACE rather than deleted
  (see section 4).
- No circular import risk: telemetry-module.cjs only requires node:os and
  node:child_process; it does not import bridge.cjs, server.cjs, or
  anything that imports either.
- Husky/lint-staged trace (relevant because a prior task's commit was
  rejected by this exact gate): lint-staged only runs `eslint --fix` on
  `src/**/*.{ts,tsx,js,jsx}` and only `prettier --write` on
  `orbis-server/**/*.cjs` — i.e. ESLint (and its sonarjs/no-duplicate-
  string rule) never touches .cjs files. orbis-logic-guard.cjs (also run
  on every commit, via `node orbis-logic-guard.cjs`) runs `tsc --noEmit`,
  `eslint "./src/**/*.{ts,tsx}"`, and `madge --circular ... ./src
  ./orbis-server` — the last one DOES cover .cjs files, so the circular-
  dependency check was traced carefully (see above; no cycle found).

================================================================================
3. IMPLEMENTATION
================================================================================

--------------------------------------------------------------------------
3.1 orbis-server/bridge.cjs — became the canonical backend
--------------------------------------------------------------------------
Added, unchanged in logic from server.cjs, only relocated:
  - require("dotenv").config() at the top (server.cjs already did this;
    bridge.cjs did not — needed so DATABASE_URL etc. load from a local
    .env file in dev, matching server.cjs's prior behavior).
  - pg Pool + @prisma/adapter-pg PrismaPg + @prisma/client PrismaClient
    setup, with the exact same fire-and-forget $connect().then/.catch
    pattern server.cjs used (a DB connection failure is logged and does
    NOT crash the process or touch any other route).
  - telemetry-module.cjs's getDiagnostics/addSystemLog/setDbClient,
    required and wired exactly as server.cjs wired them.
  - Three routes, logic copied verbatim from server.cjs:
      POST /api/internal/log
      GET  /api/metrics
      GET  /api/diagnostics
    Each retains its own try/catch exactly as before (metrics returns 500
    on DB failure; diagnostics falls back to in-memory getDiagnostics()
    on DB failure — neither can throw past its own handler).

Everything else in bridge.cjs — /api/brain/request, /health, /api/termux/*,
/api/system, /api/system-stats, /api/ai/providers/status, /api/chat,
/api/termux-observatory, /api/orbis-command, static serving — is BYTE-FOR-
BYTE unchanged. Confirmed by diff: the only edits are (a) the new requires/
DB setup block near the top, and (b) the three new route handlers inserted
immediately after the existing `/api/system` mount, before
`/api/system-stats`. No existing route was moved, reordered relative to
each other, or edited.

One small, deliberate content fix: telemetry-module.cjs's getDiagnostics()
had a hardcoded two-port description ("Active (Port 3000)" / "Online (Port
3001)") that is now factually wrong under one canonical process. Updated
to report the actual running port dynamically and to say the second
process was "Merged into canonical backend (TASK-017)" — this is a display-
string correction, not a logic change, and leaving the old text would have
reintroduced exactly the kind of stale/confusing information this task
exists to remove.

Deliberately NOT ported: server.cjs's blanket request-logging middleware
(`[NETWORK] ... Request incoming for route: ...` on every request except
/api/diagnostics and /api/internal/log). Porting it would add a new
console.log side-effect to every one of bridge.cjs's existing routes
(chat, Brain, Termux, etc.) — out of scope for "bring in the telemetry
ROUTES" and an unnecessary behavior change to unrelated routes. Noted here
as a deliberate minimal-footprint choice, easy to add later if wanted.

--------------------------------------------------------------------------
3.2 orbis-server/server.cjs — retired as a standalone entrypoint
--------------------------------------------------------------------------
NOT deleted (see section 2: knip.json "entry" and system-map.json
"connected_files" both still reference this path by name; deleting it was
judged out of scope for a "minimal change set" consolidation task and
risked an unrelated collateral break in tooling I could not fully
re-verify in this sandbox). Instead: marked DEPRECATED with a clear
docblock at the top explaining it is no longer started by anything and
pointing to bridge.cjs as canonical. Its actual code (routes, DB setup) is
completely untouched below that comment — this file could still be run
standalone if someone truly needed to (e.g. local debugging), but nothing
in this repository does so anymore.

--------------------------------------------------------------------------
3.3 orbis-server/master-gateway.cjs — retired
--------------------------------------------------------------------------
Same treatment: DEPRECATED docblock added at the top; code below it
untouched. Nothing invokes this file anymore (confirmed: it was previously
only ever invoked by a developer running it directly or via a start
script — grep confirms no package.json script referenced it before this
task either).

--------------------------------------------------------------------------
3.4 package.json
--------------------------------------------------------------------------
"start": "serve -s dist"  →  "start": "node orbis-server/bridge.cjs"
No other field changed. The "serve" npm dependency itself was left in
`dependencies` (removing unused dependencies was not requested and is out
of scope for this task; flagged as a possible future cleanup only).

--------------------------------------------------------------------------
3.5 orbis-server/bridge.cjs.backup — deleted
--------------------------------------------------------------------------
Confirmed zero references anywhere in the repository before deleting.

--------------------------------------------------------------------------
3.6 vite.config.ts — dev-only proxy added
--------------------------------------------------------------------------
Added a `server.proxy["/api"]` entry forwarding to
`http://127.0.0.1:${process.env.BACKEND_PORT || 3001}` with
`changeOrigin: true`. This only affects `npm run dev` (Vite's own dev
server) — it has no effect on the production build or on Render, where
/api/* is already same-origin because bridge.cjs serves both the API and
the built frontend from one process/port. `server.port`/`strictPort`
unchanged.

--------------------------------------------------------------------------
3.7 Documentation
--------------------------------------------------------------------------
Appended a new "Backend architecture (TASK-017)" section to README.md
(existing content untouched) documenting: the one canonical backend, why
server.cjs/master-gateway.cjs are retired-in-place rather than deleted,
exact local/Termux dev startup commands (two terminals: backend on
PORT=3001, then `npm run dev`), and confirmation that Render's
render.yaml needs no change.

================================================================================
4. FILES CHANGED / REMOVED
================================================================================

CHANGED:
  - orbis-server/bridge.cjs        (telemetry routes + DB setup added;
                                     all prior routes untouched)
  - orbis-server/server.cjs        (DEPRECATED docblock only; logic
                                     untouched)
  - orbis-server/master-gateway.cjs (DEPRECATED docblock only; logic
                                     untouched)
  - orbis-server/telemetry-module.cjs (bridge/serverStatus display strings
                                     corrected to reflect one process)
  - package.json                   ("start" script only)
  - vite.config.ts                 (dev-only server.proxy added)
  - README.md                      (new section appended)

ADDED:
  - orbis-server/__tests__/bridge.telemetry.test.mjs
  - docs/AUDIT_REPORTS/017_FINAL_AUDIT_REPORT.md (this file)

REMOVED:
  - orbis-server/bridge.cjs.backup (confirmed dead, zero references)

UNTOUCHED (verified by diff against the pre-task repository):
  - src/core/brain/**  and  src/core/execution/**  (entirely untouched)
  - orbis-server/ai/AIChatService.cjs, AIProviderManager.cjs,
    ai/brain/ChatCapabilityIntentMatcher.cjs, ai/brain/MemoryEngine.cjs
  - orbis-server/brain-runtime/** (compiled Brain artifact)
  - render.yaml
  - Every existing bridge.cjs route's own logic (only new routes were
    inserted; none of the pre-existing ~15 route handlers were edited)
  - All existing test files (bridge.test.mjs, termux-observatory.test.mjs,
    AIChatService.brain.test.mjs, ChatCapabilityIntentMatcher.test.mjs,
    DecisionEngine.test.ts, TaskProcessor.test.ts,
    BrainRequestGateway.test.ts, BrainRequestGateway.decisionIntegration.
    test.ts)

================================================================================
5. ARCHITECTURE BEFORE → AFTER
================================================================================

BEFORE:
  4 possible entrypoints (bridge.cjs @3000, server.cjs @3001,
  master-gateway.cjs @10000 proxying both, `serve -s dist` knowing no
  API at all). Only bridge.cjs was actually live in Render production
  (proven by render.yaml); /api/diagnostics and /api/metrics 404'd there.

AFTER:
  1 entrypoint: orbis-server/bridge.cjs. Owns every route, including the
  three telemetry routes it previously lacked. server.cjs and
  master-gateway.cjs remain on disk (deprecated, unreferenced by any
  script) purely because two unrelated registry/tooling files still name
  server.cjs by path. package.json "start" now actually boots a working
  backend. render.yaml needed zero changes because it was already
  pointing at the canonical file.

================================================================================
6. TESTS / VALIDATION RESULTS
================================================================================

Per TASK-017's explicit instruction: "যে validation বাস্তবে চালাতে পারবে
না, সেটাকে PASS বলে লিখবে না" — every line below is honestly labeled.

  tests (npm test / vitest)          : NOT RUN — no node_modules, no
                                        network, in this sandbox.
  type-check (npm run type-check)    : NOT RUN — same reason. (Reasoned
                                        manually: no .ts file's exported
                                        types changed; vite.config.ts is
                                        only checked via tsconfig.node.json,
                                        which "tsc --noEmit" on the root
                                        config does not invoke without
                                        `-b`/`--build`, so this change is
                                        very unlikely to affect this gate
                                        — but "very unlikely" is not "PASS"
                                        and is reported as NOT RUN.)
  build (npm run build)              : NOT RUN — requires the installed
                                        Vite/React toolchain.
  lint (npm run lint)                : NOT RUN. Traced instead: this
                                        script only lints `src/**/*.ts(x)`
                                        — no file changed by this task
                                        matches that glob, so this gate is
                                        not exercised by these changes at
                                        all.
  check:circular (madge)             : NOT RUN — madge not installed.
                                        Manually traced (section 2): no
                                        new cycle; telemetry-module.cjs
                                        only imports node:os/
                                        node:child_process.
  route/startup validation           : PARTIAL — `node -c` (syntax check)
                                        run successfully on bridge.cjs,
                                        server.cjs, master-gateway.cjs,
                                        telemetry-module.cjs. Full
                                        `node orbis-server/bridge.cjs`
                                        startup NOT RUN (would need real
                                        `express`/`pg`/`@prisma/client`
                                        packages installed, which this
                                        sandbox does not have).
  canonical backend startup          : NOT RUN — see above.
  /api/chat                          : NOT RUN live; new regression test
                                        written (bridge.telemetry.test.mjs)
                                        asserting it still returns 200
                                        with a DB present/absent either
                                        way. Not executed in this sandbox.
  /api/brain/request                 : NOT RUN — unchanged code path,
                                        already covered by existing
                                        bridge.test.mjs, which this task
                                        did not modify.
  /api/system, /api/system-stats     : NOT RUN live; existing tests +
                                        new regression tests cover both;
                                        not executed here.
  /api/metrics, /api/diagnostics,
  /api/internal/log                  : NOT RUN live. New tests written
                                        deliberately WITHOUT mocking
                                        Prisma (this codebase has no
                                        existing precedent of vi.mock
                                        with CJS require, and I could not
                                        execute vitest here to verify one
                                        would work) — instead they assert
                                        the invariant that holds regardless
                                        of real DB availability: /api/
                                        metrics responds 200-or-500 and
                                        never anything else; /api/
                                        diagnostics always responds 200
                                        with a valid shape even if the DB
                                        call fails; /api/internal/log
                                        always returns 200. Not executed
                                        in this sandbox.
  Termux-related endpoints           : NOT RUN live; unchanged code,
                                        existing + new regression tests
                                        cover /health and /api/termux/
                                        handshake.
  frontend dev proxy                 : NOT RUN (would require running
                                        Vite). Config reviewed by hand;
                                        syntax-checked with tsc's
                                        transpile-only mode (no
                                        diagnostics).
  static frontend serving            : NOT RUN; unchanged code
                                        (express.static + SPA fallback
                                        untouched).

WHAT WAS ACTUALLY VERIFIED IN THIS SANDBOX:
  - `node -c` syntax validation on every changed .cjs file: PASS.
  - `python3 -c "json.load(...)"` validation on package.json: PASS.
  - TypeScript transpile (syntax-only, no type resolution) on
    vite.config.ts: PASS, zero diagnostics.
  - Manual full-file diff against the pre-task repository, confirming the
    exact and only files touched (section 4) and that every pre-existing
    bridge.cjs route handler is byte-for-byte unchanged.
  - Manual dependency-graph trace confirming no new circular import.
  - Manual trace of lint-staged/husky/orbis-logic-guard.cjs configuration
    (section 2) to identify which gates could realistically be affected by
    .cjs-only changes, learning from the TASK-015 Part 2 pre-commit
    rejection earlier in this project.

================================================================================
7. REGRESSION CHECK
================================================================================

Traced by hand (not machine-run, per section 6):

  - /api/brain/request: code path completely untouched; still requires
    the same brain-runtime artifact, same success/error shape.
  - /api/chat: code path completely untouched. The only new adjacency is
    that telemetry-module.cjs's console.log/console.error monkey-patch
    now applies process-wide inside bridge.cjs (it did not before, since
    telemetry-module.cjs was previously only loaded by the separate
    server.cjs process). This means bridge.cjs's own console.log/error
    calls (e.g. "[CHAT_API] Request failed") now ALSO get pushed into
    the in-memory/DB system log, in addition to printing as before. This
    is an intentional, expected consequence of consolidation (it is
    telemetry-module.cjs's documented purpose — "Deep Telemetry
    Activated. Tracking core events") and every console.log/error call
    still prints exactly as before; addSystemLog's own DB write is
    already wrapped in try/catch, so it cannot throw back into the
    caller. Flagged here explicitly as a behavior addition, not a
    regression, and as something worth confirming visually once run for
    real.
  - /api/termux/*, /health: untouched code paths.
  - /api/system, /api/system-stats: untouched code paths; the duplicate
    /api/system mount that used to also exist in server.cjs is gone
    simply because server.cjs is no longer started — bridge.cjs's own
    mount (unchanged) is the only one that was ever live in production.
  - /api/termux-observatory, /api/orbis-command, static serving:
    untouched code paths.
  - /api/metrics, /api/diagnostics, /api/internal/log: logic copied
    verbatim; the only change is which process/port they run in.
    AdminDashboard.tsx and SystemDiagnosticConsole.tsx's existing
    fetch("/api/diagnostics") calls will now resolve against the same
    origin they already fetch everything else from — this FIXES the
    404 regression the Decision Report identified, it does not
    introduce a new one.
  - DB failure isolation: server.cjs's original pattern (catch the
    $connect() rejection, catch each route's own Prisma call, never let
    a DB failure propagate) is preserved exactly; nothing in the merge
    removed or narrowed a try/catch.

NO regression identified in this trace. This has not been confirmed by
actually running the app — that must happen in the real environment
before this is considered fully validated (see section 9).

================================================================================
8. EXACT STARTUP COMMANDS
================================================================================

Termux / local development (two terminals):
  Terminal 1 (backend):
    PORT=3001 node orbis-server/bridge.cjs
  Terminal 2 (frontend, proxies /api/* to the backend above):
    npm run dev

  (If you start the backend on a port other than 3001, also set
  BACKEND_PORT for Vite: `BACKEND_PORT=4000 npm run dev` alongside
  `PORT=4000 node orbis-server/bridge.cjs`.)

Render production (unchanged, already canonical):
  buildCommand : npm ci && npm run build
  startCommand : node orbis-server/bridge.cjs
  healthCheckPath : /api/system-stats

Plain "build then start" (e.g. any non-Render host):
  npm run build && npm start
  (npm start now runs `node orbis-server/bridge.cjs`, matching Render.)

================================================================================
9. KNOWN LIMITATIONS
================================================================================

- None of `npm test`, `npm run type-check`, `npm run build`,
  `npm run lint`, `npm run check:circular`, or an actual server startup
  could be executed in this sandbox (no node_modules, no network). All
  results in section 6 are either a manual syntax check, a manual full-
  diff/dependency trace, or explicitly marked NOT RUN. This must be
  re-run for real (in Termux, with node_modules installed) before this
  task is considered fully validated, per TASK-017's own instruction not
  to fabricate results.
- The new bridge.telemetry.test.mjs tests were written to be correct
  regardless of whether a real DATABASE_URL/Postgres is reachable in the
  test environment, precisely because I could not determine which case
  would hold and could not execute the suite to check. They have NOT
  been run.
- orbis-server/server.cjs and master-gateway.cjs were deprecated-in-place
  rather than deleted, specifically because knip.json and
  src/admin/registry/system-map.json still reference server.cjs by path.
  Deleting server.cjs/master-gateway.cjs outright remains an option for a
  future, separate cleanup task if wanted — it was judged out of scope
  here to avoid an unreviewed change to those two registry/tooling files.
- telemetry-module.cjs's console.log/console.error monkey-patch now
  applies to the entire canonical process (see section 7) — this is an
  intentional consequence of consolidation, not a bug, but is worth a
  visual sanity check once run for real.
- The "serve" npm package remains in package.json's dependencies,
  unused now that "start" no longer invokes it. Left in place as out of
  scope (not requested); safe to remove in a future cleanup.

================================================================================
10. FINAL STATUS
================================================================================

IMPLEMENTATION COMPLETE per the approved Decision Report and TASK-017's
instructions. VALIDATION PARTIAL — manual syntax/diff/dependency checks
only, full npm toolchain validation NOT RUN due to sandbox constraints
(section 9). NOT committed. NOT pushed, per explicit instruction —
awaiting real-environment validation and your approval.
