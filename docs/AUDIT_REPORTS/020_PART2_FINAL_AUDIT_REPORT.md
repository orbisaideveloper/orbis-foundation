# TASK-020 (Part 2) — Audit Report

> **Naming note:** this repository already contains an earlier, separate
> body of work also labeled "TASK-020"
> (`orbis-server/__tests__/AIChatService.task020.test.mjs`, dated before
> this session — Bengali/English weather-query clarification, Tavily
> language steering, an Ollama anti-fabrication system message). That
> work is unrelated to this brief (BrainRequestGateway /
> DecisionEngine+TaskProcessor / TermuxRuntimeService) and was never
> touched by these changes. This report is filed as **Part 2** under the
> same task number, following this repo's own precedent for a split task
> (`015_PART1_FINAL_AUDIT_REPORT.md` / `015_PART2_FINAL_AUDIT_REPORT.md`).
> If the two pieces of work were meant to be two different task numbers,
> only this file's numbering needs correcting — nothing else changes.

Status: **Implementation complete, NOT committed, NOT pushed.**
Scope: Part 1 (BrainRequestGateway), Part 2 (DecisionEngine + TaskProcessor),
Part 3 (TermuxRuntimeService). Admin routes, Prisma/DB schema, and public
API shapes were not touched (see "Out of scope — confirmed" below).

---

## Part 1 — BrainRequestGateway: Missing Context Detection

