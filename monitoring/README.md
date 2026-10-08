# SwatGPT monitoring (Layer A)

Everything here is configuration for the existing SCCS Prometheus/Grafana stack on `gull`
plus the exporters that run on `eagle`. See `context/observability.md` for the plan.

| File | Purpose |
|---|---|
| `prometheus/swatgpt-jobs.yml` | Scrape jobs to append to gull's `prometheus.yml` (vLLM, TEI, eagle, LibreChat exporter, Dash MCP) |
| `prometheus/swatgpt-alerts.yml` | Alerting rules (vLLM down/queueing/TTFT/KV cache, TEI down, retrieval ratio, app 5xx, eagle disk/RAM, readyz, Dash MCP down/poll failures/staleness/tool errors) |
| `grafana/swatgpt.json` | Grafana 11 dashboard, uid `swatgpt`, `datasource` and `router` variables |
| `alertmanager/alertmanager.yml` | Alertmanager config with Discord/Slack/email receivers and inhibit rules |
| `alertmanager/stack-fragment.yml` | `alertmanager` service block for the gull swarm stack |

What gets scraped:

| Job | Target | Exposes |
|---|---|---|
| `vllm` | `loon:8000/metrics` | `vllm:num_requests_running/waiting`, `vllm:kv_cache_usage_perc`, `vllm:time_to_first_token_seconds`, `vllm:e2e_request_latency_seconds`, `vllm:prompt_tokens_total`, `vllm:generation_tokens_total`, `vllm:prefix_cache_{hits,queries}_total` |
| `tei` | `loon:8001`, `loon:8002` | `te_request_duration`, `te_request_count` |
| `eagle` | `eagle:9100`, `eagle:8080` | node_exporter (`node_*`) and cadvisor (`container_*`) |
| `swatgpt_app` | `eagle:3080/metrics` (bearer token) | `http_requests_total`, `http_request_duration_seconds`, `sse_streams_*`, `mongoose_query_duration_seconds`, `agent_startup_*`, `rag_retrieval_total{result}`, `rag_retrieval_duration_seconds`, `rag_chunks_returned`, `mcp_tool_calls_total{server,tool,result}`, `mcp_tool_call_duration_seconds` |
| `swatgpt_mcp` | `eagle:3001/metrics` (gull-only firewall, no auth) | `swatgpt_mcp_tool_calls_total{tool,result}`, `swatgpt_mcp_upstream_polls_total{kind,result}`, `swatgpt_mcp_upstream_last_success_timestamp_seconds{kind}`, `swatgpt_mcp_snapshot_age_seconds{domain}` |

Dash MCP (`dash_mcp/src/metrics.ts`) serves `GET /metrics` on container port 3000 without
authentication. `docker-compose.override.yml` publishes it as `${SWATGPT_METRICS_BIND}:3001:3000` on
eagle, and `eagle-harden.sh` gives 3001 the same gull-only firewall treatment as 9100/8080 (see A.4).
The publish exposes the whole Dash MCP HTTP server, not just `/metrics`, which is why the firewall
rule must be in place before the deploy that adds it. The scrape's `Host: eagle.sccs.swarthmore.edu:3001`
header must be in `SWATGPT_MCP_ALLOWED_HOSTS` (the compose default includes it); otherwise the
DNS-rebinding guard answers 403 and `SwatGPTMcpDown` fires. Add the job in B.1 only after the `:3001`
check in A.3 succeeds.
Poll counters are zero-filled for every result the first time a job kind runs, so `increase()` sees a
`success` series even for a kind that has never succeeded.

## A. eagle (`aidahxr`)

The deploy tree is `/srv/SwatGPT` (the working directory of `.github/workflows/production.yml`).
Host-level setup that is not monitoring (runner unit, `.env` permissions) is in `ops/eagle/README.md`.

