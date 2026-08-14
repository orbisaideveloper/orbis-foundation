# ORBIS Termux / Android / Offline-AI Observatory

Repository-backed Admin Dashboard evidence center. It discovers committed
audit reports under `docs/AUDIT_REPORTS/`, extracts task evidence, groups
changed files by layer, resolves relative imports, and calculates progress
from real audit records. No future task is hardcoded. TASK-006+ appears only
after its implementation audit is committed. The Observatory does not execute
shell commands, grant root, or bypass the execution authorization architecture.
