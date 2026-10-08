#!/usr/bin/env bash
# End-to-end tests for ops/backup: brings up a throwaway compose project with the same service
# names as eagle (mongodb, swatgpt-postgres, qdrant, api), seeds it, and exercises backup.sh,
# retention, failure handling, metrics, verify.sh and the README restore commands.
#
#   ops/backup/test/run.sh            # needs docker + compose, curl, python3, flock
#
# Never point this at the real stack: it runs `docker compose down -v` on its own project.
set -euo pipefail

TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKUP_DIR=$(dirname -- "$TEST_DIR")
PROJECT=${TEST_PROJECT:-swatgpt-fix-backups-it}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/swatgpt-backup-test.XXXXXX")
FAILURES=0
PASSES=0

export COMPOSE_DIR="$TEST_DIR"
export COMPOSE_PROJECT_NAME="$PROJECT"
export BACKUP_ROOT="$TMP/root"
export TEXTFILE_DIR="$TMP/textfile"
export BACKUP_ALLOW_ROOTFS=1
export BACKUP_MIN_FREE_MB=1
export VERIFY_NAME_PREFIX="swatgpt-fix-backups-verify"
export VERIFY_POSTGRES_IMAGE="${TEST_POSTGRES_IMAGE:-postgres:16}"
export VERIFY_LOCK_WAIT=5
export VERIFY_READY_TIMEOUT="${TEST_READY_TIMEOUT:-300}"

dc() {
  docker compose --project-directory "$TEST_DIR" -p "$PROJECT" "$@"
}

pass() {
  PASSES=$((PASSES + 1))
  printf 'ok   %s\n' "$1"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'FAIL %s\n' "$1"
}

check() {
  local label=$1
  shift
  if "$@"; then pass "$label"; else fail "$label"; fi
}

metric() {
  awk -v m="$2" '$1 == m { print $2 }' "$TEXTFILE_DIR/$1"
}

count_backups() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | wc -l
}

no_work_dirs() {
  [[ -z "$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -name '.tmp-*' -print -quit)" ]]
}

qdrant_url() {
  printf 'http://%s' "$(dc port qdrant 6333 | head -n 1)"
}

server_snapshot_count() {
  curl -fsS "$(qdrant_url)/collections/kb_1/snapshots" | python3 -c 'import json, sys; print(len(json.load(sys.stdin)["result"]))'
}

mongo_eval() {
  dc exec -T mongodb mongosh --quiet --eval "$1"
}

pg_sql() {
  dc exec -T swatgpt-postgres psql -U swatgpt -d swatgpt -tAc "$1"
}

wait_for() {
  local deadline=$((SECONDS + ${TEST_READY_TIMEOUT:-300}))
  until "$@" >/dev/null 2>&1; do
    (( SECONDS < deadline )) || { echo "timed out waiting for: $*" >&2; return 1; }
    sleep 1
  done
}

cleanup() {
  set +e
  dc down -v --remove-orphans >/dev/null 2>&1
  docker ps -aq --filter label=swatgpt.backup.verify=1 --filter "name=$VERIFY_NAME_PREFIX" | xargs -r docker rm -f -v >/dev/null 2>&1
  docker run --rm -v "$TMP:/t" --entrypoint sh "${TEST_MONGO_IMAGE:-mongo:8.0.20}" -c 'rm -rf /t/* /t/.[!.]*' >/dev/null 2>&1
  rm -rf -- "$TMP"
}
trap cleanup EXIT

