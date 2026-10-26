#!/usr/bin/env bash
# Nightly logical backup of the SwatGPT stack on eagle: MongoDB (mongodump), the swatgpt
# Postgres (pg_dump -Fc), a Qdrant snapshot of the collection behind the `kb` alias, and the
# LibreChat file volumes. See ops/backup/README.md for configuration, restore and alerting.
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

: "${BACKUP_COMPONENTS:=mongo postgres qdrant files}"
: "${KEEP_DAILY:=14}"
: "${KEEP_WEEKLY:=8}"
: "${BACKUP_MIN_FREE_MB:=2048}"
: "${BACKUP_ALLOW_ROOTFS:=0}"
: "${QDRANT_ALIAS:=kb}"
: "${MONGO_SERVICE:=mongodb}"
: "${POSTGRES_SERVICE:=swatgpt-postgres}"
: "${FILES_SERVICE:=api}"
: "${FILES_PATHS:=uploads client/public/images data}"

WORK_DIR=""
QDRANT_SNAPSHOT=""
QDRANT_COLLECTION=""
STARTED_AT=0

check_target() {
  [[ "$KEEP_DAILY" =~ ^[1-9][0-9]*$ ]] || die "KEEP_DAILY must be a positive integer (got '$KEEP_DAILY')"
  [[ "$KEEP_WEEKLY" =~ ^[0-9]+$ ]] || die "KEEP_WEEKLY must be a non-negative integer (got '$KEEP_WEEKLY')"
  mkdir -p "$BACKUP_ROOT"

  local mount_point avail_mb
  mount_point=$(findmnt -n -o TARGET --target "$BACKUP_ROOT")
  if [[ "$mount_point" == "/" && "$BACKUP_ALLOW_ROOTFS" != 1 ]]; then
    die "$BACKUP_ROOT is on the root filesystem; mount the dedicated backup disk there (or set BACKUP_ALLOW_ROOTFS=1)"
  fi

  avail_mb=$(df --output=avail -B1M "$BACKUP_ROOT" | tail -n 1 | tr -d ' ')
  if (( avail_mb < BACKUP_MIN_FREE_MB )); then
    die "only ${avail_mb} MiB free on $mount_point, need at least ${BACKUP_MIN_FREE_MB} MiB"
  fi
}

remove_stale_work_dirs() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.tmp-*' -exec rm -rf -- {} +
}

require_nonempty() {
  [[ -s "$1" ]] || die "$1 is empty"
}

dump_mongo() {
  local out="$1/mongo.archive.gz"
  log "mongo: mongodump --archive --gzip from service $MONGO_SERVICE"
  compose exec -T "$MONGO_SERVICE" mongodump --archive --gzip --quiet >"$out"
  require_nonempty "$out"
}

dump_postgres() {
  local out="$1/postgres.dump"
  log "postgres: pg_dump -Fc from service $POSTGRES_SERVICE"
  # shellcheck disable=SC2016
  compose exec -T "$POSTGRES_SERVICE" sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' >"$out"
  require_nonempty "$out"
  compose exec -T "$POSTGRES_SERVICE" pg_restore --list <"$out" >/dev/null
}

resolve_qdrant_alias() {
  qcurl "$QDRANT_URL/aliases" | json_field \
    'next(a["collection_name"] for a in d["result"]["aliases"] if a["alias_name"] == args[0])' "$QDRANT_ALIAS"
}

delete_qdrant_snapshot() {
  [[ -n "$QDRANT_SNAPSHOT" ]] || return 0
  qcurl -X DELETE "$QDRANT_URL/collections/$QDRANT_COLLECTION/snapshots/$QDRANT_SNAPSHOT?wait=true" >/dev/null ||
    log "WARNING: could not delete server-side snapshot $QDRANT_COLLECTION/$QDRANT_SNAPSHOT"
  QDRANT_SNAPSHOT=""
}

