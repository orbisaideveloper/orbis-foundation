#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

REPORT_DIR="$HOME/storage/downloads"
[[ -d "$REPORT_DIR" ]] || REPORT_DIR="$HOME"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/ORBIS-UBUNTU-QUALITY-SETUP-REPORT-$STAMP.txt"

exec > >(tee "$REPORT") 2>&1

status="FAIL"
finish() {
  local rc=$?
  [[ $rc -eq 0 ]] && status="PASS"
  echo
  echo "============================================================"
  echo "FINAL STATUS: $status"
  echo "REPORT: $REPORT"
  echo "============================================================"
  if command -v termux-media-scan >/dev/null 2>&1; then
    timeout 5s termux-media-scan "$REPORT" >/dev/null 2>&1 || true
  fi
  trap - EXIT
  exit "$rc"
}
trap finish EXIT

command -v proot-distro >/dev/null 2>&1 || {
  echo "PREFLIGHT FAIL: proot-distro is unavailable."
  exit 20
}

proot-distro login ubuntu \
  --bind "$ROOT:/orbis-source" \
  -- bash -lc '
set -Eeuo pipefail

TOOLS="/root/.orbis-quality-tools"
RUNTIME="/root/.orbis-quality-runtime"
BUILD="/root/.orbis-quality-runtime-build"
FINGERPRINT_FILE="$RUNTIME/dependency-fingerprint"

echo "Ubuntu: $(grep "^VERSION=" /etc/os-release)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"

mkdir -p "$TOOLS"
cat > "$TOOLS/package.json" <<'"'"'JSON'"'"'
{
  "private": true,
  "dependencies": {
    "jscpd": "5.0.16",
    "knip": "6.32.2"
  }
}
JSON

cd "$TOOLS"
npm install --ignore-scripts --no-audit --no-fund

echo "JSCPD: $("$TOOLS/node_modules/.bin/jscpd" --version)"
echo "Knip: $("$TOOLS/node_modules/.bin/knip" --version)"

mkdir -p "$RUNTIME"

SOURCE_FP="$(cat /orbis-source/package.json /orbis-source/package-lock.json | sha256sum | cut -d " " -f1)"
RUNTIME_FP=""
[[ -f "$FINGERPRINT_FILE" ]] && RUNTIME_FP="$(cat "$FINGERPRINT_FILE")"

if [[ "$SOURCE_FP" == "$RUNTIME_FP" ]] \
  && [[ -d "$BUILD/node_modules" ]] \
  && [[ -x "$BUILD/node_modules/.bin/playwright" ]]; then
  echo "Persistent Ubuntu project runtime: REUSED (dependency fingerprint match)"
else
  echo "Preparing persistent Ubuntu project runtime..."
  rm -rf "$BUILD"
  mkdir -p "$BUILD"
  tar -C /orbis-source \
    --exclude=.git \
    --exclude=node_modules \
    --exclude=.orbis-backup \
    --exclude=.stryker-tmp \
    --exclude=test-results \
    --exclude=playwright-report \
    -cf - . | tar -C "$BUILD" -xf -

  cd "$BUILD"
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
fi

CANDIDATE="$BUILD/node_modules"

ensure_rollup_native() {
  local modules="$1"
  local rollup_package="$modules/rollup/package.json"
  local native_dir="$modules/@rollup/rollup-linux-arm64-gnu"

  [[ -f "$rollup_package" ]] || {
    echo "RUNTIME FAIL: Rollup package is missing from the persistent Ubuntu runtime."
    return 40
  }

  local rollup_version
  rollup_version="$(node -p "require(\"$rollup_package\").version")"

  if [[ -f "$native_dir/package.json" ]]; then
    local native_version
    native_version="$(node -p "require(\"$native_dir/package.json\").version")"
    if [[ "$native_version" == "$rollup_version" ]]; then
      echo "Rollup Linux ARM64 native package: READY ($native_version)"
      return 0
    fi
    echo "Rollup Linux ARM64 native package version mismatch: $native_version != $rollup_version"
  else
    echo "Rollup Linux ARM64 native package missing; repairing exact version $rollup_version..."
  fi

  local pack_dir archive staged
  pack_dir="$(mktemp -d)"
  staged="$modules/@rollup/.rollup-linux-arm64-gnu.orbis-new"
  mkdir -p "$modules/@rollup"

  (
    cd "$pack_dir"
    archive="$(npm pack "@rollup/rollup-linux-arm64-gnu@$rollup_version" --silent)"
    tar -xzf "$archive"
    rm -rf "$staged"
    mv package "$staged"
  )

  rm -rf "$native_dir"
  mv "$staged" "$native_dir"
  rm -rf "$pack_dir"

  local installed
  installed="$(node -p "require(\"$native_dir/package.json\").version")"
  [[ "$installed" == "$rollup_version" ]] || {
    echo "RUNTIME FAIL: Rollup native repair verification failed."
    return 41
  }

  echo "Rollup Linux ARM64 native package: REPAIRED ($installed)"
}

ensure_rollup_native "$CANDIDATE"

rm -rf "$RUNTIME/node_modules"
ln -s "$CANDIDATE" "$RUNTIME/node_modules"
printf "%s\n" "$SOURCE_FP" > "$FINGERPRINT_FILE"

PLAYWRIGHT="$RUNTIME/node_modules/.bin/playwright"
echo "Playwright: $("$PLAYWRIGHT" --version)"
echo "Runtime dependency fingerprint: $SOURCE_FP"

echo
echo "Verifying Vite/Vitest/Rollup runtime..."
cd "$RUNTIME"
node -e "import(\"vitest/config\").then(() => console.log(\"vitest/config import: PASS\"))"

unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
"$PLAYWRIGHT" install --with-deps chromium

cd /orbis-source
node --input-type=module <<'"'"'NODE'"'"'
import { chromium } from "/root/.orbis-quality-runtime/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true });
await browser.close();
console.log("Chromium launch: PASS");
NODE

echo "Ubuntu quality runtime: READY"
'
