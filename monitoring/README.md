# SwatGPT monitoring (Layer A)

Everything here is configuration for the existing SCCS Prometheus/Grafana stack on `gull`
plus the exporters that run on `eagle`. See `context/observability.md` for the plan.

| File | Purpose |
|---|---|
| `prometheus/swatgpt-jobs.yml` | Scrape jobs to append to gull's `prometheus.yml` (vLLM, TEI, eagle, LibreChat exporter) |
| `prometheus/swatgpt-alerts.yml` | Alerting rules (vLLM down/queueing/TTFT/KV cache, TEI down, retrieval ratio, app 5xx, eagle disk/RAM, readyz) |
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

Dash MCP also serves `GET /metrics` (`swatgpt_mcp_tool_calls_total{tool,result}`,
`swatgpt_mcp_upstream_polls_total{kind,result}`, `swatgpt_mcp_snapshot_age_seconds{domain}`), but its port
3000 is only exposed on the compose network. Scrape it from inside eagle (`docker compose exec api wget -qO- http://swatgpt-mcp:3000/metrics`)
or publish it on `${SWATGPT_METRICS_BIND}:3001:3000` and add a job if it becomes worth a panel.

## A. eagle (`aidahxr`)

1. Set the scrape token in `/home/aidahxr/SwatGPT/.env`:

   ```sh
   cd /home/aidahxr/SwatGPT
   grep -q '^METRICS_SECRET=' .env || printf 'METRICS_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
   grep '^METRICS_SECRET=' .env      # hand this value to dcrepublic for step B.2
   ```

   Optional: `SWATGPT_METRICS_BIND=130.58.218.151` is the default bind address for the exporter
   ports; override it in `.env` only if eagle's address changes.

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
   docker compose exec -T api node -e "fetch('http://swatgpt-mcp:3000/metrics').then(r=>r.text()).then(t=>console.log(t.split('\n').filter(l=>l.startsWith('swatgpt_mcp_')).join('\n')))"
   ```

4. Firewall: ports 9100, 8080 (exporters) and 3080 (`/metrics`, token protected) on
   `130.58.218.151` must be reachable from gull. If eagle runs ufw/nftables, allow them from gull's
   address only.

## B. gull (`dcrepublic`)

The `prometheus` stack config lives in `/srv/monitor/prometheus/config/prometheus.yml` (root/dcrepublic
writable). Prometheus has no `--web.enable-lifecycle`, so every config change is followed by a forced
service update.

1. Append the four jobs from `prometheus/swatgpt-jobs.yml` under `scrape_configs:` in
   `prometheus.yml` (indentation in the file already matches a two-space `scrape_configs:` list).

2. Create the bearer-token file with the `METRICS_SECRET` value from A.1 (no trailing newline):

   ```sh
   printf '%s' 'PASTE_METRICS_SECRET_HERE' > /srv/monitor/prometheus/config/swatgpt_metrics_token
   chmod 640 /srv/monitor/prometheus/config/swatgpt_metrics_token
   ```

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
       if t["labels"]["job"] in ("vllm","tei","eagle","swatgpt_app"): print(t["labels"]["job"], t["scrapeUrl"], t["health"], t.get("lastError",""))'
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

| Alert | Condition | Severity |
|---|---|---|
| `SwatGPTVllmDown` | `up{job="vllm"} == 0` for 2m | critical |
| `SwatGPTVllmQueueing` | `vllm:num_requests_waiting > 0` for 5m | warning |
| `SwatGPTVllmTtftHigh` | p95 TTFT > 5s for 5m | warning |
| `SwatGPTVllmKvCacheHigh` | `vllm:kv_cache_usage_perc > 0.9` for 5m | warning |
| `SwatGPTTeiDown` | `up{job="tei"} == 0` for 2m | critical |
| `SwatGPTRetrievalNonHitRatioHigh` | non-hit share of `rag_retrieval_total` > 20% for 10m (includes `empty`, as planned) | warning |
| `SwatGPTRetrievalDisabled` | any `result="disabled"` retrievals in 10m (RAG env vars missing) | warning |
| `SwatGPTAppDown` | `up{job="swatgpt_app"} == 0` for 2m (a 401 counts as down) | critical |
| `SwatGPTReadyzFailing` | `probe_success{job="swatgpt_readyz"} == 0` for 2m (needs the optional blackbox job) | critical |
| `SwatGPTApp5xxRateHigh` | 5xx share of `http_requests_total` > 2% for 5m | warning |
| `SwatGPTEagleExporterDown` | `up{job="eagle"} == 0` for 5m | warning |
| `SwatGPTEagleDiskHigh` | `/` usage > 85% for 10m | warning |
| `SwatGPTEagleMemoryLow` | available RAM < 10% for 10m | warning |

Without a blackbox exporter, `/readyz` is covered indirectly: the compose `healthcheck` on the `api`
service hits `/readyz` every 30 s (visible in `docker compose ps`), the deploy workflow polls it, and
`SwatGPTAppDown` fires when the process stops answering scrapes.
