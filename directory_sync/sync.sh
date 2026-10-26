#!/usr/bin/env bash
# Daily directory sync, run from a user crontab on gull: export the ITS +
# Cygnet snapshot here, ship it to the app host, and publish it with
# `npm run import-directory` inside the running LibreChat container. The app
# picks a new snapshot up within a minute when its directory was empty and
# within 15 minutes otherwise; no restart is needed.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
EAGLE=${EAGLE:-aidahxr@130.58.218.151}
EAGLE_REPO=${EAGLE_REPO:-/srv/SwatGPT}
REMOTE_FILE=${REMOTE_FILE:-.cache/swatgpt-directory.json}
CONTAINER_FILE=/tmp/directory.json

snapshot=
trap '[[ -n $snapshot ]] && rm -f "$snapshot"' EXIT
snapshot=$(OUT_DIR="${OUT_DIR:-$HERE/out}" "$HERE/export.sh")
echo "[sync] $(date -Is) exported $snapshot"

ssh -o BatchMode=yes "$EAGLE" "mkdir -p \"\$(dirname '$REMOTE_FILE')\" && chmod 700 \"\$(dirname '$REMOTE_FILE')\""
scp -q "$snapshot" "$EAGLE:$REMOTE_FILE"

# The snapshot is streamed into the container through `exec` rather than `docker compose cp`:
# cp creates the file root-owned and 0600, which the api container (running as the deploy
# user's uid) cannot read, so the import fails with EACCES.
ssh -o BatchMode=yes "$EAGLE" bash -s <<REMOTE
set -euo pipefail
trap 'rm -f "\$HOME/$REMOTE_FILE"; docker compose exec -T api rm -f "$CONTAINER_FILE" >/dev/null 2>&1 || true' EXIT
cd "$EAGLE_REPO"
docker compose exec -T api sh -c 'umask 077; cat > "$CONTAINER_FILE"' < "\$HOME/$REMOTE_FILE"
docker compose exec -T api npm run import-directory -- "$CONTAINER_FILE"
REMOTE

echo "[sync] $(date -Is) published"