1. Set the scrape token in `/srv/SwatGPT/.env`:

   ```sh
   cd /srv/SwatGPT
   grep -q '^METRICS_SECRET=' .env || printf 'METRICS_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
   # hand the value to whoever runs B.2 out of band (not in chat logs or on a command line)
   ```

   Optional: `SWATGPT_METRICS_BIND=130.58.218.151` is the default bind address for the exporter
   ports (9100, 8080, 3001); override it in `.env` only if eagle's address changes.

2. Start the exporters and restart the app so it picks up `METRICS_SECRET`:

   ```sh
   docker compose up -d
   docker compose ps      # api should report "healthy" after ~60 s; node-exporter and cadvisor "running"
   ```

3. Verify locally on eagle:

   ```sh
   TOKEN=$(grep '^METRICS_SECRET=' .env | cut -d= -f2-)
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/readyz                       # 200
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/metrics                      # 401 (no token)
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3080/metrics | grep -E '^(http_requests_total|rag_retrieval_total|mcp_tool_calls_total)' | head
   curl -s http://130.58.218.151:9100/metrics | grep '^node_filesystem_avail_bytes.*mountpoint="/"'
   curl -s http://130.58.218.151:8080/metrics | grep -c '^container_memory_working_set_bytes'
   curl -s http://130.58.218.151:3001/metrics | grep -E '^swatgpt_mcp_(upstream_|snapshot_age)'
   docker compose exec -T api node -e "fetch('http://swatgpt-mcp:3000/metrics').then(r=>r.text()).then(t=>console.log(t.split('\n').filter(l=>l.startsWith('swatgpt_mcp_')).join('\n')))"
   ```

4. Firewall: run `sudo ./monitoring/eagle-harden.sh` (idempotent). It puts a `SWATGPT-INGRESS`
   chain in front of `DOCKER-USER` (ufw does not see published container ports) that drops traffic
   on `enp6s18` to these host ports unless it comes from gull (`130.58.218.21`):

   | Port | Service | Allowed from |
   |---|---|---|
   | 3080 | LibreChat (Traefik upstream and `/metrics`) | gull |
   | 9100, 8080 | node_exporter, cadvisor | gull |
   | 3001 | Dash MCP `/metrics` (no auth) | gull |
   | 3000 | admin panel | campus `130.58.0.0/16`; compose already binds it to `127.0.0.1` |

   Docker DNATs published ports before `DOCKER-USER`, so `--dport` would see the container port
   (3000 for both Dash MCP and the admin panel). The rules match the published host port with
   `-m conntrack --ctorigdstport` instead. Dropping 3080 from everything but gull stops campus
   clients from skipping Traefik/CrowdSec and forging `X-Forwarded-For` (the app trusts one proxy
   hop). The script also removes the per-port `DOCKER-USER` rules an earlier version installed,
   persists the result with `netfilter-persistent save`, and force-recreates `api` so
   `AUDIT_LOG_FAIL_CLOSED=true` actually takes effect. Afterwards confirm
   `https://chat.sccs.swarthmore.edu/readyz` returns 200, the gull targets `eagle:3080`/`:9100`/
   `:8080`/`:3001` are `up`, and `curl -m5 http://130.58.218.151:3080/readyz` from a campus host
   other than gull times out.
   The rules are IPv4 only. `api` publishes `${PORT}:${PORT}` on all addresses, so if eagle has a
   global IPv6 address, docker-proxy answers 3080 over IPv6 through `INPUT`, outside `DOCKER-USER`;
   the script prints a warning in that case.

5. Log rotation: every compose service logs through `json-file` with `max-size`/`max-file`
   (`SWATGPT_LOG_MAX_SIZE`, default `20m`; `SWATGPT_LOG_MAX_FILE`, default `5`). The first deploy
   that carries this recreates every container once.

## B. gull (`dcrepublic`)

The `prometheus` stack config lives in `/srv/monitor/prometheus/config/prometheus.yml` (root/dcrepublic
writable). Prometheus has no `--web.enable-lifecycle`, so every config change is followed by a forced
service update.