dump_qdrant() {
  local dir=$1
  QDRANT_COLLECTION=$(resolve_qdrant_alias) || die "qdrant: alias '$QDRANT_ALIAS' not found at $QDRANT_URL"
  log "qdrant: snapshot of $QDRANT_COLLECTION (alias $QDRANT_ALIAS)"
  local created checksum
  created=$(qcurl --retry 0 -X POST "$QDRANT_URL/collections/$QDRANT_COLLECTION/snapshots?wait=true")
  QDRANT_SNAPSHOT=$(json_field 'd["result"]["name"]' <<<"$created")
  checksum=$(json_field 'd["result"].get("checksum") or ""' <<<"$created")
  qcurl -o "$dir/qdrant.snapshot" "$QDRANT_URL/collections/$QDRANT_COLLECTION/snapshots/$QDRANT_SNAPSHOT"
  require_nonempty "$dir/qdrant.snapshot"
  if [[ -n "$checksum" ]]; then
    [[ "$(sha256sum <"$dir/qdrant.snapshot" | cut -d' ' -f1)" == "$checksum" ]] ||
      die "qdrant: downloaded snapshot does not match the server checksum"
  fi
  delete_qdrant_snapshot
  printf '%s\n' "$QDRANT_COLLECTION" >"$dir/qdrant.collection"
}

dump_files() {
  local out="$1/files.tar.gz"
  local -a paths
  read -r -a paths <<<"$FILES_PATHS"
  log "files: tar of /app/{${FILES_PATHS// /,}} from service $FILES_SERVICE"
  compose exec -T "$FILES_SERVICE" tar -C /app -czf - "${paths[@]}" >"$out"
  gzip -t "$out"
}

