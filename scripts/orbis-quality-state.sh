#!/usr/bin/env bash
# ORBIS quality state helpers.
# IMPORTANT: state data files are NEVER sourced or eval'd.

orbis_state_get() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1

  awk -v wanted="$key" '
    index($0, wanted "=") == 1 {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$file"
}

orbis_state_safe_stage() {
  case "$1" in
    preflight|secrets|architecture|accounting|circular|lint|type|audit|coverage|build|mutation|db-drift|jscpd|knip|playwright-smoke|playwright-visual)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

orbis_state_safe_pipeline() {
  case "$1" in
    TERMUX|UBUNTU) return 0 ;;
    *) return 1 ;;
  esac
}

orbis_state_write_failure() {
  local file="$1"
  local pipeline="$2"
  local stage="$3"
  local fingerprint="${4:-}"

  orbis_state_safe_pipeline "$pipeline" || {
    echo "ORBIS STATE ERROR: invalid pipeline: $pipeline" >&2
    return 2
  }
  orbis_state_safe_stage "$stage" || {
    echo "ORBIS STATE ERROR: invalid stage: $stage" >&2
    return 2
  }

  [[ -n "$fingerprint" ]] || fingerprint="$(node scripts/orbis-quality-fingerprint.cjs)" || {
    echo "ORBIS STATE ERROR: unable to calculate failure fingerprint." >&2
    return 2
  }

  mkdir -p "$(dirname "$file")"
  local tmp="${file}.tmp.$$"

  {
    echo "STATE_VERSION=1"
    printf 'PIPELINE=%s\n' "$pipeline"
    printf 'STAGE=%s\n' "$stage"
    printf 'TIMESTAMP=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    printf 'FINGERPRINT=%s\n' "$fingerprint"
    printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
  } > "$tmp"

  mv "$tmp" "$file"
}

orbis_state_read_failure() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  local version pipeline stage saved_fp expected_fp
  version="$(orbis_state_get "$file" STATE_VERSION || true)"
  pipeline="$(orbis_state_get "$file" PIPELINE || true)"
  stage="$(orbis_state_get "$file" STAGE || true)"
  saved_fp="$(orbis_state_get "$file" FINGERPRINT || true)"
  expected_fp="${2:-}"

  [[ "$version" == "1" ]] || {
    echo "ORBIS STATE ERROR: unsupported or missing state version." >&2
    return 3
  }

  if [[ -n "$expected_fp" ]]; then
    [[ -n "$saved_fp" ]] || {
      echo "ORBIS STATE ERROR: legacy/stale failure state has no fingerprint." >&2
      return 4
    }
    [[ "$saved_fp" == "$expected_fp" ]] || {
      echo "ORBIS STATE ERROR: failure state fingerprint is stale." >&2
      return 4
    }
  fi
  orbis_state_safe_pipeline "$pipeline" || {
    echo "ORBIS STATE ERROR: invalid pipeline value." >&2
    return 3
  }
  orbis_state_safe_stage "$stage" || {
    echo "ORBIS STATE ERROR: invalid stage value." >&2
    return 3
  }

  printf '%s\t%s\n' "$pipeline" "$stage"
}

orbis_state_write_pass() {
  local file="$1"
  local pipeline="$2"
  local fingerprint="$3"
  local report="${4:-}"

  mkdir -p "$(dirname "$file")"
  local tmp="${file}.tmp.$$"

  {
    echo "STATE_VERSION=1"
    printf 'PIPELINE=%s\n' "$pipeline"
    printf 'TIMESTAMP=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    printf 'FINGERPRINT=%s\n' "$fingerprint"
    printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
    [[ -n "$report" ]] && printf 'REPORT=%s\n' "$report"
  } > "$tmp"

  mv "$tmp" "$file"
}
