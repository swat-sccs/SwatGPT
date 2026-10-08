#!/bin/bash
# Installs the SwatGPT scrape jobs, bearer token, alert rules and Alertmanager
# into the SCCS `prometheus` swarm stack on gull, validates, deploys, reloads.
#
#   sudo ./gull-install.sh                                   # prompts for METRICS_SECRET
#   sudo ./gull-install.sh < /path/to/metrics_secret         # or pipe it on stdin
#   sudo METRICS_SECRET_FILE=/root/metrics_secret ./gull-install.sh
#   read -rs METRICS_SECRET && export METRICS_SECRET && sudo --preserve-env=METRICS_SECRET ./gull-install.sh
#
# The secret is never accepted as an argument: sudo logs the full command line to the
# journal/auth.log and it would show up in `ps` and shell history.
#
# Expects, next to this script: prometheus/swatgpt-jobs.yml,
# prometheus/swatgpt-alerts.yml, alertmanager/alertmanager.yml.
# Idempotent: re-running skips steps already applied. Backups are written with a
# timestamp suffix next to every file it changes.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
usage() { echo "usage: sudo $0  (enter METRICS_SECRET from eagle's .env at the prompt, pipe it on stdin, or set METRICS_SECRET_FILE)"; exit 1; }
[ $# -eq 0 ] || { echo "refusing arguments: the secret must not be on the command line"; usage; }
if [ -n "${METRICS_SECRET:-}" ]; then
  TOKEN=$METRICS_SECRET
elif [ -n "${METRICS_SECRET_FILE:-}" ]; then
  TOKEN=$(cat "$METRICS_SECRET_FILE")
elif [ -t 0 ]; then
  read -rsp 'METRICS_SECRET: ' TOKEN; echo
else
  IFS= read -r TOKEN || true
fi
TOKEN=${TOKEN%$'\r'}
unset METRICS_SECRET
[ ${#TOKEN} -ge 32 ] && [[ "$TOKEN" != *[[:space:]]* ]] || usage
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${GULL_MONITOR_ROOT:-/srv/monitor}
C=$ROOT/prometheus/config
STACK=$ROOT/prometheus/docker-compose.yml
AM=$ROOT/alertmanager/config
TS=$(date +%Y%m%d-%H%M%S)

cp -a "$C/prometheus.yml" "$C/prometheus.yml.bak-$TS"
cp -a "$STACK" "$STACK.bak-$TS"

missing_jobs() {
  local have
  have=$(grep -oE 'job_name: *[A-Za-z0-9_]+' "$C/prometheus.yml" | sed 's/job_name: *//' | tr '\n' ' ' || true)
  grep -vE '^#' "$HERE/prometheus/swatgpt-jobs.yml" | sed '/^\s*# Optional: \/readyz/,$d' | awk -v have="$have" '
    BEGIN { n = split(have, h, " "); for (i = 1; i <= n; i++) seen[h[i]] = 1 }
    /^  #/ { buf = buf $0 "\n"; next }
    /^  - job_name:/ { keep = !($3 in seen); if (keep) printf "%s%s\n", buf, $0; buf = ""; next }
    /^[[:space:]]*$/ { if (keep) print ""; keep = 0; buf = ""; next }
    { if (keep) print }
  '
}
JOBS=$(missing_jobs)
if [ -n "$JOBS" ]; then
  printf '\n  # ---- SwatGPT (added %s, swat-sccs/SwatGPT monitoring/README.md) ----\n%s\n' "$TS" "$JOBS" >> "$C/prometheus.yml"
  echo "scrape jobs appended: $(printf '%s\n' "$JOBS" | grep -oE 'job_name: [A-Za-z0-9_]+' | cut -d' ' -f2 | tr '\n' ' ')"
else
  echo "scrape jobs already present"
fi

if ! grep -q '^rule_files:' "$C/prometheus.yml"; then
  printf '\nrule_files:\n  - /etc/prometheus/swatgpt-alerts.yml\n' >> "$C/prometheus.yml"
  echo "rule_files added"
fi
sed -i 's|^        - targets: \[\]$|        - targets: ["alertmanager:9093"]|' "$C/prometheus.yml"

TOKEN_TMP=$(mktemp "$C/.swatgpt_metrics_token.XXXXXX")
printf '%s' "$TOKEN" > "$TOKEN_TMP"
unset TOKEN
chown root:docker "$TOKEN_TMP"; chmod 640 "$TOKEN_TMP"
mv -f "$TOKEN_TMP" "$C/swatgpt_metrics_token"
install -m 644 "$HERE/prometheus/swatgpt-alerts.yml" "$C/swatgpt-alerts.yml"

mkdir -p "$AM"
[ -f "$AM/alertmanager.yml" ] || install -m 644 "$HERE/alertmanager/alertmanager.yml" "$AM/alertmanager.yml"
if grep -q 'SwatGPTRetrievalNonHitRatioHigh' "$AM/alertmanager.yml"; then
  echo "WARNING: $AM/alertmanager.yml still inhibits SwatGPTRetrievalNonHitRatioHigh, which is now"
  echo "SwatGPTRetrievalFailureRatioHigh; update that inhibit rule (see alertmanager/alertmanager.yml)"
fi
if ! grep -q 'SwatGPTBackupStale' "$AM/alertmanager.yml"; then
  echo "WARNING: $AM/alertmanager.yml predates the backup alerts; copy the SwatGPTBackupStale ->"
  echo "SwatGPTBackupRunFailed inhibit rule from alertmanager/alertmanager.yml into it"
fi

if ! grep -q '^  alertmanager:' "$STACK"; then
  python3 - "$STACK" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
svc = '''  alertmanager:
    image: prom/alertmanager:v0.28.1
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
      - "--storage.path=/alertmanager"
    volumes:
      - /srv/monitor/alertmanager/config:/etc/alertmanager:ro
      - alertmanager_data:/alertmanager
    networks:
      - monitor
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == gull
      resources:
        limits:
          memory: 256M
      restart_policy:
        condition: on-failure
'''
anchor = '\nnetworks:\n  monitor:\n    external: true'
assert anchor in s, 'stack file layout changed; add the alertmanager service by hand'
s = s.replace(anchor, '\n' + svc + '\nvolumes:\n  alertmanager_data:\n' + anchor, 1)
open(p, 'w').write(s)
PY
  echo "alertmanager service added to the stack file"
fi

echo "--- promtool check config"
docker run --rm -v "$C:/etc/prometheus:ro" --entrypoint promtool prom/prometheus:latest check config /etc/prometheus/prometheus.yml
echo "--- amtool check-config"
docker run --rm -v "$AM:/cfg:ro" --entrypoint amtool prom/alertmanager:v0.28.1 check-config /cfg/alertmanager.yml
echo "--- docker stack deploy (adds alertmanager; unchanged services are left alone)"
( cd "$ROOT/prometheus" && docker stack deploy -c docker-compose.yml prometheus )
echo "--- reload prometheus (no lifecycle API, so a forced update)"
docker service update --force --detach=false prometheus_prometheus
sleep 20
echo "--- targets"
CID=$(docker ps -q --filter name=prometheus_prometheus | head -1)
docker exec "$CID" wget -qO- http://localhost:9090/api/v1/targets | python3 -c '
import json,sys
for t in json.load(sys.stdin)["data"]["activeTargets"]:
    if t["scrapePool"] in ("vllm","tei","eagle","swatgpt_app","swatgpt_mcp"):
        print("%-12s %-52s %-5s %s" % (t["scrapePool"], t["scrapeUrl"], t["health"], t.get("lastError","")[:80]))'
echo "--- rule groups"
docker exec "$CID" wget -qO- http://localhost:9090/api/v1/rules | python3 -c '
import json,sys
gs=json.load(sys.stdin)["data"]["groups"]; print(len(gs),"groups,",sum(len(g["rules"]) for g in gs),"rules")'
echo
echo "Done. Remaining by hand: put a real Discord/Slack webhook in $AM/alertmanager.yml"
echo "(receiver sccs-discord) and run: docker service update --force prometheus_alertmanager"