write_manifest() {
  local dir=$1 name=$2 file
  {
    printf 'name=%s\n' "$name"
    printf 'host=%s\n' "$(hostname -f 2>/dev/null || hostname)"
    printf 'components=%s\n' "$BACKUP_COMPONENTS"
    printf 'started_epoch=%s\n' "$STARTED_AT"
    printf 'completed_epoch=%s\n' "$(date +%s)"
    [[ -n "$QDRANT_COLLECTION" ]] && printf 'qdrant_collection=%s\nqdrant_alias=%s\n' "$QDRANT_COLLECTION" "$QDRANT_ALIAS"
    [[ " $BACKUP_COMPONENTS " == *" files "* ]] && printf 'files.paths=%s\n' "$FILES_PATHS"
    for file in "$dir"/*; do
      printf 'size.%s=%s\n' "$(basename "$file")" "$(stat -c %s "$file")"
    done
  } >"$dir/.MANIFEST"
  mv -- "$dir/.MANIFEST" "$dir/MANIFEST"
  (cd "$dir" && sha256sum -- * >SHA256SUMS)
}

publish() {
  local name=$1 final="$BACKUP_ROOT/$1"
  [[ ! -e "$final" ]] || die "$final already exists"
  sync -- "$WORK_DIR"/*
  mv -T -- "$WORK_DIR" "$final"
  WORK_DIR=""
  ln -sfn -- "$name" "$BACKUP_ROOT/.latest.tmp"
  mv -T -- "$BACKUP_ROOT/.latest.tmp" "$BACKUP_ROOT/latest"
  sync -f -- "$BACKUP_ROOT"
  log "published $final"
}

# prune_backups ROOT KEEP_DAILY KEEP_WEEKLY: keep the newest backup of each of the newest
# KEEP_DAILY UTC days and of each of the newest KEEP_WEEKLY ISO weeks; delete the rest.
prune_backups() {
  local root=$1 keep_daily=$2 keep_weekly=$3 name day week
  local -a names
  local -A keep=() days=() weeks=()
  mapfile -t names < <(list_backups "$root")
  for name in "${names[@]}"; do
    day=${name:0:10}
    week=$(date -u -d "$day" +%G-W%V)
    if [[ -z "${days[$day]+x}" ]] && (( ${#days[@]} < keep_daily )); then
      days[$day]=1
      keep[$name]=1
    fi
    if [[ -z "${weeks[$week]+x}" ]] && (( ${#weeks[@]} < keep_weekly )); then
      weeks[$week]=1
      keep[$name]=1
    fi
  done
  for name in "${names[@]}"; do
    [[ -n "${keep[$name]+x}" ]] && continue
    log "retention: removing $name"
    rm -rf -- "${root:?}/$name"
  done
}

metrics_body() {
  local rc=$1 now latest_dir last_success=0 component size count
  now=$(date +%s)
  latest_dir=$(list_backups "$BACKUP_ROOT" 2>/dev/null | head -n 1 || true)
  count=$(list_backups "$BACKUP_ROOT" 2>/dev/null | wc -l || echo 0)
  if [[ -n "$latest_dir" ]]; then
    last_success=$(manifest_value "$BACKUP_ROOT/$latest_dir" completed_epoch)
    last_success=${last_success:-0}
  fi
  cat <<EOF
# HELP swatgpt_backup_last_success_timestamp Unix time the newest complete SwatGPT backup finished.
# TYPE swatgpt_backup_last_success_timestamp gauge
swatgpt_backup_last_success_timestamp $last_success
# HELP swatgpt_backup_last_run_timestamp Unix time the last backup run ended, successful or not.
# TYPE swatgpt_backup_last_run_timestamp gauge
swatgpt_backup_last_run_timestamp $now
# HELP swatgpt_backup_last_run_success 1 if the last backup run succeeded, 0 if it failed.
# TYPE swatgpt_backup_last_run_success gauge
swatgpt_backup_last_run_success $(( rc == 0 ? 1 : 0 ))
# HELP swatgpt_backup_last_run_duration_seconds Wall time of the last backup run.
# TYPE swatgpt_backup_last_run_duration_seconds gauge
swatgpt_backup_last_run_duration_seconds $(( now - STARTED_AT ))
# HELP swatgpt_backup_retained_count Complete backups currently kept under the backup root.
# TYPE swatgpt_backup_retained_count gauge
swatgpt_backup_retained_count $count
EOF
  [[ -n "$latest_dir" ]] || return 0
  echo '# HELP swatgpt_backup_size_bytes Size of each artifact in the newest complete backup.'
  echo '# TYPE swatgpt_backup_size_bytes gauge'
  for component in mongo.archive.gz postgres.dump qdrant.snapshot files.tar.gz; do
    size=$(manifest_value "$BACKUP_ROOT/$latest_dir" "size.$component")
    [[ -n "$size" ]] && printf 'swatgpt_backup_size_bytes{file="%s"} %s\n' "$component" "$size"
  done
  return 0
}

on_exit() {
  local rc=$?
  set +e
  delete_qdrant_snapshot
  [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
  metrics_body "$rc" | write_textfile swatgpt_backup.prom || log "WARNING: could not write metrics to $TEXTFILE_DIR"
  (( rc == 0 )) || log "backup FAILED (exit $rc); previous backups were left untouched"
  exit "$rc"
}

main() {
  STARTED_AT=$(date +%s)
  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  require_cmds docker curl python3 flock findmnt sha256sum gzip
  check_target
  take_lock 0
  remove_stale_work_dirs

  local name component
  name=$(date -u +%Y-%m-%dT%H%M%SZ)
  WORK_DIR=$(mktemp -d "$BACKUP_ROOT/.tmp-$name.XXXXXX")
  log "backup $name -> $BACKUP_ROOT (components: $BACKUP_COMPONENTS)"

  for component in $BACKUP_COMPONENTS; do
    case "$component" in
      mongo) dump_mongo "$WORK_DIR" ;;
      postgres) dump_postgres "$WORK_DIR" ;;
      qdrant) dump_qdrant "$WORK_DIR" ;;
      files) dump_files "$WORK_DIR" ;;
      *) die "unknown component '$component' in BACKUP_COMPONENTS" ;;
    esac
  done

  write_manifest "$WORK_DIR" "$name"
  publish "$name"
  prune_backups "$BACKUP_ROOT" "$KEEP_DAILY" "$KEEP_WEEKLY"
  log "backup $name complete"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
