#!/usr/bin/env bash
# Exports the ITS student directory plus the Cygnet privacy overlay as a
# SwatGPT snapshot. Runs on gull, the only host allowed to reach ITS's
# database; the overlay database lives on Cygnet's non-attachable swarm
# network, so the exporter runs as a one-shot swarm service on that network
# and reads its credentials from the running Cygnet service.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT_DIR=${OUT_DIR:-$HERE/out}
OUTPUT=${OUTPUT:-$OUT_DIR/directory.json}
SERVICE=${SERVICE:-swatgpt-directory-export}
NETWORK=${CYGNET_NETWORK:-cygnet_internal}
CYGNET_SERVICE=${CYGNET_SERVICE:-cygnet_cygnet}
OVERLAY_HOST=${OVERLAY_HOST:-cygnet-db}
IMAGE=${IMAGE:-node:24-alpine}
TIMEOUT_S=${TIMEOUT_S:-300}

cygnet_env() {
  docker service inspect "$CYGNET_SERVICE" \
    --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' |
    awk -F= -v key="$1" '$1 == key { sub($1 "=", ""); print; exit }'
}

require() {
  local value
  value=$(cygnet_env "$1")
  [[ -n $value ]] || { echo "Cygnet service has no $1" >&2; exit 1; }
  printf '%s' "$value"
}

cleanup() { docker service rm "$SERVICE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
rm -f "$OUTPUT"
cleanup

docker service create --quiet --detach --name "$SERVICE" \
  --network "$NETWORK" --restart-condition none --replicas 1 \
  --constraint "node.hostname==$(docker info --format '{{.Name}}')" \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$HERE,dst=/src,readonly" \
  --mount "type=bind,src=$OUT_DIR,dst=/out" \
  -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -e ITS_DB_HOST="$(require DB_HOST)" -e ITS_DB_USER="$(require DB_USER)" \
  -e ITS_DB_PASS="$(require DB_PASS)" -e ITS_DB_NAME="$(require DB_NAME)" \
  -e OVERLAY_DB_HOST="$OVERLAY_HOST" -e OVERLAY_DB_USER="$(require MYSQL_USER)" \
  -e OVERLAY_DB_PASS="$(require MYSQL_PASSWORD)" -e OVERLAY_DB_NAME="$(require MYSQL_DATABASE)" \
  -e OUTPUT="/out/$(basename "$OUTPUT")" \
  "$IMAGE" sh -c 'mkdir -p /tmp/w && cp /src/package.json /src/export.mjs /tmp/w/ && cd /tmp/w && npm install --omit=dev --no-audit --no-fund --loglevel=error && node export.mjs' \
  >/dev/null

task_state() { docker service ps "$SERVICE" --no-trunc --format '{{.CurrentState}}' | head -1; }
task_id() { docker service ps "$SERVICE" -q --no-trunc | head -1; }

for ((waited = 0; waited < TIMEOUT_S; waited += 5)); do
  case "$(task_state)" in
    Complete*|Failed*|Rejected*|Shutdown*) break ;;
  esac
  sleep 5
done

docker service logs --raw "$SERVICE" 2>&1 | sed 's/^/[export] /' >&2
exit_code=$(docker inspect --format '{{.Status.ContainerStatus.ExitCode}}' "$(task_id)" 2>/dev/null || echo 1)
[[ $exit_code == 0 && -s $OUTPUT ]] || { echo "export failed (exit $exit_code, state: $(task_state))" >&2; exit 1; }
chmod 600 "$OUTPUT"
echo "$OUTPUT"
