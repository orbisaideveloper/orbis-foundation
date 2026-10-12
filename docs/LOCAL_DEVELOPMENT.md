# ORBIS local development and Bengali curation

Owner workflow, 2026-10-08 (Asia/Kolkata).

Develop and preview from the owner's Termux checkout, using localhost. The owner
runs all application tests and shares reports; assistant prepares guarded patches
and reviews results. Keep existing servers alive. Check tracked PID, cwd and port
before any server restart; never kill by process-name wildcard. Do not reinstall
shared tooling by default. Do not silently use production credentials or bypass
identity/authorization to make a local chat work.

Run checks with visible foreground stage output. Store working output as
`.running`, publish a timestamped final `.txt` under `~/storage/downloads` after
all invoked work exits. Preserve real failure status; a command receipt or health
response does not prove application tests or AI generation succeeded. A separate
Termux session keeps existing dev servers running and available for phone preview.

Persistent report command (available in this repository):

```bash
bash scripts/orbis-local-report.sh diff git diff --check
bash scripts/orbis-local-report.sh lint npm run lint
```

Run targeted tests for each coherent change; use the repository's complete Linux
certification before push. Do not weaken coverage, lint, duplicate or security
gates. Existing Ubuntu/proot tooling is used for Linux-only checks. Remote
GitHub Actions/Sonar verifies the pushed main commit; deploy only after required
remote gates pass and deployment is authorized. No automatic commit/push/deploy
is part of start/test scripts.

## Foundation-wide Bengali examples

When working on any ORBIS project, select useful anonymized Bengali utterances,
context, intent, assistant-answer pairs and later corrections for the canonical
Foundation bank at `orbis-server/ai/bengali/examples.json`. Read Foundation's
`docs/AI_BENGALI_EXAMPLES.md`. Group equivalent variants; avoid duplicates and
private data. Approved intent guidance can be retrieved at runtime. Assistant
answers without review remain candidate, even when the owner does not object.
Do not automatically ingest all conversations or claim cross-chat memory or
weight training. Updates are delivered as Foundation source patches and tested
there; do not copy separate banks into each product.

This rule is intended across Maya, Foundation, Khata and Admin. Adding it to
other checkouts requires inspecting their current instructions and sources;
those checkouts have not been changed by this Maya/Foundation installer.

## Foundation commands

Frontend-only preview in a separate session:

```bash
cd ~/orbis-foundation
npm run dev -- --host 127.0.0.1 --port 3100 --strictPort
```

Open `http://127.0.0.1:3100/`. This starts the UI only; it does not certify a
working local Foundation chat backend. The existing `npm start` uses
`orbis-server/bridge.cjs`, with backend/auth/database requirements that must be
inspected before wiring a one-command full local chat startup. Maya's local
3001 gateway is a product gateway, not the complete Foundation chat backend.
That complete startup remains pending; never label frontend readiness as AI
readiness or assume remote Render env is present in Termux.

```bash
cd ~/orbis-foundation
bash scripts/orbis-local-report.sh ai-focused node node_modules/vitest/vitest.mjs run orbis-server/__tests__/bengali-examples.test.mjs orbis-server/__tests__/GroqProvider.test.mjs --maxWorkers=1
bash scripts/orbis-local-report.sh typecheck npm run type-check
bash scripts/orbis-local-report.sh native-quality npm run quality:termux
bash scripts/orbis-local-report.sh all-quality npm run quality:all
```

Existing quality runners remain authoritative for native/Ubuntu routing and
resume behavior. Do not run Prisma engines natively in Android. Keep optional
mutation/replay work separate from a quick changed-area check.