seed() {
  mongo_eval 'const d = db.getSiblingDB("LibreChat");
    d.users.insertMany([{ email: "a@swarthmore.edu" }, { email: "b@swarthmore.edu" }]);
    d.conversations.insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);' >/dev/null
  pg_sql 'create table observations (id int primary key, body text);
    insert into observations select g, md5(g::text) from generate_series(1, 50) g;' >/dev/null
  local q
  q=$(qdrant_url)
  curl -fsS -X PUT "$q/collections/kb_1" -H 'content-type: application/json' \
    -d '{"vectors": {"size": 4, "distance": "Cosine"}}' >/dev/null
  curl -fsS -X PUT "$q/collections/kb_1/points?wait=true" -H 'content-type: application/json' -d '{"points": [
    {"id": 1, "vector": [0.1, 0.2, 0.3, 0.4]}, {"id": 2, "vector": [0.2, 0.1, 0.3, 0.4]},
    {"id": 3, "vector": [0.3, 0.2, 0.1, 0.4]}, {"id": 4, "vector": [0.4, 0.3, 0.2, 0.1]},
    {"id": 5, "vector": [0.1, 0.4, 0.2, 0.3]}]}' >/dev/null
  curl -fsS -X POST "$q/collections/aliases" -H 'content-type: application/json' \
    -d '{"actions": [{"create_alias": {"collection_name": "kb_1", "alias_name": "kb"}}]}' >/dev/null
  dc exec -T api sh -c 'mkdir -p /app/client/public/images/u1 &&
    echo upload > /app/uploads/a.txt && echo image > /app/client/public/images/u1/b.png &&
    echo creds > /app/data/.env.temp'
}

test_retention() {
  local root="$TMP/retention" day expected kept
  mkdir -p "$root/manual-keep" "$root/.tmp-stale"
  for day in $(seq 0 59); do
    day=$(date -u -d "2026-08-01 + $day days" +%Y-%m-%d)
    mkdir -p "$root/${day}T010000Z" "$root/${day}T020000Z"
  done
  bash -c 'set -euo pipefail; source "$1"; prune_backups "$2" 7 4 2>/dev/null' _ "$BACKUP_DIR/backup.sh" "$root"
  kept=$(find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | LC_ALL=C sort | tr '\n' ' ')
  expected=".tmp-stale 2026-09-13T020000Z 2026-09-20T020000Z 2026-09-23T020000Z 2026-09-24T020000Z 2026-09-25T020000Z 2026-09-26T020000Z 2026-09-27T020000Z 2026-09-28T020000Z 2026-09-29T020000Z manual-keep "
  check "retention keeps newest per day for 7 days plus newest per ISO week for 4 weeks" [ "$kept" == "$expected" ]
}

test_guards() {
  local out rc
  set +e
  out=$(BACKUP_ALLOW_ROOTFS=0 BACKUP_ROOT="$TMP/rootfs" TEXTFILE_DIR="$TMP/guard" "$BACKUP_DIR/backup.sh" 2>&1)
  rc=$?
  set -e
  if [[ "$(findmnt -n -o TARGET --target "$TMP")" == "/" ]]; then
    check "refuses to write backups to the root filesystem" [ "$rc" -ne 0 ]
    check "explains the root filesystem refusal" grep -q 'root filesystem' <<<"$out"
  fi

  set +e
  out=$(BACKUP_MIN_FREE_MB=999999999 TEXTFILE_DIR="$TMP/guard" "$BACKUP_DIR/backup.sh" 2>&1)
  rc=$?
  set -e
  check "refuses to run when the target is low on space" [ "$rc" -ne 0 ]
  check "low-space failure is reported as a failed run metric" [ "$(TEXTFILE_DIR="$TMP/guard" metric swatgpt_backup.prom swatgpt_backup_last_run_success)" == 0 ]
  check "with no backups the success timestamp is 0 so the staleness alert fires" [ "$(TEXTFILE_DIR="$TMP/guard" metric swatgpt_backup.prom swatgpt_backup_last_success_timestamp)" == 0 ]
}

