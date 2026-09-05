#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

# shellcheck disable=SC1091
source scripts/orbis-quality-state.sh

STATE_DIR="$HOME/.orbis-quality"
FAIL_STATE="$STATE_DIR/last-failure.state"
CURRENT_FP="$(node scripts/orbis-quality-fingerprint.cjs)"
REQUIRE=0
BRIEF=0

for arg in "$@"; do
  case "$arg" in
    --require-current-pass) REQUIRE=1 ;;
    --brief) BRIEF=1 ;;
    *) echo "Usage: $0 [--brief|--require-current-pass]" >&2; exit 2 ;;
  esac
done

STATUS_REPORT=""
if [[ "$REQUIRE" -eq 0 && "$BRIEF" -eq 0 ]]; then
  REPORT_DIR="$HOME/storage/downloads"
  [[ -d "$REPORT_DIR" ]] || REPORT_DIR="$HOME"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  STATUS_REPORT="$REPORT_DIR/ORBIS-QUALITY-STATUS-REPORT-$STAMP.txt"

  exec > >(tee "$STATUS_REPORT") 2>&1

  finish_status() {
    local rc=$?
    echo "REPORT: $STATUS_REPORT"
    if command -v termux-media-scan >/dev/null 2>&1; then
      timeout 5s termux-media-scan "$STATUS_REPORT" >/dev/null 2>&1 || true
    fi
    trap - EXIT
    exit "$rc"
  }
  trap finish_status EXIT
fi

full_ok=0
last_time=""
last_report=""

if [[ -f "$STATE_DIR/full.pass" ]]; then
  version="$(orbis_state_get "$STATE_DIR/full.pass" STATE_VERSION || true)"
  saved_fp="$(orbis_state_get "$STATE_DIR/full.pass" FINGERPRINT || true)"
  last_time="$(orbis_state_get "$STATE_DIR/full.pass" TIMESTAMP || true)"
  last_report="$(orbis_state_get "$STATE_DIR/full.pass" REPORT || true)"
  [[ "$version" == "1" && "$saved_fp" == "$CURRENT_FP" ]] && full_ok=1
fi

failure_summary() {
  if [[ -f "$FAIL_STATE" ]]; then
    state="$(orbis_state_read_failure "$FAIL_STATE" "$CURRENT_FP" 2>/dev/null || true)"
    if [[ -n "$state" ]]; then
      pipeline="${state%%$'\t'*}"
      stage="${state#*$'\t'}"
      printf '%s/%s' "$pipeline" "$stage"
      return 0
    fi
  fi
  return 1
}

if [[ "$BRIEF" -eq 1 ]]; then
  if [[ "$full_ok" -eq 1 ]]; then
    echo "CURRENT FULL QUALITY: PASS"
  elif summary="$(failure_summary)"; then
    echo "CURRENT FULL QUALITY: INCOMPLETE — $summary"
  else
    echo "CURRENT FULL QUALITY: NOT CERTIFIED"
  fi
  exit 0
fi

echo "============================================================"
echo "ORBIS QUALITY STATUS"
echo "============================================================"
echo "Repo: $ROOT"
echo "Branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse HEAD)"
echo "Fingerprint: $CURRENT_FP"

if [[ "$full_ok" -eq 1 ]]; then
  echo "Current full quality: PASS"
  echo "Certified: $last_time"
  [[ -n "$last_report" ]] && echo "Report: $last_report"
else
  echo "Current full quality: NOT CERTIFIED"
  if summary="$(failure_summary)"; then
    echo "Resume checkpoint: $summary"
    echo "Resume with: orbis resume"
  fi
fi

if [[ "$REQUIRE" -eq 1 && "$full_ok" -ne 1 ]]; then
  echo "PUSH BLOCKED: run 'orbis verify' or the approved resume flow first."
  exit 1
fi
