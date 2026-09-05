#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

# shellcheck disable=SC1091
source scripts/orbis-quality-state.sh

STATE_DIR="$HOME/.orbis-quality"
FAIL_STATE="$STATE_DIR/last-failure.state"
FULL_PASS="$STATE_DIR/full.pass"
mkdir -p "$STATE_DIR"

MODE="full"
[[ "${1:-}" == "--resume" ]] && MODE="resume"
if [[ $# -gt 1 || ( $# -eq 1 && "${1:-}" != "--resume" ) ]]; then
  echo "Usage: $0 [--resume]" >&2
  exit 2
fi

REPORT_DIR="$HOME/storage/downloads"
[[ -d "$REPORT_DIR" ]] || REPORT_DIR="$HOME"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/ORBIS-QUALITY-FULL-REPORT-$STAMP.txt"

exec > >(tee "$REPORT") 2>&1

status="FAIL"
finish() {
  local rc=$?
  [[ $rc -eq 0 ]] && status="PASS"

  echo
  echo "============================================================"
  echo "ORBIS FULL QUALITY FINAL STATUS: $status"
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

echo "============================================================"
echo "ORBIS FOUNDATION — FULL SERIAL FAIL-FAST QUALITY RUN"
echo "============================================================"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Repository: $ROOT"
echo "Branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse HEAD)"
echo "Mode: $MODE"
echo

# Fresh certification never trusts an older checkpoint/certificate.
# Resume keeps the exact fingerprint-bound checkpoint.
if [[ "$MODE" == "full" ]]; then
  rm -f "$FULL_PASS" "$FAIL_STATE"
elif [[ ! -f "$FAIL_STATE" ]]; then
  echo "ORBIS: no resume checkpoint exists; refusing to guess a stage."
  exit 22
fi

echo "===== runner-selftest — state/report/resume integrity ====="
bash scripts/orbis-quality-selftest.sh
echo "RESULT: PASS"
echo

START_FP="$(node scripts/orbis-quality-fingerprint.cjs)"

pass_matches_start() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  local version saved_fp
  version="$(orbis_state_get "$file" STATE_VERSION || true)"
  saved_fp="$(orbis_state_get "$file" FINGERPRINT || true)"
  [[ "$version" == "1" && "$saved_fp" == "$START_FP" ]]
}

PIPELINE=""
STAGE=""

if [[ "$MODE" == "resume" && -f "$FAIL_STATE" ]]; then
  state="$(orbis_state_read_failure "$FAIL_STATE" "$START_FP")" || {
    echo "ORBIS: resume state is invalid; refusing to guess or execute it."
    exit 22
  }
  PIPELINE="${state%%$'\t'*}"
  STAGE="${state#*$'\t'}"
  echo "Resume checkpoint: $PIPELINE / $STAGE"
  echo
fi

# Permanent full-run order:
# Ubuntu preflight -> Knip -> JSCPD -> Playwright -> Termux -> Coverage last.
if [[ "$MODE" == "resume" && "$PIPELINE" == "UBUNTU" && -n "$STAGE" ]]; then
  bash scripts/orbis-quality-ubuntu.sh --from "$STAGE"
elif [[ "$MODE" == "resume" && "$PIPELINE" == "TERMUX" && -n "$STAGE" ]]; then
  if pass_matches_start "$STATE_DIR/ubuntu.pass"; then
    echo "===== UBUNTU PIPELINE — REUSED PRIOR PASS FOR CURRENT FINGERPRINT ====="
  else
    echo "ORBIS: Ubuntu PASS marker is missing/stale; refusing unsafe TERMUX resume."
    exit 24
  fi
else
  bash scripts/orbis-quality-ubuntu.sh
fi

if [[ "$MODE" == "resume" && "$PIPELINE" == "TERMUX" && -n "$STAGE" ]]; then
  bash scripts/orbis-quality-termux.sh --from "$STAGE"
else
  bash scripts/orbis-quality-termux.sh
fi

END_FP="$(node scripts/orbis-quality-fingerprint.cjs)"
[[ "$END_FP" == "$START_FP" ]] || {
  echo "ORBIS: repository fingerprint changed during full certification."
  exit 97
}

pass_matches_start "$STATE_DIR/ubuntu.pass" || {
  echo "ORBIS: Ubuntu PASS marker is missing or stale."
  exit 23
}
pass_matches_start "$STATE_DIR/termux.pass" || {
  echo "ORBIS: Termux PASS marker is missing or stale."
  exit 23
}

orbis_state_write_pass "$FULL_PASS" FULL "$START_FP" "$REPORT"
rm -f "$FAIL_STATE"

echo
echo "FULL CERTIFICATE: WRITTEN"
echo "CERTIFIED FINGERPRINT: $START_FP"
