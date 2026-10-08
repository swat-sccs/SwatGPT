#!/usr/bin/env bash
# Restore test: load one backup (default: $BACKUP_ROOT/latest) into throwaway MongoDB, Postgres
# and Qdrant containers that share nothing with the live stack, check that real data came back,
# and record the result as a node_exporter textfile metric.
#
#   ops/backup/verify.sh [BACKUP_DIR]
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

: "${VERIFY_MONGO_IMAGE:=mongo:8.0.20}"
: "${VERIFY_POSTGRES_IMAGE:=postgres:17-alpine}"
: "${VERIFY_QDRANT_IMAGE:=qdrant/qdrant:v1.15.1}"
: "${VERIFY_MONGO_DB:=LibreChat}"
: "${VERIFY_NAME_PREFIX:=swatgpt-backup-verify}"
: "${VERIFY_LOCK_WAIT:=3600}"
: "${VERIFY_READY_TIMEOUT:=120}"

PREFIX="$VERIFY_NAME_PREFIX-$$"
SCRATCH=""
STARTED_AT=0
VERIFIED_NAME=""
declare -a CONTAINERS=()

start_container() {
  local name=$1
  shift
  CONTAINERS+=("$name")
  docker run -d --name "$name" --label swatgpt.backup.verify=1 "$@" >/dev/null
}

wait_until() {
  local what=$1 deadline=$((SECONDS + VERIFY_READY_TIMEOUT))
  shift
  until "$@" >/dev/null 2>&1; do
    (( SECONDS < deadline )) || die "$what did not become ready within ${VERIFY_READY_TIMEOUT}s"
    sleep 2
  done
}