test_happy_path() {
  mkdir -p "$BACKUP_ROOT/.tmp-left-by-a-killed-run"
  check "backup.sh exits 0 against a healthy stack" "$BACKUP_DIR/backup.sh"
  local latest
  latest=$(readlink -f "$BACKUP_ROOT/latest")
  check "one dated backup directory is published" [ "$(count_backups)" -eq 1 ]
  check "latest points at the new backup" [ -f "$latest/MANIFEST" ]
  check "all four artifacts are present and non-empty" \
    test -s "$latest/mongo.archive.gz" -a -s "$latest/postgres.dump" -a -s "$latest/qdrant.snapshot" -a -s "$latest/files.tar.gz"
  check "qdrant alias resolved to the backing collection" [ "$(cat "$latest/qdrant.collection")" == kb_1 ]
  check "SHA256SUMS validates" sh -c "cd '$latest' && sha256sum --quiet -c SHA256SUMS"
  check "stale work directories from killed runs are removed" no_work_dirs
  check "server-side qdrant snapshot is deleted after download" [ "$(server_snapshot_count)" -eq 0 ]
  check "files archive contains uploads, images and data" sh -c \
    "tar -tzf '$latest/files.tar.gz' | grep -q '^uploads/a.txt' && tar -tzf '$latest/files.tar.gz' | grep -q '^client/public/images/u1/b.png' && tar -tzf '$latest/files.tar.gz' | grep -q '^data/.env.temp'"
  check "backup files are not world-readable" [ "$(stat -c %a "$latest/mongo.archive.gz")" == 600 ]
  check "last_run_success metric is 1" [ "$(metric swatgpt_backup.prom swatgpt_backup_last_run_success)" == 1 ]
  check "last_success_timestamp equals the manifest completion time" \
    [ "$(metric swatgpt_backup.prom swatgpt_backup_last_success_timestamp)" == "$(awk -F= '$1 == "completed_epoch" { print $2 }' "$latest/MANIFEST")" ]
  check "size metrics are exported per artifact" grep -q 'swatgpt_backup_size_bytes{file="mongo.archive.gz"}' "$TEXTFILE_DIR/swatgpt_backup.prom"
}

test_failure_keeps_previous() {
  local before_success before_count rc
  before_success=$(metric swatgpt_backup.prom swatgpt_backup_last_success_timestamp)
  before_count=$(count_backups)
  check "precondition: a previous good backup exists" [ "${before_success:-0}" -gt 0 ]
  sleep 1
  dc stop api >/dev/null 2>&1
  set +e
  "$BACKUP_DIR/backup.sh" >"$TMP/fail.log" 2>&1
  rc=$?
  set -e
  dc start api >/dev/null 2>&1
  check "backup.sh exits non-zero when a component fails" [ "$rc" -ne 0 ]
  check "a failed run publishes nothing" [ "$(count_backups)" -eq "$before_count" ]
  check "a failed run leaves no partial work directory" no_work_dirs
  check "a failed run after the qdrant step still deletes the server-side snapshot" [ "$(server_snapshot_count)" -eq 0 ]
  check "last_run_success metric drops to 0" [ "$(metric swatgpt_backup.prom swatgpt_backup_last_run_success)" == 0 ]
  check "last_success_timestamp keeps the previous good backup" [ "$(metric swatgpt_backup.prom swatgpt_backup_last_success_timestamp)" == "$before_success" ]
}

test_lock() {
  local rc
  set +e
  (
    flock -n 8
    "$BACKUP_DIR/backup.sh" >/dev/null 2>&1
  ) 8>"$BACKUP_ROOT/.lock"
  rc=$?
  set -e
  check "a second concurrent run refuses to start" [ "$rc" -ne 0 ]
}

