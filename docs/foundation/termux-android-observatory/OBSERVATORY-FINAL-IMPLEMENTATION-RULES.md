# ORBIS TERMUX / ANDROID / OFFLINE-AI OBSERVATORY — FINAL IMPLEMENTATION CONTRACT

OBJECTIVE
Complete the Observatory as a REAL-DATA living technical observability system for the
Termux / Android / Offline-AI initiative.

NON-NEGOTIABLE
- No mock/static task data.
- No hardcoded task count or percentage.
- No invented status, commit, file, test, dependency, or capability.
- Git history + audit documents + actual source/tests are the evidence sources.
- Preserve existing Source Explorer, Time Machine, AI/Chat, dashboard APIs, runtime,
  security, and unrelated legacy logic.
- If evidence is missing, show UNKNOWN / NOT VERIFIED rather than inventing data.

CURRENT SCOPE
Resolve TASK-001 through TASK-005 from real repository evidence.
The current UI showing TASK-003/TASK-004 as UNKNOWN must be investigated and fixed if
their real audit/commit evidence exists.

INITIATIVE PURPOSE
Observe and document the implementation progress of ORBIS's Termux / Android /
Offline-AI capability foundation, including execution/runtime/security architecture and
future Android/offline-AI capability work.

THE OBSERVATORY MUST SHOW
1. Initiative purpose.
2. What the system actually does.
3. Real progress.
4. Current phase/result.
5. Completed work.
6. Next implementation target.
7. TASK-001..005 evidence.
8. Future tasks only after real evidence exists.

TASK DETAIL
Every task must be clickable and show:
- Task ID
- Status
- Objective
- Actual work performed
- Implementation summary
- Changed files
- Frontend files
- Backend/API files
- Core/runtime files
- Dependencies
- Commit hash/message/date
- Tests and result
- Audit document/evidence
- Security/authorization evidence
- Current result
- Next step
- Source/evidence references

Provide COPY FULL EVIDENCE, copying a structured task report to clipboard.

SYSTEM MAP
Provide a clickable dependency/architecture view derived from the real repository:
FRONTEND -> Dashboard/Observatory components
BACKEND/API -> actual routes/services
CORE -> actual execution/policy/runtime/authorization
TERMUX/ANDROID -> actual bridge/runtime/service
DATA/AUDIT -> actual audit docs/Git/test evidence

Derive relationships from imports, API calls, service usage, and repository structure.
Never invent relationships or paths.

REAL PROGRESS
Calculate completedTasks, totalKnownTasks, and percentage from discovered evidence.
Do not create future task rows without evidence.
TASK-006+ must be discovered by the same pipeline after implementation/audit/commit.

PERMANENT WORKFLOW
TASK START
  -> IMPLEMENT
  -> TEST
  -> AUDIT
  -> COMMIT
  -> OBSERVATORY DISCOVERY
  -> TASK EVIDENCE
  -> NEXT TASK

DOCUMENTATION
Document purpose, scope, evidence sources, discovery rules, evidence model, dependency
discovery, frontend/backend relationships, task detail format, copy-evidence format,
future-task workflow, anti-mock rules, and backup/versioning.

TESTS
Add/update tests for:
- real TASK-001..005 discovery
- no false UNKNOWN when evidence exists
- missing evidence -> UNKNOWN/NOT VERIFIED
- real progress calculation
- task detail
- copy evidence
- dependency map
- frontend/backend relationship rendering
- no mock injection
- legacy dashboard features remain functional

VALIDATION
Run configured type-check, lint, full tests, and production build.
Do not claim success unless commands actually pass.

GIT SAFETY
Before modifications:
- inspect git status
- create and push a timestamped backup branch
- preserve uncommitted user work
- never reset/discard unrelated changes

After successful validation:
- inspect diff
- commit only intended changes
- push main
- push safety backup
- print final commit hash, task count, progress, test result, and build result.

ACCEPTANCE
[ ] TASK-001..005 resolved from REAL evidence
[ ] progress is real
[ ] no mock/static task data remains
[ ] task details clickable
[ ] full evidence copy works
[ ] purpose and actual work visible
[ ] dependency map visible
[ ] frontend/backend/core/runtime relationships visible
[ ] future task discovery works
[ ] documentation exists
[ ] legacy features preserved
[ ] tests pass
[ ] build passes
[ ] Git commit exists
[ ] main pushed
[ ] backup exists

IMPORTANT
Do not stop at a parser problem.
Do not stop after documentation.
Do not use placeholders to make the UI look complete.
Trace the repository evidence, fix the implementation, validate it, and finish the chapter.
