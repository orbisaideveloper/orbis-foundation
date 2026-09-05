#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo "ORBIS: not inside a Git repository." >&2; exit 2; }
cd "$ROOT"

echo "ORBIS: test-all.sh is now the full serial fail-fast quality runner."
echo "Use 'orbis resume' after a reported failure to continue from that stage."
exec bash scripts/orbis-quality-all.sh "$@"
