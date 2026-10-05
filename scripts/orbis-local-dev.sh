#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_FILE="$HOME/.config/orbis/local-auth.env"

if [[ ! -r "$AUTH_FILE" ]]; then
  echo "STOP: local-auth.env পাওয়া যায়নি"
  exit 1
fi

set -a
source "$AUTH_FILE"
set +a

for key in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_ADMIN_EMAIL; do
  if [[ -z "${!key:-}" ]]; then
    echo "STOP: $key অনুপস্থিত"
    exit 1
  fi
done

if [[ "$VITE_ADMIN_EMAIL" != "orbisaideveloper@gmail.com" ]]; then
  echo "STOP: Foundation Admin email মিলছে না"
  exit 1
fi

echo "Foundation local login configuration: LOADED"
echo "Open: http://localhost:3000"
cd "$ROOT"
exec npm run dev -- --host 0.0.0.0 --port 3000 --strictPort
