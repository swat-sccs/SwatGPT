#!/bin/bash
# Installs the SwatGPT scrape jobs, bearer token, alert rules and Alertmanager
# into the SCCS `prometheus` swarm stack on gull, validates, deploys, reloads.
#
#   sudo ./gull-install.sh <METRICS_SECRET>
#
# Expects, next to this script: prometheus/swatgpt-jobs.yml,
# prometheus/swatgpt-alerts.yml, alertmanager/alertmanager.yml.
# Idempotent: re-running skips steps already applied. Backups are written with a
# timestamp suffix next to every file it changes.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
TOKEN="${1:-}"; [ ${#TOKEN} -ge 32 ] || { echo "usage: sudo $0 <METRICS_SECRET from eagle's .env>"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
C=/srv/monitor/prometheus/config
STACK=/srv/monitor/prometheus/docker-compose.yml
AM=/srv/monitor/alertmanager/config
TS=$(date +%Y%m%d-%H%M%S)

cp -a "$C/prometheus.yml" "$C/prometheus.yml.bak-$TS"
cp -a "$STACK" "$STACK.bak-$TS"

if ! grep -q 'job_name: swatgpt_app' "$C/prometheus.yml"; then
  printf '\n  # ---- SwatGPT (added %s, swat-sccs/SwatGPT monitoring/README.md) ----\n' "$TS" >> "$C/prometheus.yml"
  grep -vE '^#' "$HERE/prometheus/swatgpt-jobs.yml" | sed '/^\s*# Optional: \/readyz/,$d' >> "$C/prometheus.yml"
  echo "scrape jobs appended"
else
  echo "scrape jobs already present"
fi

if ! grep -q '^rule_files:' "$C/prometheus.yml"; then
  printf '\nrule_files:\n  - /etc/prometheus/swatgpt-alerts.yml\n' >> "$C/prometheus.yml"
  echo "rule_files added"
fi
sed -i 's|^        - targets: \[\]$|        - targets: ["alertmanager:9093"]|' "$C/prometheus.yml"

printf '%s' "$TOKEN" > "$C/swatgpt_metrics_token"
chown root:docker "$C/swatgpt_metrics_token"; chmod 640 "$C/swatgpt_metrics_token"
install -m 644 "$HERE/prometheus/swatgpt-alerts.yml" "$C/swatgpt-alerts.yml"

mkdir -p "$AM"
[ -f "$AM/alertmanager.yml" ] || install -m 644 "$HERE/alertmanager/alertmanager.yml" "$AM/alertmanager.yml"

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
( cd /srv/monitor/prometheus && docker stack deploy -c docker-compose.yml prometheus )
echo "--- reload prometheus (no lifecycle API, so a forced update)"
docker service update --force --detach=false prometheus_prometheus
sleep 20
echo "--- targets"
CID=$(docker ps -q --filter name=prometheus_prometheus | head -1)
docker exec "$CID" wget -qO- http://localhost:9090/api/v1/targets | python3 -c '
import json,sys
for t in json.load(sys.stdin)["data"]["activeTargets"]:
    if t["scrapePool"] in ("vllm","tei","eagle","swatgpt_app"):
        print(f"{t[\"scrapePool\"]:12} {t[\"scrapeUrl\"]:55} {t[\"health\"]}  {t.get(\"lastError\",\"\")[:80]}")'
echo "--- rule groups"
docker exec "$CID" wget -qO- http://localhost:9090/api/v1/rules | python3 -c '
import json,sys
gs=json.load(sys.stdin)["data"]["groups"]; print(len(gs),"groups,",sum(len(g["rules"]) for g in gs),"rules")'
echo
echo "Done. Remaining by hand: put a real Discord/Slack webhook in $AM/alertmanager.yml"
echo "(receiver sccs-discord) and run: docker service update --force prometheus_alertmanager"
