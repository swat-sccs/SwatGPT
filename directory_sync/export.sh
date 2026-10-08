#!/usr/bin/env bash
# Exports the ITS student directory plus the Cygnet privacy overlay as a
# SwatGPT snapshot. Runs on gull, the only host allowed to reach ITS's
# database; the overlay database lives on Cygnet's non-attachable swarm
# network, so the exporter runs as a one-shot swarm service on that network
# and reads its credentials from the running Cygnet service. Credentials reach
# the service through a private env file, never the docker command line, so
# other users on gull cannot read them from the process table. Dependencies
# install from the committed lockfile with install scripts disabled.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT_DIR=${OUT_DIR:-$HERE/out}
OUTPUT=${OUTPUT:-$OUT_DIR/directory.json}
SERVICE=${SERVICE:-swatgpt-directory-export}
NETWORK=${CYGNET_NETWORK:-cygnet_internal}
CYGNET_SERVICE=${CYGNET_SERVICE:-cygnet_cygnet}
OVERLAY_HOST=${OVERLAY_HOST:-cygnet-db}
IMAGE=${IMAGE:-node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1}
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

ENV_FILE=
remove_service() { docker service rm "$SERVICE" >/dev/null 2>&1 || true; }
cleanup() {
  [[ -z $ENV_FILE ]] || rm -f "$ENV_FILE"
  remove_service
}
trap cleanup EXIT

its_host=$(require DB_HOST)
its_user=$(require DB_USER)
its_pass=$(require DB_PASS)
its_name=$(require DB_NAME)
overlay_user=$(require MYSQL_USER)
overlay_pass=$(require MYSQL_PASSWORD)
overlay_name=$(require MYSQL_DATABASE)

ENV_FILE=$(umask 077 && mktemp "${TMPDIR:-/tmp}/swatgpt-export-env.XXXXXX")
printf '%s=%s\n' \
  ITS_DB_HOST "$its_host" ITS_DB_USER "$its_user" \
  ITS_DB_PASS "$its_pass" ITS_DB_NAME "$its_name" \
  OVERLAY_DB_USER "$overlay_user" OVERLAY_DB_PASS "$overlay_pass" \
  OVERLAY_DB_NAME "$overlay_name" >"$ENV_FILE"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
rm -f "$OUTPUT"
remove_service

docker service create --quiet --detach --name "$SERVICE" \
  --network "$NETWORK" --restart-condition none --replicas 1 \
  --constraint "node.hostname==$(docker info --format '{{.Name}}')" \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$HERE,dst=/src,readonly" \
  --mount "type=bind,src=$OUT_DIR,dst=/out" \
  --env-file "$ENV_FILE" \
  -e HOME=/tmp -e npm_config_cache=/tmp/npm \
  -e OVERLAY_DB_HOST="$OVERLAY_HOST" \
  -e OUTPUT="/out/$(basename "$OUTPUT")" \
  "$IMAGE" sh -c 'mkdir -p /tmp/w && cp /src/package.json /src/package-lock.json /src/export.mjs /tmp/w/ && cd /tmp/w && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error && node export.mjs' \
  >/dev/null
rm -f "$ENV_FILE"

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
