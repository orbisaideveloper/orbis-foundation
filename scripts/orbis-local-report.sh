#!/usr/bin/env bash
# Foreground streaming, one final report, preserve the invoked command status.
set -uo pipefail
umask 077
if [[ $# -lt 2 ]]; then
  echo 'Usage: bash scripts/orbis-local-report.sh LABEL COMMAND [ARGS...]'
  exit 2
fi
label="$1"; shift
[[ "$label" =~ ^[A-Za-z0-9_-]+$ ]] || { echo 'Invalid report label'; exit 2; }
repo="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo" || exit 2
report_dir="$HOME/storage/downloads"
[[ -d "$report_dir" ]] || { echo 'Downloads unavailable'; exit 2; }
config_dir="$HOME/.config/orbis"
mkdir -p "$config_dir" || exit 2
[[ ! -L "$config_dir" ]] || exit 2
lock="$config_dir/$(basename "$repo")-local-check.lock"
[[ ! -L "$lock" ]] || exit 2
exec 9>"$lock"
flock -n 9 || { echo 'A local check for this repository is already running'; exit 2; }
report="$report_dir/ORBIS-$(basename "$repo")-$label-$(date +%Y%m%d-%H%M%S)-$$.txt"
working="${report}.running"
{
  printf 'START: %s\nREPOSITORY: %s\nHEAD: %s\n' "$(date -Iseconds)" "$(basename "$repo")" "$(git rev-parse HEAD)"
  echo 'RUNNING: output is streamed below; final report follows completion.'
  "$@"
  rc=$?
  printf '\nCOMPLETE\nFINAL_EXIT: %s\n' "$rc"
  exit "$rc"
} 2>&1 | tee "$working"
results=("${PIPESTATUS[@]}")
rc="${results[0]}"
if [[ "${results[1]}" -ne 0 ]]; then echo 'Report write failed'; exit 1; fi
mv "$working" "$report" || exit 1
printf '\nREPORT: %s\nEXIT: %s\n' "$report" "$rc"
exit "$rc"