verify_mongo() {
  local dir=$1 c="$PREFIX-mongo" collections
  log "mongo: restoring into $VERIFY_MONGO_IMAGE"
  mkdir -p "$SCRATCH/mongo"
  start_container "$c" --network none -v "$SCRATCH/mongo:/data/db" "$VERIFY_MONGO_IMAGE"
  wait_until "throwaway mongod" docker exec "$c" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'
  docker exec -i "$c" mongorestore --archive --gzip --quiet --stopOnError <"$dir/mongo.archive.gz"
  collections=$(docker exec "$c" mongosh --quiet --eval "
    const d = db.getSiblingDB('$VERIFY_MONGO_DB');
    d.getCollectionNames().sort().map((n) => n + '=' + d.getCollection(n).estimatedDocumentCount()).join(' ')")
  [[ -n "$collections" ]] || die "mongo: database $VERIFY_MONGO_DB is missing or empty after restore"
  log "mongo: $VERIFY_MONGO_DB restored: $collections"
}

verify_postgres() {
  local dir=$1 c="$PREFIX-postgres" tables
  log "postgres: restoring into $VERIFY_POSTGRES_IMAGE"
  mkdir -p "$SCRATCH/postgres"
  start_container "$c" --network none -v "$SCRATCH/postgres:/var/lib/postgresql/data" \
    -e POSTGRES_USER=swatgpt -e POSTGRES_DB=swatgpt -e POSTGRES_PASSWORD=verify "$VERIFY_POSTGRES_IMAGE"
  wait_until "throwaway postgres" docker exec "$c" pg_isready -h 127.0.0.1 -U swatgpt -d swatgpt
  docker exec -i "$c" pg_restore -U swatgpt -d swatgpt --no-owner --exit-on-error <"$dir/postgres.dump"
  tables=$(docker exec "$c" psql -U swatgpt -d swatgpt -tAc \
    "select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')")
  (( tables > 0 )) || die "postgres: no tables after restore"
  log "postgres: $tables tables restored"
}

verify_qdrant() {
  local dir=$1 c="$PREFIX-qdrant" port url collection points
  collection=$(<"$dir/qdrant.collection")
  log "qdrant: restoring $collection into $VERIFY_QDRANT_IMAGE"
  mkdir -p "$SCRATCH/qdrant"
  start_container "$c" -p 127.0.0.1::6333 -v "$SCRATCH/qdrant:/qdrant/storage" "$VERIFY_QDRANT_IMAGE"
  port=$(docker port "$c" 6333/tcp | head -n 1 | sed 's/.*://')
  url="http://127.0.0.1:$port"
  wait_until "throwaway qdrant" curl -fsS "$url/readyz"
  QDRANT_API_KEY="" qcurl -X POST \
    "$url/collections/$collection/snapshots/upload?priority=snapshot&wait=true" \
    -F "snapshot=@$dir/qdrant.snapshot" >/dev/null
  points=$(QDRANT_API_KEY="" qcurl "$url/collections/$collection" | json_field 'd["result"]["points_count"]')
  (( points > 0 )) || die "qdrant: $collection has no points after restore"
  log "qdrant: $collection restored with $points points"
}

verify_files() {
  local dir=$1 entries
  entries=$(tar -tzf "$dir/files.tar.gz" | wc -l)
  log "files: archive lists $entries entries"
}

# remove_scratch DIR: restored data is owned by the containers' users, so empty DIR from inside a container.
remove_scratch() {
  docker run --rm --network none -v "$1:/scratch" --entrypoint sh "$VERIFY_MONGO_IMAGE" \
    -c 'rm -rf /scratch/* /scratch/.[!.]*' >/dev/null 2>&1 || true
  rm -rf -- "$1" || log "WARNING: could not remove $1"
}

# remove_stale_runs SCRATCH_ROOT: a SIGKILLed or OOM-killed run leaves its containers and scratch
# data behind; the lock guarantees none of them belongs to a live run.
remove_stale_runs() {
  local root=$1 dir
  docker ps -aq --filter label=swatgpt.backup.verify=1 --filter "name=$VERIFY_NAME_PREFIX-" | xargs -r docker rm -f -v >/dev/null
  while IFS= read -r -d '' dir; do
    log "removing stale restore-test scratch $dir"
    remove_scratch "$dir"
  done < <(find "$root" -mindepth 1 -maxdepth 1 -type d -name '.verify-*' -print0)
}

cleanup() {
  local name
  for name in "${CONTAINERS[@]}"; do
    docker rm -f -v "$name" >/dev/null 2>&1 || log "WARNING: could not remove container $name"
  done
  [[ -n "$SCRATCH" && -d "$SCRATCH" ]] || return 0
  remove_scratch "$SCRATCH"
}

on_exit() {
  local rc=$?
  set +e
  cleanup
  write_verify_metrics "$rc" || log "WARNING: could not write metrics to $TEXTFILE_DIR"
  if (( rc == 0 )); then
    log "restore test of ${VERIFIED_NAME:-backup} PASSED"
  else
    log "restore test of ${VERIFIED_NAME:-backup} FAILED (exit $rc)"
  fi
  exit "$rc"
}

write_verify_metrics() {
  local rc=$1 now previous=0 prom="$TEXTFILE_DIR/swatgpt_backup_verify.prom" backup_epoch=0
  [[ -n "$TEXTFILE_DIR" ]] || return 0
  now=$(date +%s)
  if [[ -f "$prom" ]]; then
    previous=$(awk '$1 == "swatgpt_backup_last_verify_success_timestamp" { print $2 }' "$prom")
    previous=${previous:-0}
  fi
  (( rc == 0 )) && previous=$now
  [[ -n "$VERIFIED_NAME" ]] && backup_epoch=$(manifest_value "$BACKUP_ROOT/$VERIFIED_NAME" completed_epoch)
  write_textfile swatgpt_backup_verify.prom <<EOF
# HELP swatgpt_backup_last_verify_success_timestamp Unix time of the last passing restore test.
# TYPE swatgpt_backup_last_verify_success_timestamp gauge
swatgpt_backup_last_verify_success_timestamp $previous
# HELP swatgpt_backup_last_verify_run_success 1 if the last restore test passed, 0 if it failed.
# TYPE swatgpt_backup_last_verify_run_success gauge
swatgpt_backup_last_verify_run_success $(( rc == 0 ? 1 : 0 ))
# HELP swatgpt_backup_last_verify_backup_timestamp completed_epoch of the backup the last restore test used.
# TYPE swatgpt_backup_last_verify_backup_timestamp gauge
swatgpt_backup_last_verify_backup_timestamp ${backup_epoch:-0}
# HELP swatgpt_backup_last_verify_duration_seconds Wall time of the last restore test.
# TYPE swatgpt_backup_last_verify_duration_seconds gauge
swatgpt_backup_last_verify_duration_seconds $(( now - STARTED_AT ))
EOF
}

main() {
  STARTED_AT=$(date +%s)
  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  require_cmds docker curl python3 flock sha256sum tar
  [[ -d "$BACKUP_ROOT" ]] || die "$BACKUP_ROOT does not exist"
  take_lock "$VERIFY_LOCK_WAIT"

  local dir component
  dir=$(readlink -f -- "${1:-$BACKUP_ROOT/latest}")
  [[ -f "$dir/MANIFEST" ]] || die "$dir is not a complete backup (no MANIFEST)"
  [[ "$(dirname -- "$dir")" == "$(readlink -f -- "$BACKUP_ROOT")" ]] && VERIFIED_NAME=$(basename -- "$dir")
  log "verifying $dir"
  (cd "$dir" && sha256sum --quiet -c SHA256SUMS) || die "checksum mismatch in $dir"

  remove_stale_runs "${VERIFY_SCRATCH:-$BACKUP_ROOT}"
  SCRATCH=$(mktemp -d "${VERIFY_SCRATCH:-$BACKUP_ROOT}/.verify-XXXXXX")
  for component in $(manifest_value "$dir" components); do
    case "$component" in
      mongo) verify_mongo "$dir" ;;
      postgres) verify_postgres "$dir" ;;
      qdrant) verify_qdrant "$dir" ;;
      files) verify_files "$dir" ;;
      *) die "unknown component '$component' in $dir/MANIFEST" ;;
    esac
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
