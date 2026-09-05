#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 TASK_NAME command [args...]" >&2
  exit 2
fi

TASK_RAW="$1"
shift
TASK="$(printf '%s' "$TASK_RAW" | tr '[:lower:] ' '[:upper:]-' | tr -cd 'A-Z0-9._-')"
[[ -n "$TASK" ]] || TASK="COMMAND"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "Not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

REPORT_DIR="$HOME/storage/downloads"
[[ -d "$REPORT_DIR" ]] || REPORT_DIR="$HOME"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/ORBIS-${TASK}-REPORT-${STAMP}.txt"
START_HEAD="$(git rev-parse HEAD)"
START_BRANCH="$(git branch --show-current)"
START_STATE="$(git status --short)"

status="FAIL"
finish() {
  local rc=$?
  [[ $rc -eq 0 ]] && status="PASS"

  echo
  echo "============================================================"
  echo "FINAL STATUS: $status"
  echo "REPORT: $REPORT"
  echo "ENDING HEAD: $(git rev-parse HEAD 2>/dev/null || echo unavailable)"
  echo "============================================================"

  if command -v termux-media-scan >/dev/null 2>&1; then
    timeout 5s termux-media-scan "$REPORT" >/dev/null 2>&1 || true
  fi

  trap - EXIT
  exit "$rc"
}
trap finish EXIT

exec > >(tee "$REPORT") 2>&1

echo "============================================================"
echo "ORBIS FOUNDATION — REPORTED COMMAND"
echo "============================================================"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Repository: $ROOT"
echo "Branch: $START_BRANCH"
echo "Starting HEAD: $START_HEAD"
echo "Task: $TASK"
printf 'Command:'
printf ' %q' "$@"
echo
echo "Worktree before:"
if [[ -n "$START_STATE" ]]; then printf '%s\n' "$START_STATE"; else echo "(clean)"; fi
echo "============================================================"

"$@"
