#!/bin/bash
# Launch hardening for eagle. Run once:  sudo ./eagle-harden.sh
#  1. AUDIT_LOG_FAIL_CLOSED=true  -> a conversation can't be disclosed to an admin
#     unless its audit entry was written; restarts the api container (~1 min).
#  2. Firewall (DOCKER-USER chain, which is what actually governs published
#     container ports; ufw does not): exporter ports 9100/8080 only from gull,
#     admin panel port 3000 only from the campus range. ssh is untouched.
#  3. Persists the rules across reboots.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
REPO=/home/aidahxr/SwatGPT
IF=enp6s18
GULL=130.58.218.21
CAMPUS=130.58.0.0/16

cd "$REPO"
if ! grep -q '^AUDIT_LOG_FAIL_CLOSED=' .env; then
  printf '\n# Refuse to disclose conversations/exports if the audit entry cannot be written\nAUDIT_LOG_FAIL_CLOSED=true\n' >> .env
  echo "AUDIT_LOG_FAIL_CLOSED=true added"
fi

add() { iptables -C DOCKER-USER "$@" 2>/dev/null || iptables -I DOCKER-USER "$@"; }
add -i "$IF" -p tcp -m multiport --dports 9100,8080 -s "$GULL" -j RETURN
add -i "$IF" -p tcp -m multiport --dports 9100,8080 -j DROP
add -i "$IF" -p tcp --dport 3000 ! -s "$CAMPUS" -j DROP
# RETURN for gull must be evaluated before the DROP: re-insert it at the top.
iptables -D DOCKER-USER -i "$IF" -p tcp -m multiport --dports 9100,8080 -s "$GULL" -j RETURN
iptables -I DOCKER-USER 1 -i "$IF" -p tcp -m multiport --dports 9100,8080 -s "$GULL" -j RETURN
echo "--- DOCKER-USER"; iptables -S DOCKER-USER

DEBIAN_FRONTEND=noninteractive apt-get install -y -q iptables-persistent >/tmp/iptables-persistent.log 2>&1 || echo "iptables-persistent install failed, see /tmp/iptables-persistent.log"
netfilter-persistent save

echo "--- restarting api so AUDIT_LOG_FAIL_CLOSED takes effect"
sudo -u aidahxr docker compose up -d api
echo "Done. Check: curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/readyz"
