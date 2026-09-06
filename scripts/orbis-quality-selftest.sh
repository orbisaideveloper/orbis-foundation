#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS SELFTEST: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

# shellcheck disable=SC1091
source scripts/orbis-quality-state.sh

TMP="$(mktemp -d "${TMPDIR:-$HOME/.cache}/orbis-quality-selftest.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "ORBIS QUALITY RUNNER SELFTEST"

echo "1. Shell syntax"
bash -n \
  scripts/orbis-quality-state.sh \
  scripts/orbis-quality-selftest.sh \
  scripts/orbis-quality-termux.sh \
  scripts/orbis-quality-ubuntu.sh \
  scripts/orbis-quality-all.sh \
  scripts/orbis-quality-status.sh \
  scripts/orbis-report-run.sh
echo "   PASS"

echo "2. Node helper syntax + stage scope CLI"
node --check scripts/orbis-quality-fingerprint.cjs
[[ -n "$(node scripts/orbis-quality-fingerprint.cjs)" ]]
[[ -n "$(node scripts/orbis-quality-fingerprint.cjs --stage UBUNTU jscpd)" ]]
[[ -n "$(node scripts/orbis-quality-fingerprint.cjs --stage TERMUX coverage)" ]]
echo "   PASS"

echo "3. State data is parsed as data, never executed"
MARKER="$TMP/SHOULD_NOT_EXIST"
cat > "$TMP/hostile.state" <<EOF
STATE_VERSION=1
PIPELINE=TERMUX
STAGE=architecture
TIMESTAMP=2026-09-05 10:56:20 +0530
UNKNOWN=\$(touch "$MARKER")
EOF

read -r pipeline stage < <(
  orbis_state_read_failure "$TMP/hostile.state" | tr '\t' ' '
)

[[ "$pipeline" == "TERMUX" ]]
[[ "$stage" == "architecture" ]]
[[ ! -e "$MARKER" ]]
echo "   PASS"

echo "4. Atomic V2 state write/read round-trip"
orbis_state_write_failure "$TMP/roundtrip.state" UBUNTU knip
[[ "$(orbis_state_get "$TMP/roundtrip.state" STATE_VERSION)" == "2" ]]
read -r pipeline stage < <(
  orbis_state_read_failure "$TMP/roundtrip.state" | tr '\t' ' '
)
[[ "$pipeline" == "UBUNTU" ]]
[[ "$stage" == "knip" ]]
[[ -n "$(orbis_state_get "$TMP/roundtrip.state" STAGE_FP_UBUNTU_knip)" ]]
echo "   PASS"

echo "5. Invalid state is rejected"
cat > "$TMP/invalid.state" <<'EOF'
STATE_VERSION=2
PIPELINE=TERMUX
STAGE=not-a-real-stage
TIMESTAMP=anything
EOF
if orbis_state_read_failure "$TMP/invalid.state" >/dev/null 2>&1; then
  echo "   FAIL: invalid stage was accepted"
  exit 41
fi
echo "   PASS"

echo "6. No quality runner sources state data files"
if grep -nE '(^|[[:space:]])(source|\.)[[:space:]]+.*(last-failure|full\.pass|termux\.pass|ubuntu\.pass)' \
  scripts/orbis-quality-*.sh; then
  echo "   FAIL: unsafe state sourcing detected"
  exit 42
fi
echo "   PASS"

echo "7. Report wrapper does not double-append final status"
if grep -q 'tee -a.*REPORT' scripts/orbis-report-run.sh; then
  echo "   FAIL: report wrapper still double-appends"
  exit 43
fi
echo "   PASS"

echo "8. Resume V2 keeps failed stage when prior scopes are unchanged"
orbis_state_write_failure "$TMP/resume-v2.state" UBUNTU jscpd
resume_stage="$(orbis_state_resume_stage "$TMP/resume-v2.state" UBUNTU jscpd)"
[[ "$resume_stage" == "jscpd" ]]
echo "   PASS"

echo "9. Resume V2 backs up to earliest changed prior stage"
cp "$TMP/resume-v2.state" "$TMP/resume-v2-changed.state"
awk '
  /^STAGE_FP_UBUNTU_knip=/ { print "STAGE_FP_UBUNTU_knip=forced-mismatch"; next }
  { print }
' "$TMP/resume-v2-changed.state" > "$TMP/resume-v2-changed.tmp"
mv "$TMP/resume-v2-changed.tmp" "$TMP/resume-v2-changed.state"
resume_stage="$(
  orbis_state_resume_stage "$TMP/resume-v2-changed.state" UBUNTU jscpd
)"
[[ "$resume_stage" == "knip" ]]
echo "   PASS"

echo "10. V2 checkpoint remains readable without exact-global matching"
read -r pipeline stage < <(
  orbis_state_read_failure "$TMP/resume-v2.state" | tr '\t' ' '
)
[[ "$pipeline" == "UBUNTU" && "$stage" == "jscpd" ]]
echo "   PASS"

echo
echo "ORBIS QUALITY RUNNER SELFTEST: PASS"
