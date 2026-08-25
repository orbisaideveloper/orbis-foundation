#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

REPORT_DIR="$HOME/storage/downloads"
[ -d "$REPORT_DIR" ] || REPORT_DIR="$HOME"
REPORT="$REPORT_DIR/orbis-prepush-$(date +%Y%m%d-%H%M%S).txt"

exec > >(tee "$REPORT") 2>&1

echo "=================================================="
echo " ORBIS FOUNDATION — FULL PRE-PUSH VERIFICATION"
echo "=================================================="
echo "Time: $(date)"
echo "HEAD: $(git rev-parse HEAD)"
echo

fail() {
  echo
  echo "❌ PUSH BLOCKED: $1"
  echo "Report: $REPORT"
  exit 1
}

pass() {
  echo "✅ $1"
}

echo "===== 0. SAFETY ====="

[ "$(git branch --show-current)" = "main" ] ||
  fail "Current branch is not main."

[ -z "$(git status --porcelain)" ] ||
  fail "Working tree is not clean."

pass "Branch main + clean working tree"

echo
echo "===== 1. LOGIC INTEGRITY ====="
node orbis-logic-guard.cjs ||
  fail "Logic Integrity Guard failed."
pass "Logic Integrity"

echo
echo "===== 2. CIRCULAR DEPENDENCIES ====="
npm run check:circular ||
  fail "Circular dependency check failed."
pass "Circular dependency check"

echo
echo "===== 3. LINT ====="
npm run lint ||
  fail "Lint failed."
pass "Lint"

echo
echo "===== 4. TYPE CHECK ====="
npm run type-check ||
  fail "Type check failed."
pass "Type check"

echo
echo "===== 5. ALL TESTS + COVERAGE ====="
npm run test:coverage ||
  fail "Full tests/coverage failed."
pass "All tests + coverage"

echo
echo "===== 6. PRODUCTION BUILD ====="
npm run build ||
  fail "Production build failed."
pass "Production build"

echo
echo "===== 7. DIFF / WHITESPACE ====="
git diff --check ||
  fail "Whitespace/diff check failed."
pass "Diff check"

echo
echo "===== 8. LINUX-ONLY KNIP + JSCPD ====="

command -v proot-distro >/dev/null 2>&1 ||
  fail "proot-distro is unavailable."

proot-distro login ubuntu \
  --bind "$ROOT:/workspace/orbis-foundation" \
  -- /usr/bin/env -i \
    HOME=/root \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    /bin/bash -lc '

set -Eeuo pipefail

PLATFORM="$(node -p "process.platform + \"/\" + process.arch")"

echo "Linux Node: $(node -v)"
echo "Linux pnpm: $(pnpm -v)"
echo "Platform:   $PLATFORM"

if [ "$PLATFORM" != "linux/arm64" ]; then
  echo "FAIL: Expected linux/arm64, got $PLATFORM"
  exit 40
fi

WORK="/tmp/orbis-prepush-$$"

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK"

cd /workspace/orbis-foundation

echo "Creating clean Git HEAD snapshot..."
git archive --format=tar HEAD | tar -xf - -C "$WORK"

cd "$WORK"

echo
echo "----- Linux dependency workspace -----"

pnpm install \
  --ignore-scripts \
  --no-frozen-lockfile \
  --reporter=append-only

echo
echo "----- KNIP 6.32.2 -----"

pnpm dlx knip@6.32.2 --no-progress

echo
echo "----- JSCPD 5.0.16 -----"

pnpm dlx jscpd@5.0.16 \
  ./src ./orbis-server --threshold 0

echo
echo "PASS: Knip + JSCPD"
' || fail "Linux Knip/JSCPD gate failed."

pass "Linux Knip + JSCPD"

echo
echo "=================================================="
echo "✅ ALL ORBIS PRE-PUSH GATES PASSED"
echo "✅ GIT PUSH IS NOW ALLOWED"
echo "=================================================="
echo "Report: $REPORT"
