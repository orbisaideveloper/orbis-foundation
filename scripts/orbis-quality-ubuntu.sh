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
REPORT="$REPORT_DIR/ORBIS-UBUNTU-QUALITY-REPORT-$STAMP.txt"

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
  if [[ "$pipeline" == "UBUNTU" ]]; then
    FROM_STAGE="$stage"
  fi
fi

STAGES=(preflight knip jscpd playwright-smoke playwright-visual)

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
    echo "ORBIS: unknown Ubuntu stage: $FROM_STAGE" >&2
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
    echo "FAIL: repository content changed during the Ubuntu quality run."
  fi

  if [[ $rc -eq 0 ]]; then
    orbis_state_write_pass "$STATE_DIR/ubuntu.pass" UBUNTU "$START_FP"
  elif [[ -n "$FAILED_STAGE" && "$FAILED_STAGE" != "repository-changed" ]]; then
    orbis_state_write_failure "$FAIL_STATE" UBUNTU "$FAILED_STAGE" "$START_FP" || true
  fi

  echo
  echo "============================================================"
  if [[ $rc -eq 0 ]]; then
    echo "UBUNTU FINAL STATUS: PASS"
  else
    echo "UBUNTU FINAL STATUS: FAIL"
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
echo "ORBIS FOUNDATION — UBUNTU SERIAL QUALITY PIPELINE"
echo "============================================================"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Repository: $ROOT"
echo "Branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse HEAD)"
echo "Resume from: ${FROM_STAGE:-START}"
echo

command -v proot-distro >/dev/null 2>&1 || {
  FAILED_STAGE="preflight"
  echo "FAIL: proot-distro is unavailable."
  exit 20
}

export ORBIS_UBUNTU_START_INDEX="$START_INDEX"

set +e
proot-distro login ubuntu \
  --bind "$ROOT:/orbis-source" \
  --bind "$STATE_DIR:/orbis-state" \
  -- bash -s <<'UBUNTU'
set -Eeuo pipefail

TOOLS="/root/.orbis-quality-tools"
RUNTIME="/root/.orbis-quality-runtime"
WORK="/root/.orbis-quality-work-$$"
START_INDEX="${ORBIS_UBUNTU_START_INDEX:-0}"

STAGES=(preflight knip jscpd playwright-smoke playwright-visual)

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

mkdir -p "$WORK"
tar -C /orbis-source \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.orbis-backup \
  --exclude=.stryker-tmp \
  --exclude=test-results \
  --exclude=playwright-report \
  -cf - . | tar -C "$WORK" -xf -

cd "$WORK"

run_stage() {
  local id="$1"
  local label="$2"
  shift 2

  local idx=-1 i
  for i in "${!STAGES[@]}"; do
    if [[ "${STAGES[$i]}" == "$id" ]]; then idx="$i"; break; fi
  done

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
    printf '%s\n' "$id" > /orbis-state/ubuntu.failed-stage
    echo "RESULT: FAIL (exit $rc)"
    exit "$rc"
  fi
}

preflight() {
  [[ "$(node -p 'process.platform + "/" + process.arch')" == "linux/arm64" ]]
  [[ -x "$TOOLS/node_modules/.bin/jscpd" ]]
  [[ -x "$TOOLS/node_modules/.bin/knip" ]]
  [[ -x "$RUNTIME/node_modules/.bin/playwright" ]]

  local source_fp runtime_fp
  source_fp="$(cat package.json package-lock.json | sha256sum | cut -d " " -f1)"
  [[ -f "$RUNTIME/dependency-fingerprint" ]] || {
    echo "FAIL: Ubuntu runtime fingerprint is missing. Run: npm run quality:ubuntu:setup"
    return 30
  }
  runtime_fp="$(cat "$RUNTIME/dependency-fingerprint")"
  [[ "$source_fp" == "$runtime_fp" ]] || {
    echo "FAIL: Ubuntu runtime is stale for the current package.json/package-lock.json."
    echo "Run: npm run quality:ubuntu:setup"
    return 31
  }

  (
    cd "$RUNTIME"
    node -e "import(\"vitest/config\").then(() => console.log(\"vitest/config import: PASS\"))"
  )

  echo "Node: $(node --version)"
  echo "JSCPD: $("$TOOLS/node_modules/.bin/jscpd" --version)"
  echo "Knip: $("$TOOLS/node_modules/.bin/knip" --version)"
  echo "Playwright: $("$RUNTIME/node_modules/.bin/playwright" --version)"
  echo "Ubuntu runtime fingerprint: PASS"
}

run_stage preflight "Ubuntu persistent tool/runtime preflight" preflight

# Reuse the prepared project dependency tree; no per-run node_modules copy.
ln -s "$RUNTIME/node_modules" "$WORK/node_modules"

run_stage knip "Whole-repo Knip 6.32.2 dead-code gate" \
  "$TOOLS/node_modules/.bin/knip" --no-progress

run_stage jscpd "Whole-repo JSCPD 5.0.16 duplication gate" \
  "$TOOLS/node_modules/.bin/jscpd" ./src ./orbis-server --threshold 0


run_stage playwright-smoke "Mobile Chromium smoke" \
  npm run test:e2e:mobile:smoke

visual_stage() {
  if find tests/e2e -type f -path '*-snapshots/*' -print -quit | grep -q .; then
    npm run test:e2e:mobile:visual
  else
    echo "SKIP: no approved Playwright visual baseline is present."
  fi
}
run_stage playwright-visual "Approved mobile visual regression when baseline exists" visual_stage
UBUNTU
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  if [[ -f "$STATE_DIR/ubuntu.failed-stage" ]]; then
    FAILED_STAGE="$(cat "$STATE_DIR/ubuntu.failed-stage")"
    rm -f "$STATE_DIR/ubuntu.failed-stage"
  elif [[ -n "$FROM_STAGE" ]]; then
    FAILED_STAGE="$FROM_STAGE"
  else
    FAILED_STAGE="preflight"
  fi
  exit "$RC"
fi
rm -f "$STATE_DIR/ubuntu.failed-stage"
