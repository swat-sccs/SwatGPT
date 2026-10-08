#!/bin/bash
# Launch hardening for eagle. Idempotent; run with:  sudo ./eagle-harden.sh
#  1. AUDIT_LOG_FAIL_CLOSED=true in the deploy tree's .env (an existing other value
#     is replaced, not skipped) -> a conversation can't be disclosed to an admin
#     unless its audit entry was written. The api reads .env only at process start
#     and compose does not interpolate it, so the api container is force-recreated
#     (~1 min) and the value it now sees is printed.
#  2. Firewall: a SWATGPT-INGRESS chain jumped to from DOCKER-USER (the chain that
#     actually governs published container ports; ufw does not). Docker DNATs before
#     DOCKER-USER, so rules match the host port with conntrack --ctorigdstport, not
#     --dport (which would see the container port: swatgpt-mcp and admin-panel both
#     listen on 3000 inside their containers).
#       3080 api (Traefik + Prometheus /metrics)  gull only
#       9100 node_exporter, 8080 cadvisor         gull only
#       3001 Dash MCP /metrics (unauthenticated)  gull only
#       3000 admin panel                          campus only (compose binds it to
#                                                 127.0.0.1; this is defense in depth)
#     Rules left in DOCKER-USER by the previous version of this script are removed.
#     ssh is untouched. IPv4 only: if eagle has a global IPv6 address, docker-proxy
#     serves the 0.0.0.0/[::] publishes (3080) over IPv6 through INPUT, which these
#     rules do not see; the script warns when that is the case.
#  3. Persists the rules across reboots.
#
# Environment: SWATGPT_REPO (deploy tree, default /srv/SwatGPT, the CI working
# directory), SWATGPT_IF (default enp6s18).
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
REPO=${SWATGPT_REPO:-/srv/SwatGPT}
IF=${SWATGPT_IF:-enp6s18}
GULL=130.58.218.21
CAMPUS=130.58.0.0/16
CHAIN=SWATGPT-INGRESS
GULL_ONLY_PORTS="3080 9100 8080 3001"
CAMPUS_ONLY_PORTS="3000"

cd "$REPO"
[ -f .env ] || { echo "$REPO/.env not found; set SWATGPT_REPO to the deploy tree"; exit 1; }
OWNER=$(stat -c %U .)

set_env_true() {
  local key=$1 current tmp
  current=$(grep -E "^$key=" .env | tail -1 | cut -d= -f2- || true)
  if [ "$current" = "true" ]; then
    echo "$key=true already set"
    return
  fi
  if [ -z "$current" ] && ! grep -qE "^$key=" .env; then
    printf '\n# Refuse to disclose conversations/exports if the audit entry cannot be written\n%s=true\n' "$key" >> .env
    echo "$key=true added"
    return
  fi
  tmp=$(mktemp)
  sed -E "s/^$key=.*/$key=true/" .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
  echo "WARNING: $key was '$current'; replaced with true"
}
set_env_true AUDIT_LOG_FAIL_CLOSED

iptables -N "$CHAIN" 2>/dev/null || true
iptables -F "$CHAIN"
for port in $GULL_ONLY_PORTS; do
  iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport "$port" --ctdir ORIGINAL ! -s "$GULL" -j DROP
done
for port in $CAMPUS_ONLY_PORTS; do
  iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport "$port" --ctdir ORIGINAL ! -s "$CAMPUS" -j DROP
done
iptables -A "$CHAIN" -j RETURN
iptables -C DOCKER-USER -i "$IF" -j "$CHAIN" 2>/dev/null || iptables -I DOCKER-USER 1 -i "$IF" -j "$CHAIN"

drop_legacy() { while iptables -D DOCKER-USER "$@" 2>/dev/null; do :; done; }
drop_legacy -i "$IF" -p tcp -m multiport --dports 9100,8080 -s "$GULL" -j RETURN
drop_legacy -i "$IF" -p tcp -m multiport --dports 9100,8080 -j DROP
drop_legacy -i "$IF" -p tcp --dport 3000 ! -s "$CAMPUS" -j DROP
echo "--- DOCKER-USER"; iptables -S DOCKER-USER
echo "--- $CHAIN"; iptables -S "$CHAIN"
V6=$(ip -6 -o addr show dev "$IF" scope global 2>/dev/null || true)
if [ -n "$V6" ]; then
  echo "WARNING: $IF has a global IPv6 address; these IPv4 rules do not cover ports published on [::]."
  echo "  Check: ss -ltn '( sport = :3080 )'. Block them with ip6tables on INPUT/DOCKER-USER or bind the publishes to IPv4."
fi

DEBIAN_FRONTEND=noninteractive apt-get install -y -q iptables-persistent >/tmp/iptables-persistent.log 2>&1 || echo "iptables-persistent install failed, see /tmp/iptables-persistent.log"
netfilter-persistent save

echo "--- recreating api so AUDIT_LOG_FAIL_CLOSED takes effect"
sudo -u "$OWNER" docker compose up -d --force-recreate --no-deps api
echo "--- api container sees: $(sudo -u "$OWNER" docker compose exec -T api sh -c 'grep "^AUDIT_LOG_FAIL_CLOSED=" /app/.env' || echo 'nothing (check the .env bind mount)')"
echo "Done. Check, after ~60 s:"
echo "  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/readyz                 # 200"
echo "  curl -s -o /dev/null -w '%{http_code}\n' https://chat.sccs.swarthmore.edu/readyz      # 200 (through Traefik on gull)"
echo "  from a campus host other than gull: curl -m5 http://130.58.218.151:3080/readyz       # times out"
