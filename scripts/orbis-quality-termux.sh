#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

# shellcheck disable=SC1091
source scripts/orbis-quality-state.sh

STATE_DIR="$HOME/.orbis-quality"
FAIL_STATE="$STATE_DIR/last-failure.state"
mkdir -p "$STATE_DIR"

EMBEDDED="${ORBIS_EMBEDDED:-0}"
FROM_STAGE=""
MODE="full"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_STAGE="${2:-}"
      shift 2
      ;;
    --resume)
      MODE="resume"
      shift
      ;;
    *)
      echo "Usage: $0 [--from STAGE|--resume]" >&2
      exit 2
      ;;
  esac
done

REPORT_DIR="$HOME/storage/downloads"
[[ -d "$REPORT_DIR" ]] || REPORT_DIR="$HOME"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/ORBIS-TERMUX-QUALITY-REPORT-$STAMP.txt"

if [[ "$EMBEDDED" != "1" ]]; then
  exec > >(tee "$REPORT") 2>&1
fi

if [[ "$MODE" == "resume" && -z "$FROM_STAGE" && -f "$FAIL_STATE" ]]; then
  state="$(orbis_state_read_failure "$FAIL_STATE" "$(node scripts/orbis-quality-fingerprint.cjs)")" || {
    echo "ORBIS: resume state is invalid; refusing to guess."
    exit 22
  }
  pipeline="${state%%$'\t'*}"
  stage="${state#*$'\t'}"
  if [[ "$pipeline" == "TERMUX" ]]; then
    FROM_STAGE="$stage"
  fi
fi

STAGES=(preflight secrets architecture accounting circular lint type audit build mutation db-drift coverage)

stage_index() {
  local needle="$1"
  local i
  for i in "${!STAGES[@]}"; do
    [[ "${STAGES[$i]}" == "$needle" ]] && { echo "$i"; return 0; }
  done
  return 1
}

START_INDEX=0
if [[ -n "$FROM_STAGE" ]]; then
  START_INDEX="$(stage_index "$FROM_STAGE")" || {
    echo "ORBIS: unknown Termux stage: $FROM_STAGE" >&2
    exit 2
  }
fi

START_FP="$(node scripts/orbis-quality-fingerprint.cjs)"
FAILED_STAGE=""

finish() {
  local rc=$?
  local end_fp
  end_fp="$(node scripts/orbis-quality-fingerprint.cjs 2>/dev/null || echo unavailable)"

  if [[ $rc -eq 0 && "$end_fp" != "$START_FP" ]]; then
    rc=97
    FAILED_STAGE="repository-changed"
    echo
    echo "FAIL: repository content changed during the Termux quality run."
  fi

  if [[ $rc -eq 0 ]]; then
    orbis_state_write_pass "$STATE_DIR/termux.pass" TERMUX "$START_FP"
  elif [[ -n "$FAILED_STAGE" && "$FAILED_STAGE" != "repository-changed" ]]; then
    orbis_state_write_failure "$FAIL_STATE" TERMUX "$FAILED_STAGE" "$START_FP" || true
  fi

  echo
  echo "============================================================"
  if [[ $rc -eq 0 ]]; then
    echo "TERMUX FINAL STATUS: PASS"
  else
    echo "TERMUX FINAL STATUS: FAIL"
    [[ -n "$FAILED_STAGE" ]] && echo "FAILED STAGE: $FAILED_STAGE"
  fi
  echo "STARTING FINGERPRINT: $START_FP"
  echo "ENDING FINGERPRINT:   $end_fp"
  [[ "$EMBEDDED" != "1" ]] && echo "REPORT: $REPORT"
  echo "============================================================"

  if [[ "$EMBEDDED" != "1" ]] && command -v termux-media-scan >/dev/null 2>&1; then
    timeout 5s termux-media-scan "$REPORT" >/dev/null 2>&1 || true
  fi

  trap - EXIT
  exit "$rc"
}
trap finish EXIT

echo "============================================================"
echo "ORBIS FOUNDATION — TERMUX SERIAL QUALITY PIPELINE"
echo "============================================================"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Repository: $ROOT"
echo "Branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse HEAD)"
echo "Platform: $(node -p 'process.platform + "/" + process.arch')"
echo "Resume from: ${FROM_STAGE:-START}"
echo

run_stage() {
  local id="$1"
  local label="$2"
  shift 2

  local idx
  idx="$(stage_index "$id")"

  if (( idx < START_INDEX )); then
    echo
    echo "===== $id — REUSED PRIOR PASS ====="
    return 0
  fi

  echo
  echo "===== $id — $label ====="
  if "$@"; then
    echo "RESULT: PASS"
  else
    local rc=$?
    FAILED_STAGE="$id"
    echo "RESULT: FAIL (exit $rc)"
    return "$rc"
  fi
}

preflight() {
  bash scripts/orbis-quality-selftest.sh
  [[ "$(node -p 'process.platform')" == "android" ]] || {
    echo "Expected native Termux/Android."
    return 20
  }
  command -v node >/dev/null
  command -v npm >/dev/null
  command -v git >/dev/null
  [[ -x node_modules/.bin/vitest ]]
  [[ -x node_modules/.bin/stryker ]]
  [[ -f stryker.accounting.config.mjs ]]
  [[ -f scripts/orbis-accounting-architecture-guard.cjs ]]
  [[ -f scripts/orbis-secret-guard.cjs ]]
  [[ -f scripts/orbis-db-drift-check.sh ]]
  echo "Node: $(node --version)"
  echo "npm: $(npm --version)"
  echo "Vitest: $(node_modules/.bin/vitest --version)"
  echo "Stryker: $(node_modules/.bin/stryker --version)"
}

run_stage preflight "Runner integrity + environment/tool availability" preflight
run_stage secrets "Tracked-source secret guard" npm run check:secrets
run_stage architecture "Accounting architecture boundary guard" npm run check:architecture:accounting
run_stage accounting "Accounting invariants + property + financial controls" npm run test:accounting:strong
run_stage circular "Circular dependency guard" npm run check:circular
run_stage lint "ESLint / SonarJS local preflight" npm run lint
run_stage type "TypeScript type-check" npm run type-check
run_stage audit "Dependency audit (high severity gate)" npm run audit:dependencies
run_stage build "Production build" npm run build
run_stage mutation "Targeted Accounting mutation test" npm run test:mutation:accounting

db_drift_stage() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "SKIP: DATABASE_URL is not present in this shell."
    return 0
  fi
  npm run check:db-drift
}
run_stage db-drift "Read-only database drift guard when DATABASE_URL exists" db_drift_stage

run_stage coverage "Full Vitest coverage — hard floor 60% all metrics" npm run test:coverage