test_verify() {
  local out
  mkdir -p "$BACKUP_ROOT/.verify-left-by-a-killed-run/mongo"
  echo stale >"$BACKUP_ROOT/.verify-left-by-a-killed-run/mongo/file"
  docker run -d --name "$VERIFY_NAME_PREFIX-1-qdrant" --label swatgpt.backup.verify=1 --network none \
    "${TEST_FILES_IMAGE:-alpine:latest}" sleep 600 >/dev/null
  out=$("$BACKUP_DIR/verify.sh" 2>&1) || { printf '%s\n' "$out"; fail "verify.sh restores the latest backup"; return; }
  pass "verify.sh restores the latest backup"
  check "verify sees both mongo collections with their counts" grep -q 'conversations=3 users=2' <<<"$out"
  check "verify sees the postgres table" grep -q 'postgres: 1 tables restored' <<<"$out"
  check "verify sees all qdrant points" grep -q 'kb_1 restored with 5 points' <<<"$out"
  check "verify records a success metric" [ "$(metric swatgpt_backup_verify.prom swatgpt_backup_last_verify_run_success)" == 1 ]
  check "verify leaves no throwaway containers" [ -z "$(docker ps -aq --filter "name=$VERIFY_NAME_PREFIX")" ]
  check "verify removes scratch data left by a killed run" [ ! -e "$BACKUP_ROOT/.verify-left-by-a-killed-run" ]

  local bad="$TMP/corrupt" truncated="$TMP/truncated"
  cp -a "$(readlink -f "$BACKUP_ROOT/latest")" "$bad"
  cp -a "$bad" "$truncated"
  printf 'x' >>"$bad/postgres.dump"
  check "verify fails on a checksum mismatch" bash -c "! '$BACKUP_DIR/verify.sh' '$bad' >/dev/null 2>&1"
  check "a failed verify records run_success 0" [ "$(metric swatgpt_backup_verify.prom swatgpt_backup_last_verify_run_success)" == 0 ]

  truncate -s "$(( $(stat -c %s "$truncated/mongo.archive.gz") / 2 ))" "$truncated/mongo.archive.gz"
  (cd "$truncated" && find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | sort | xargs sha256sum -- >"$TMP/sums")
  mv "$TMP/sums" "$truncated/SHA256SUMS"
  check "verify fails on a truncated mongo archive with valid checksums" bash -c "! '$BACKUP_DIR/verify.sh' '$truncated' >/dev/null 2>&1"
  check "failed verify keeps the previous success timestamp" [ "$(metric swatgpt_backup_verify.prom swatgpt_backup_last_verify_success_timestamp)" -gt 0 ]
}

test_runbook_restore() {
  local b q
  b=$(readlink -f "$BACKUP_ROOT/latest")
  q=$(qdrant_url)
  mongo_eval 'db.getSiblingDB("LibreChat").users.deleteMany({})' >/dev/null
  pg_sql 'drop table observations' >/dev/null
  curl -fsS -X DELETE "$q/collections/kb_1" >/dev/null
  dc exec -T api sh -c 'rm -rf /app/uploads/* /app/client/public/images/*'

  dc exec -T mongodb mongorestore --archive --gzip --drop --nsInclude='LibreChat.*' --quiet <"$b/mongo.archive.gz"
  # shellcheck disable=SC2016
  dc exec -T swatgpt-postgres sh -c \
    'exec pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$b/postgres.dump"
  curl -fsS -X POST "$q/collections/$(cat "$b/qdrant.collection")/snapshots/upload?priority=snapshot&wait=true" \
    -F "snapshot=@$b/qdrant.snapshot" >/dev/null
  curl -fsS -X POST "$q/collections/aliases" -H 'content-type: application/json' \
    -d "{\"actions\": [{\"create_alias\": {\"collection_name\": \"$(cat "$b/qdrant.collection")\", \"alias_name\": \"kb\"}}]}" >/dev/null
  dc run --rm --no-deps -T --entrypoint tar api -C /app -xzf - <"$b/files.tar.gz"

  check "runbook: mongorestore brings users back" [ "$(mongo_eval 'db.getSiblingDB("LibreChat").users.countDocuments()')" == 2 ]
  check "runbook: pg_restore brings the table back" [ "$(pg_sql 'select count(*) from observations')" == 50 ]
  check "runbook: snapshot upload + alias brings kb back" \
    [ "$(curl -fsS "$q/collections/kb" | python3 -c 'import json, sys; print(json.load(sys.stdin)["result"]["points_count"])')" == 5 ]
  check "runbook: tar restore brings uploads back" dc exec -T api test -s /app/uploads/a.txt
}

main() {
  test_retention

  dc up -d --wait >/dev/null 2>&1 || dc up -d >/dev/null
  wait_for mongo_eval 'db.runCommand({ ping: 1 }).ok'
  wait_for dc exec -T swatgpt-postgres pg_isready -h 127.0.0.1 -U swatgpt -d swatgpt
  QDRANT_URL=$(qdrant_url)
  export QDRANT_URL
  wait_for curl -fsS "$QDRANT_URL/readyz"
  seed

  test_guards
  test_happy_path
  test_failure_keeps_previous
  test_lock
  test_verify
  test_runbook_restore

  printf '\n%d passed, %d failed\n' "$PASSES" "$FAILURES"
  (( FAILURES == 0 ))
}

main "$@"
