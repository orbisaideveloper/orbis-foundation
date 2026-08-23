#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_DIRECTORY="$(cd "$SCRIPT_DIRECTORY/.." && pwd)"

if [[ -d "$HOME/storage/downloads" ]]; then
  REPORT_DIRECTORY="$HOME/storage/downloads"
elif [[ -d "$HOME/Downloads" ]]; then
  REPORT_DIRECTORY="$HOME/Downloads"
else
  REPORT_DIRECTORY="$HOME/orbis-reports"
  mkdir -p "$REPORT_DIRECTORY"
fi

MODE="${1:-}"
case "$MODE" in
  start | verify | review) ;;
  *)
    echo "Usage: $0 {start|verify|review}" >&2
    exit 2
    ;;
esac

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_PATH="$REPORT_DIRECTORY/orbis-${MODE}-${TIMESTAMP}.log"
exec > >(tee "$REPORT_PATH") 2>&1

cd "$REPOSITORY_DIRECTORY"

progress() {
  echo
  echo "==> $1"
}

repository_summary() {
  local changed_state

  progress "Repository summary"
  echo "Path: $(git rev-parse --show-toplevel)"
  echo "Branch: $(git branch --show-current)"
  echo "HEAD: $(git rev-parse HEAD)"
  if [[ -n "$(git status --short)" ]]; then
    changed_state="changed"
  else
    changed_state="clean"
  fi
  echo "Worktree: $changed_state"
}

run_step() {
  local label="$1"
  shift
  progress "$label"
  "$@"
}

check_changed_commonjs() {
  local status_path
  local relative_path

  while IFS= read -r -d '' status_path; do
    relative_path="${status_path:3}"
    if [[ "$relative_path" == *.cjs && -f "$relative_path" ]]; then
      echo "Checking $relative_path"
      node --check "$relative_path"
    fi
  done < <(git status --porcelain=v1 -z)
}

repository_summary

case "$MODE" in
  start)
    progress "Current status"
    git status --short
    ;;
  review)
    progress "Current status"
    git status --short
    run_step "Whitespace error check" git diff --check
    run_step "Diff summary" git diff --stat
    run_step "Changed tracked filenames" git diff --name-only
    ;;
  verify)
    run_step "Logic integrity guard" node orbis-logic-guard.cjs
    run_step "Circular dependency guard" npm run check:circular
    run_step "Changed CommonJS syntax" check_changed_commonjs
    run_step "Shell syntax" bash -n test-all.sh .husky/pre-commit scripts/orbis-safe-workflow.sh
    run_step "Focused backend Admin and source tests" npx vitest run orbis-server/__tests__/admin-auth.test.mjs orbis-server/__tests__/source-api.test.mjs orbis-server/__tests__/time-machine-api.test.mjs orbis-server/__tests__/git-safety.test.mjs
    run_step "Focused frontend Admin tests" npx vitest run src/admin/__tests__/auth/AuthProvider.test.tsx src/admin/__tests__/auth/adminFetch.test.ts src/admin/system-logs/__tests__/SystemLogManager.test.tsx src/admin/__tests__/TimeMachineCard.test.tsx src/admin/__tests__/auth/Security.test.tsx
    run_step "Lint" npm run lint
    run_step "Type check" npm run type-check
    run_step "Complete coverage suite" npm test
    run_step "Production build" npm run build
    run_step "Final whitespace error check" git diff --check
    ;;
esac

progress "Completed $MODE mode"
echo "Report: $REPORT_PATH"
