#!/usr/bin/env bash
# Runs KNIP and JSCPD in an Ubuntu-only dependency tree.
# Run this script from Termux after placing it in orbis-foundation/scripts/.

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$HOME/storage/downloads"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/orbis-linux-quality-$STAMP.txt"

if ! command -v proot-distro >/dev/null 2>&1; then
  echo "ERROR: proot-distro is not installed in Termux." >&2
  exit 1
fi

if [ ! -f "$SOURCE_DIR/package.json" ] || [ ! -f "$SOURCE_DIR/package-lock.json" ]; then
  echo "ERROR: Run this only from <project>/scripts/orbis-linux-quality-gateway.sh." >&2
  exit 1
fi

mkdir -p "$REPORT_DIR"
echo "Creating Ubuntu-only quality report..."

set +e
proot-distro login ubuntu --shared-tmp -- env ORBIS_SOURCE_DIR="$SOURCE_DIR" bash -lc '
  set -euo pipefail

  SOURCE_DIR="${ORBIS_SOURCE_DIR:?Missing Termux source directory}"
  TARGET_DIR="/root/.orbis-foundation-linux-quality"
  MARKER_FILE=".orbis-linux-quality-copy"
  LOCK_FILE=".orbis-linux-lock.sha256"
  NEXT_DIR="$(mktemp -d /root/.orbis-foundation-linux-quality-next.XXXXXX)"
  BACKUP_DIR=""

  cleanup() {
    [ -d "$NEXT_DIR" ] && rm -rf "$NEXT_DIR"
    [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ] && rm -rf "$BACKUP_DIR"
  }
  trap cleanup EXIT

  echo "=== ORBIS LINUX-ONLY QUALITY GATEWAY ==="
  echo "DATE: $(date)"
  echo "Ubuntu: $(. /etc/os-release && printf "%s %s" "$NAME" "$VERSION_ID")"
  echo "ARCH: $(uname -m)"
  echo "Node: $(node -v)"
  echo "npm: $(npm -v)"
  echo "Source: $SOURCE_DIR"

  [ -f "$SOURCE_DIR/package-lock.json" ] || { echo "ERROR: package-lock.json is missing."; exit 1; }
  if [ -d "$TARGET_DIR" ] && [ ! -f "$TARGET_DIR/$MARKER_FILE" ]; then
    echo "ERROR: Refusing to alter $TARGET_DIR because it is not this gateway-owned test copy."
    exit 1
  fi

  NEW_LOCK_HASH="$(sha256sum "$SOURCE_DIR/package-lock.json" | awk "{print \$1}")"
  OLD_LOCK_HASH=""
  if [ -f "$TARGET_DIR/$LOCK_FILE" ]; then
    OLD_LOCK_HASH="$(cat "$TARGET_DIR/$LOCK_FILE")"
  fi

  echo "Syncing source into a separate Ubuntu copy..."
  tar -C "$SOURCE_DIR" \
    --exclude=.git --exclude=node_modules --exclude=dist --exclude=coverage \
    -cf - . | tar -C "$NEXT_DIR" -xf -

  if [ "$NEW_LOCK_HASH" = "$OLD_LOCK_HASH" ] && [ -d "$TARGET_DIR/node_modules" ]; then
    echo "Linux dependencies: reusing existing verified Linux node_modules."
    mv "$TARGET_DIR/node_modules" "$NEXT_DIR/node_modules"
  else
    echo "Linux dependencies: package lock changed or first run; running npm ci."
    (
      cd "$NEXT_DIR"
      npm ci --ignore-scripts --no-audit --no-fund
    )
  fi

  printf "%s\n" "ORIGINAL-SOURCE-IS-TERMUX; DO-NOT-EDIT-HERE" > "$NEXT_DIR/$MARKER_FILE"
  printf "%s\n" "$NEW_LOCK_HASH" > "$NEXT_DIR/$LOCK_FILE"

  if [ -d "$TARGET_DIR" ]; then
    BACKUP_DIR="${TARGET_DIR}.previous.$$"
    mv "$TARGET_DIR" "$BACKUP_DIR"
  fi
  mv "$NEXT_DIR" "$TARGET_DIR"
  NEXT_DIR=""
  if [ -n "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR"
    BACKUP_DIR=""
  fi

  cd "$TARGET_DIR"
  echo
  echo "=== KNIP ==="
  npm run check:deadcode:ci
  echo
  echo "=== JSCPD ==="
  npm run check:duplicates:ci
  echo
  echo "RESULT: PASS"
'
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "PASS: $REPORT"
else
  echo "FAILED (report saved): $REPORT" >&2
fi

exit "$STATUS"
