#!/usr/bin/env bash
set -Eeuo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_FILE="$HOME/.config/orbis/local-auth.env"
if [[ ! -r "$AUTH_FILE" ]]; then
  echo "STOP: local-auth.env unavailable"
  exit 1
fi
set -a
source "$AUTH_FILE"
set +a
export PORT=3001
cd "$ROOT"
echo "Foundation backend: http://localhost:3001"
exec npm start
