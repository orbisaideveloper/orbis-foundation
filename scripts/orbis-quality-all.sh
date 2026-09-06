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
  [[ ( "$version" == "1" || "$version" == "2" ) && "$saved_fp" == "$START_FP" ]]
}

PIPELINE=""
STAGE=""
STATE_VERSION=""
UBUNTU_START=""
TERMUX_START=""
REUSE_UBUNTU=0

if [[ "$MODE" == "resume" ]]; then
  STATE_VERSION="$(orbis_state_get "$FAIL_STATE" STATE_VERSION || true)"
  state="$(orbis_state_read_failure "$FAIL_STATE")" || {
    echo "ORBIS: resume state is invalid; refusing to guess or execute it."
    exit 22
  }
  PIPELINE="${state%%$'\t'*}"
  STAGE="${state#*$'\t'}"
  echo "Saved failure checkpoint: $PIPELINE / $STAGE"
  echo "Saved state version: $STATE_VERSION"

  if [[ "$STATE_VERSION" == "1" ]]; then
    saved_fp="$(orbis_state_get "$FAIL_STATE" FINGERPRINT || true)"
    [[ -n "$saved_fp" && "$saved_fp" == "$START_FP" ]] || {
      echo "ORBIS: legacy resume checkpoint is stale; run a fresh verify."
      exit 22
    }
    if [[ "$PIPELINE" == "UBUNTU" ]]; then
      UBUNTU_START="$STAGE"
    else
      pass_matches_start "$STATE_DIR/ubuntu.pass" || {
        echo "ORBIS: legacy Ubuntu PASS marker is missing/stale."
        exit 24
      }
      REUSE_UBUNTU=1
      TERMUX_START="$STAGE"
    fi
  elif [[ "$STATE_VERSION" == "2" ]]; then
    if [[ "$PIPELINE" == "UBUNTU" ]]; then
      UBUNTU_START="$(orbis_state_resume_stage "$FAIL_STATE" UBUNTU "$STAGE")" || {
        echo "ORBIS: unable to compute safe Ubuntu resume stage."
        exit 22
      }
      echo "Resume V2 plan: UBUNTU from $UBUNTU_START"
    else
      if changed_ubuntu="$(orbis_state_first_changed_stage "$FAIL_STATE" UBUNTU)"; then
        UBUNTU_START="$changed_ubuntu"
        echo "Resume V2 plan: UBUNTU from $UBUNTU_START (repair affected Ubuntu scope)"
      else
        REUSE_UBUNTU=1
        echo "Resume V2 plan: reuse prior Ubuntu PASS (all Ubuntu stage scopes unchanged)"
      fi

      TERMUX_START="$(orbis_state_resume_stage "$FAIL_STATE" TERMUX "$STAGE")" || {
        echo "ORBIS: unable to compute safe Termux resume stage."
        exit 22
      }
      echo "Resume V2 plan: TERMUX from $TERMUX_START"
    fi
  else
    echo "ORBIS: unsupported resume state version."
    exit 22
  fi

  echo
fi

if [[ "$MODE" == "resume" && "$REUSE_UBUNTU" -eq 1 ]]; then
  echo "===== UBUNTU PIPELINE — REUSED PRIOR PASS AFTER STAGE-SCOPE REVALIDATION ====="
  orbis_state_write_pass "$STATE_DIR/ubuntu.pass" UBUNTU "$START_FP"
elif [[ "$MODE" == "resume" && -n "$UBUNTU_START" ]]; then
  bash scripts/orbis-quality-ubuntu.sh --from "$UBUNTU_START"
else
  bash scripts/orbis-quality-ubuntu.sh
fi

if [[ "$MODE" == "resume" && "$PIPELINE" == "TERMUX" && -n "$TERMUX_START" ]]; then
  bash scripts/orbis-quality-termux.sh --from "$TERMUX_START"
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