1. Append the five jobs from `prometheus/swatgpt-jobs.yml` under `scrape_configs:` in
   `prometheus.yml` (indentation in the file already matches a two-space `scrape_configs:` list).
   `gull-install.sh` appends only the jobs whose `job_name` is not there yet, so re-running it on the
   existing gull install adds just `swatgpt_mcp`. Land the eagle `:3001` publish and firewall rule
   first. Until the job exists, every Dash MCP alert except `SwatGPTMcpToolErrorRatioHigh` stays silent.

2. Create the bearer-token file with the `METRICS_SECRET` value from A.1 (no trailing newline).
   `gull-install.sh` does this; it reads the secret from a prompt, stdin, `METRICS_SECRET_FILE`, or a
   `METRICS_SECRET` exported after a silent `read -rs` and passed with `sudo --preserve-env=METRICS_SECRET`
   (never `METRICS_SECRET=... sudo`, which lands in shell history), and refuses it as an argument
   (sudo logs the full command line to the journal and `auth.log`, and arguments show in `ps`). It
   writes the file through a `mktemp` (mode 600) and only then sets `root:docker 640` and moves it into
   place, so it is never world-readable. By hand, the same without the secret on a command line:

   ```sh
   cd /srv/monitor/prometheus/config
   T=$(sudo mktemp .swatgpt_metrics_token.XXXXXX)
   read -rs S && printf '%s' "$S" | sudo tee "$T" >/dev/null; unset S   # paste at the silent prompt
   sudo chown root:docker "$T" && sudo chmod 640 "$T" && sudo mv -f "$T" swatgpt_metrics_token
   ```

   The first install (2026-09-09) took the secret as an argument, so it is in gull's sudo log.
   Rotate it: new `METRICS_SECRET` in eagle's `.env`, recreate `api`, rerun this step, then
   `docker service update --force prometheus_prometheus`.

   The container must see it at `/etc/prometheus/swatgpt_metrics_token`; if only `prometheus.yml` is
   bind-mounted rather than the whole `config/` directory, add a mount for the token and the rules file.

3. Copy the alert rules and reference them:

   ```sh
   cp swatgpt-alerts.yml /srv/monitor/prometheus/config/swatgpt-alerts.yml
   ```

   In `prometheus.yml`:

   ```yaml
   rule_files:
     - /etc/prometheus/swatgpt-alerts.yml

   alerting:
     alertmanagers:
       - static_configs:
           - targets: ["alertmanager:9093"]
   ```

4. Add Alertmanager to the stack. Create `/srv/monitor/alertmanager/config/alertmanager.yml` from
   `alertmanager/alertmanager.yml` (fill in the Discord webhook, or switch to the Slack/email receiver),
   merge `alertmanager/stack-fragment.yml` into the stack file, then deploy:

   ```sh
   mkdir -p /srv/monitor/alertmanager/config
   cp alertmanager.yml /srv/monitor/alertmanager/config/alertmanager.yml
   docker run --rm -v /srv/monitor/alertmanager/config:/cfg:ro prom/alertmanager:v0.28.1 amtool check-config /cfg/alertmanager.yml
   docker run --rm -v /srv/monitor/prometheus/config:/cfg:ro --entrypoint promtool prom/prometheus:latest check config /cfg/prometheus.yml
   docker stack deploy -c <stack-file> prometheus
   ```

5. Reload Prometheus and confirm the targets:

   ```sh
   docker service update --force prometheus_prometheus
   docker service logs --since 2m prometheus_prometheus | grep -iE 'error|level=warn' || echo "no config errors"
   curl -s https://prometheus.sccs.swarthmore.edu/api/v1/targets | python3 -c '
   import json,sys
   for t in json.load(sys.stdin)["data"]["activeTargets"]:
       if t["labels"]["job"] in ("vllm","tei","eagle","swatgpt_app","swatgpt_mcp"): print(t["labels"]["job"], t["scrapeUrl"], t["health"], t.get("lastError",""))'
   curl -s https://prometheus.sccs.swarthmore.edu/api/v1/rules | python3 -c 'import json,sys; print([g["name"] for g in json.load(sys.stdin)["data"]["groups"]])'
   ```

   A `swatgpt_app` target with `server returned HTTP status 401` means the token file does not match
   `METRICS_SECRET` on eagle.

