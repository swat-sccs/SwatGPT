# shellcheck shell=bash
# Shared helpers for backup.sh and verify.sh. Source it; do not execute it.

: "${COMPOSE_DIR:=/srv/SwatGPT}"
: "${BACKUP_ROOT:=/srv/backup/swatgpt}"
: "${TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector}"
: "${QDRANT_URL:=http://127.0.0.1:6333}"
: "${QDRANT_API_KEY:=}"

readonly BACKUP_NAME_GLOB='[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z'

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmds() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
  done
}

compose() {
  docker compose --project-directory "$COMPOSE_DIR" "$@"
}

qcurl() {
  local -a auth=()
  [[ -n "$QDRANT_API_KEY" ]] && auth=(-H "api-key: $QDRANT_API_KEY")
  curl -fsS --retry 2 --max-time "${QDRANT_TIMEOUT:-900}" "${auth[@]}" "$@"
}

# json_field EXPR [ARG...]: read JSON on stdin and print EXPR, a Python expression over the
# parsed document `d` and the extra arguments `args`. Fails if a key or match is missing.
json_field() {
  python3 -c 'import json, sys; d = json.load(sys.stdin); args = sys.argv[2:]; print(eval(sys.argv[1]))' "$@"
}

take_lock() {
  local wait_seconds=$1
  exec 9>"$BACKUP_ROOT/.lock"
  if [[ "$wait_seconds" == 0 ]]; then
    flock -n 9 || die "another backup or verify run holds $BACKUP_ROOT/.lock"
    return
  fi
  flock -w "$wait_seconds" 9 || die "timed out after ${wait_seconds}s waiting for $BACKUP_ROOT/.lock"
}

# list_backups ROOT: completed backup directory names, newest first.
list_backups() {
  find "$1" -mindepth 1 -maxdepth 1 -type d -name "$BACKUP_NAME_GLOB" -printf '%f\n' | LC_ALL=C sort -r
}

# manifest_value DIR KEY
manifest_value() {
  awk -F= -v key="$2" '$1 == key { print substr($0, length(key) + 2); exit }' "$1/MANIFEST" 2>/dev/null || true
}

# write_textfile NAME: write stdin to $TEXTFILE_DIR/NAME atomically (node_exporter must never read a partial file).
write_textfile() {
  local name=$1 tmp
  [[ -n "$TEXTFILE_DIR" ]] || { cat >/dev/null; return 0; }
  (umask 022 && mkdir -p "$TEXTFILE_DIR")
  tmp=$(mktemp "$TEXTFILE_DIR/.$name.XXXXXX")
  cat >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$TEXTFILE_DIR/$name"
}