### Root cause
Missing-context handling previously existed **only** in the chat layer
(`ChatCapabilityIntentMatcher.matchRequest()`'s `needsInput` flag).
`BrainRequestGateway.submit()` — the single entry point behind
`/api/brain/request` and any other programmatic caller — had no
context-completeness check of its own. A direct call with
`capabilityId: "termux.file.read", input: {}` would pass shape validation,
flow through DecisionEngine → TaskProcessor → BrainCapabilityOrchestrator,
create a real approval token, and only fail once approved, at
`bridge.cjs`'s `PATH_REQUIRED` check — burning a human approval on a
request that could never have succeeded.

### Change
- `src/core/execution/interfaces/IExecutionResult.ts`: added two
  **optional** fields — `clarificationRequired?: boolean`,
  `missingFields?: string[]`. Purely additive; no existing field changed.
- `src/core/brain/BrainRequestGateway.ts`: added a small, deterministic
  `CAPABILITY_REQUIRED_CONTEXT` table (today: `termux.file.read → ["path"]`)
  and a check that runs after shape validation but **before**
  DecisionEngine/TaskProcessor/orchestrator ever see the request. If a
  required field is missing or blank, `submit()` returns a Clarification
  Request (`success: false, clarificationRequired: true,
  missingFields: [...]`) and never proceeds to execution. This is a real
  early-return branch, not a log line.

### Behavior confirmed unchanged
- `termux.system.info` (no declared requirement) is untouched.
- `termux.file.read` with a real `path` proceeds exactly as before.
- Every existing `BrainRequestGateway` test (`BrainRequestGateway.test.ts`,
  `.decisionIntegration.test.ts`) still passes unmodified logic paths.

### Tests added
`src/core/brain/__tests__/BrainRequestGateway.missingContext.test.ts` (5 cases):
missing `path` → clarification; blank `path` → clarification; valid `path`
→ orchestrator called, no clarification; `termux.system.info` unaffected;
an unrelated/unregistered capability (no declared requirement) is not
blocked by this check.

---

## Part 2 — DecisionEngine + TaskProcessor: NON_EXECUTION dead path

### Root cause confirmed
`NON_EXECUTION_CAPABILITY_PREFIX = "brain.reasoning."` was never produced
by any real caller anywhere in the repository (verified by grep across
`src/` and `orbis-server/`) — only its own unit tests exercised it.
Genuinely dead code end-to-end.

### Decision taken
Removed it, per your instruction "Do not invent a new reasoning category."

### Change
- `src/core/brain/DecisionEngine.ts`: removed the `NON_EXECUTION` category
  from `BrainRequestCategory`, removed `NON_EXECUTION_REQUEST` from
  `DecisionCode`, removed the `NON_EXECUTION_CAPABILITY_PREFIX` constant
  and its branch. `decide()` now returns only `CAPABILITY_EXECUTION` or
  `INVALID` — matching what was actually reachable before.
- `src/core/brain/TaskProcessor.ts`: removed the `NON_EXECUTION` branch and
  `DECISION_NON_EXECUTION_UNSUPPORTED` from `TaskRejectionCode`.

### Behavior change (intentional, in scope)
A capabilityId under the former `brain.reasoning.` prefix (never produced
by any real caller) is now classified as an ordinary
`CAPABILITY_EXECUTION_CANDIDATE`, same as any other capabilityId — which
then correctly fails downstream at the orchestrator with
`CAPABILITY_NOT_DISCOVERABLE` (unregistered capability), exactly like any
other unknown capability id would. No real caller's behavior changes.

### Tests updated
- `DecisionEngine.test.ts` (test B): now asserts the former reserved id
  classifies as `CAPABILITY_EXECUTION`.
- `TaskProcessor.test.ts` (test C): now asserts it is accepted like any
  other valid decision.
- `BrainRequestGateway.decisionIntegration.test.ts` (test D): re-targeted
  to exercise the `DECISION_INVALID` rejection path instead (still proves
  a TaskProcessor rejection short-circuits before the orchestrator).

---

## Part 3 — TermuxRuntimeService: Approval State Synchronization

### Root cause confirmed
`TermuxRuntimeService.resolveApproval()` called
`PendingApprovalStore.resolve()`, which **irreversibly** marked the token
`consumed = true` before bridge connectivity (`this.check()`) or
re-authorization were verified. If the bridge was transiently unreachable
at the exact moment of approval (a real, plausible race inside the
token's 3-minute TTL window), the token was already permanently burned —
the human's valid approval was silently lost with no way to retry; the
whole request/approval cycle had to restart from scratch.

### Change — PENDING → RESERVED → CONSUMED
- `src/core/execution/authorization/PendingApprovalStore.ts`:
  replaced the boolean `consumed` flag with an explicit
  `status: "PENDING" | "RESERVED" | "CONSUMED"`.
  - `resolve(token, "APPROVE")` now transitions `PENDING → RESERVED`
    (not `CONSUMED`) and returns the request, same as before from the
    caller's point of view.
  - `resolve(token, "REJECT")` is unchanged: immediately final,
    `PENDING → CONSUMED`.
  - A second `resolve()` call against a `RESERVED` (or `CONSUMED`) token
    still returns `REPLAY` — the double-execution/replay guarantee is
    unchanged.
  - Added `confirm(token)`: finalizes `RESERVED → CONSUMED` (call on a
    final, non-transient outcome).
  - Added `release(token)`: returns `RESERVED → PENDING` (call on a
    transient/environmental failure) so the same token can be retried
    within its original TTL. A `release()` on an already-expired token
    finalizes it to `CONSUMED` instead (no resurrection past TTL).
- `src/core/execution/runtimes/TermuxRuntimeService.ts`
  (`resolveApproval()`): every return path now explicitly calls
  `confirm()` or `release()`:
  - Bridge unreachable right after approval → `release()` → `BRIDGE_UNREACHABLE`,
    token stays valid for retry.
  - Re-authorization denies (capability disabled, unknown, policy deny,
    etc.) → `confirm()` → terminally consumed (correct: not transient).
  - Execution succeeds → `confirm()`.

  Note: a candidate third branch — releasing on a "runtime not
  READY/unhealthy" authorization denial — was considered and **not**
  added, because by the time `authorizeRequest()` runs in this method,
  `status.connected` has already been confirmed true, which (given how
  `check()` derives readiness/health) guarantees `isReady()`/`isHealthy()`
  are already true too. Adding that branch would have been unreachable
  dead code, the same category of issue fixed in Part 2 — so it was left
  out to keep the fix deterministic and exercised entirely by tests.

### Public API unchanged
`resolveApproval(token, decision): Promise<IExecutionResult>` signature
and response shape are unchanged. `PendingApprovalStore.resolve()`
signature and return shape are unchanged (still `{resolution, request?}`).

### Tests added
- `PendingApprovalStore.task020.test.ts` (8 cases): reserve-not-consume,
  replay-while-reserved, release-then-retry, confirm-then-permanent-replay,
  confirm/release no-ops on non-reserved tokens, release-on-expired
  finalizes rather than resurrects, REJECT unchanged.
- `TermuxRuntimeServiceApprovalSync.task020.test.ts` (3 cases): the
  end-to-end regression — approve during a bridge outage, then retry the
  **same token** successfully once the bridge recovers; a genuine
  non-transient denial (capability disabled) permanently consumes the
  token (no retry); concurrent double-approve of the same token never
  executes twice.
- Existing `PendingApprovalStore.task019.test.ts` and
  `TermuxRuntimeServiceFileRead.test.ts` / `TermuxRuntimeServiceAuthorization.test.ts`
  pass unmodified — their assertions only ever check `resolve()`'s
  immediate return value, which is unchanged for both APPROVE and REJECT.

---

## Out of scope — confirmed
- **Admin routes**: not touched. Grep confirms no admin route file
  imports `BrainRequestGateway`, `DecisionEngine`, `TaskProcessor`,
  `PendingApprovalStore`, or `TermuxRuntimeService`.
- **Prisma/DB schema**: not touched. No `.prisma` file opened or edited.
- **Public APIs**: `bridge.cjs` and `AIChatService.cjs` were not modified.
  `IExecutionResult` only gained optional fields.

## Note on the generated brain-runtime bundle
`orbis-server/brain-runtime/**` is a **build artifact** (gitignored, only
`package.json` is tracked — see `.gitignore`), produced by
`npm run build:brain-runtime` (`tsc -p tsconfig.brain-runtime.json`), and
is what `AIChatService.cjs` / `bridge.cjs` actually `require()` at
runtime. It was not present in this environment (never built here) and
is not part of source control, so there is nothing to regenerate/commit
for it — but it **will need a fresh `npm run build` (or
`build:brain-runtime`)** in the Termux environment before the Part 1
change (Missing Context Detection) is visible to the running server.
This is the existing, unmodified build process — nothing about it was
changed by this task.

---

## Validation

This sandbox has no network access and no `node_modules` (`npm install`
is not possible here — confirmed via a blocked registry request). The
project's own `npm run type-check` / `lint` / `check:circular` / `test`
could therefore not be executed end-to-end in this environment. What was
done instead, as the strongest available substitute:

- **type-check (best effort, real `tsc`)**: ran the actual
  `tsconfig.brain-runtime.json` program (the exact file set +
  transitive imports Part 1/2 touch: `BrainRequestGateway.ts` →
  `DecisionEngine.ts`, `TaskProcessor.ts`, `IExecutionResult.ts`,
  `BrainCapabilityOrchestrator.ts`, `Logger.ts`, `BrainConfig.ts`) —
  **0 type errors** (one pre-existing, unrelated `moduleResolution`
  deprecation notice from the repo's own `tsconfig.brain-runtime.json`,
  not caused by this task). Also ran an ad-hoc strict `tsc` pass scoped
  to `TermuxRuntimeService.ts` + `PendingApprovalStore.ts` (Part 3) —
  **0 type errors** in the code itself; the only diagnostics were
  "cannot find `node:crypto`/`process`" from the missing `@types/node`
  package, which is a normal `devDependency` in `package.json` and will
  resolve once `npm install` runs in Termux.
- **lint (manual review against the actual configured rules)**: read
  `.eslintrc.json` (`eslint:recommended`,
  `@typescript-eslint/recommended`, `sonarjs/recommended`,
  `jsx-a11y/recommended`, `--max-warnings 0`). Checked every new/changed
  file for the specific rule this repo has hit before
  (`sonarjs/no-duplicate-string`, see the pre-existing
  `FILE_PACKAGE_JSON`/`FILE_README` fix in
  `TermuxRuntimeServiceFileRead.test.ts`) and extracted repeated literals
  (`STATUS_PENDING`/`STATUS_RESERVED`/`STATUS_CONSUMED`, `APPROVE`/`REJECT`
  constants) to bring every file to ≤3–4 occurrences of any literal,
  in line with what already passes elsewhere in this codebase. No unused
  imports/exports were left behind (manually re-read every edited file
  after removing the `NON_EXECUTION` branches).
- **check:circular**: no new cross-module import was introduced.
  `BrainRequestGateway.ts` still imports only `BrainCapabilityOrchestrator`,
  `DecisionEngine`, `TaskProcessor`, `IExecutionResult`, `Logger`,
  `BrainConfig` (all pre-existing). `PendingApprovalStore.ts` and
  `TermuxRuntimeService.ts` have the same import graph as before this
  task, just new methods on existing classes — no new imports at all.
- **test**: could not run `vitest` (no `node_modules`). All new tests
  were written to reuse the exact existing test scaffolding/stubs already
  used successfully in this codebase (`stubConnectedFetch`,
  `vi.spyOn(TermuxRuntime.prototype, "execute")`, the same
  `RuntimeRegistry`/`RuntimeLifecycleManager` construction pattern), and
  every modified existing test was manually traced against the new
  source line-by-line to confirm its assertions still hold.

**These four checks must still be run for real in the Termux environment
before push**, exactly as instructed:

```
npm run type-check
npm run lint
npm run check:circular
npm run test
```

## Files changed
```
src/core/execution/interfaces/IExecutionResult.ts                                  (+9 lines, additive)
src/core/brain/BrainRequestGateway.ts                                              (+~70 lines)
src/core/brain/DecisionEngine.ts                                                   (−~15 lines)
src/core/brain/TaskProcessor.ts                                                    (−~15 lines)
src/core/execution/authorization/PendingApprovalStore.ts                           (restructured, same public shape)
src/core/execution/runtimes/TermuxRuntimeService.ts                                (resolveApproval() restructured)

src/core/brain/__tests__/DecisionEngine.test.ts                                    (test B updated)
src/core/brain/__tests__/TaskProcessor.test.ts                                     (test C updated)
src/core/brain/__tests__/BrainRequestGateway.decisionIntegration.test.ts           (test D updated)
src/core/brain/__tests__/BrainRequestGateway.missingContext.test.ts                (new)
src/core/execution/__tests__/PendingApprovalStore.task020.test.ts                  (new)
src/core/execution/__tests__/TermuxRuntimeServiceApprovalSync.task020.test.ts      (new)

docs/AUDIT_REPORTS/020_PART2_FINAL_AUDIT_REPORT.md                                 (new, this file)
```

No commit was made. No push was made. Repository is left as working-tree
changes only, ready for your review / for pushing from Termux + Git after
approval.