6. Import the dashboard in Grafana (`monitor.sccs.swarthmore.edu`): Dashboards -> New -> Import ->
   upload `grafana/swatgpt.json`, pick the Prometheus data source when asked. The `router` variable lists
   Traefik routers matching `swatgpt|chat`; adjust its regex if the chat router is named differently.
   Optionally set Alerting -> Contact points to the same webhook so Grafana-managed alerts (if any) land
   in the same place.

7. Test the alert pipeline end to end once: `docker service scale swatgpt_vllm=0` is too disruptive, so
   instead temporarily set a rule's threshold to something that fires (`vllm:num_requests_waiting >= 0`),
   force-update, wait for the Discord/Slack message, and revert.

## Alert reference

The staleness thresholds assume the default `SWATGPT_*_POLL_INTERVAL_SECONDS` in
`docker-compose.override.yml`; scale them in `swatgpt-alerts.yml` if those are overridden.

| Alert | Condition | Severity |
|---|---|---|
| `SwatGPTVllmDown` | `up{job="vllm"} == 0` for 2m | critical |
| `SwatGPTVllmQueueing` | `vllm:num_requests_waiting > 0` for 5m | warning |
| `SwatGPTVllmTtftHigh` | p95 TTFT > 5s for 5m | warning |
| `SwatGPTVllmKvCacheHigh` | `vllm:kv_cache_usage_perc > 0.9` for 5m | warning |
| `SwatGPTTeiDown` | `up{job="tei"} == 0` for 2m | critical |
| `SwatGPTRetrievalFailureRatioHigh` | `timeout`/`error` share of non-`disabled` `rag_retrieval_total` > 20% with at least 10 retrievals in 10m, for 10m. `empty` is excluded: it is the normal result for greetings and off-topic chat; watch it on the dashboard's by-result panel | warning |
| `SwatGPTRetrievalDisabled` | any `result="disabled"` retrievals in 10m (RAG env vars missing) | warning |
| `SwatGPTAppDown` | `up{job="swatgpt_app"} == 0` for 2m (a 401 counts as down) | critical |
| `SwatGPTReadyzFailing` | `probe_success{job="swatgpt_readyz"} == 0` for 2m (needs the optional blackbox job) | critical |
| `SwatGPTApp5xxRateHigh` | 5xx share of `http_requests_total` > 2% for 5m | warning |
| `SwatGPTMcpDown` | `up{job="swatgpt_mcp"} == 0` for 5m | warning |
| `SwatGPTMcpPollFailing` | alerts/realtime/content had errors and no successes over 1h (configuration: over 3h, since it polls hourly), for 15m | warning |
| `SwatGPTMcpPollStale` | last successful poll older than 3x its interval (alerts 3m, realtime 15m, content 45m, configuration 3h) for 10m | warning |
| `SwatGPTMcpSnapshotStale` | `swatgpt_mcp_snapshot_age_seconds` > 15m for weather/transit or > 45m for hours/news/resources, for 15m (catches polls that "succeed" with zero records) | warning |
| `SwatGPTMcpToolErrorRatioHigh` | non-success share of app-side `mcp_tool_calls_total{server="swatgpt"}` > 20% with at least 10 calls in 15m, for 15m | warning |
| `SwatGPTEagleExporterDown` | `up{job="eagle"} == 0` for 5m | warning |
| `SwatGPTEagleDiskHigh` | `/` usage > 85% for 10m | warning |
| `SwatGPTEagleMemoryLow` | available RAM < 10% for 10m | warning |

Without a blackbox exporter, `/readyz` is covered indirectly: the compose `healthcheck` on the `api`
service hits `/readyz` every 30 s (visible in `docker compose ps`), the deploy workflow polls it, and
`SwatGPTAppDown` fires when the process stops answering scrapes.
