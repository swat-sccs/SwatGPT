# SwatGPT monitoring (Layer A)

Everything here is configuration for the existing SCCS Prometheus/Grafana stack on `gull`
plus the exporters that run on `eagle`. See `context/observability.md` for the plan.

| File | Purpose |
|---|---|
| `prometheus/swatgpt-jobs.yml` | Scrape jobs to append to gull's `prometheus.yml` (vLLM, TEI, eagle, LibreChat exporter, Dash MCP) |
| `prometheus/swatgpt-alerts.yml` | Alerting rules (vLLM down/queueing/TTFT/KV cache, TEI down, retrieval ratio, app 5xx, eagle disk/RAM, readyz, Dash MCP down/poll failures/staleness/tool errors, nightly backups and restore tests) |
| `grafana/swatgpt.json` | Grafana 11 dashboard, uid `swatgpt`, `datasource` and `router` variables |
| `alertmanager/alertmanager.yml` | Alertmanager config with Discord/Slack/email receivers and inhibit rules |
| `alertmanager/stack-fragment.yml` | `alertmanager` service block for the gull swarm stack |

What gets scraped:

| Job | Target | Exposes |
|---|---|---|
| `vllm` | `loon:8000/metrics` | `vllm:num_requests_running/waiting`, `vllm:kv_cache_usage_perc`, `vllm:time_to_first_token_seconds`, `vllm:e2e_request_latency_seconds`, `vllm:prompt_tokens_total`, `vllm:generation_tokens_total`, `vllm:prefix_cache_{hits,queries}_total` |
| `tei` | `loon:8001`, `loon:8002` | `te_request_duration`, `te_request_count` |
| `eagle` | `eagle:9100`, `eagle:8080` | node_exporter (`node_*`, plus `swatgpt_backup_*` from its textfile collector) and cadvisor (`container_*`) |
| `swatgpt_app` | `eagle:3080/metrics` (bearer token) | `http_requests_total`, `http_request_duration_seconds`, `sse_streams_*`, `mongoose_query_duration_seconds`, `agent_startup_*`, `rag_retrieval_total{result}`, `rag_retrieval_duration_seconds`, `rag_chunks_returned`, `mcp_tool_calls_total{server,tool,result}`, `mcp_tool_call_duration_seconds` |
| `swatgpt_mcp` | `eagle:3001/metrics` (gull-only firewall, no auth) | `swatgpt_mcp_tool_calls_total{tool,result}`, `swatgpt_mcp_upstream_polls_total{kind,result}`, `swatgpt_mcp_upstream_last_success_timestamp_seconds{kind}`, `swatgpt_mcp_snapshot_age_seconds{domain}` |

Backup metrics need no scrape job of their own. `ops/backup/backup.sh` and `verify.sh` write
`swatgpt_backup.prom` and `swatgpt_backup_verify.prom` to `/var/lib/node_exporter/textfile_collector`
on eagle, and the `node-exporter` service in `docker-compose.override.yml` reads that directory
through its `/rootfs` mount (`--collector.textfile.directory`). Until the backup units are installed
(`ops/backup/README.md`) the directory is missing or empty: node_exporter keeps running and reports
`node_textfile_scrape_error`, and `SwatGPTBackupMetricsMissing` fires after 2h once gull has the
rules. Install the backup units on eagle before copying the updated rules to gull, or expect that
warning in the meantime. gull's existing `alertmanager.yml` is never overwritten, so add the
`SwatGPTBackupStale` -> `SwatGPTBackupRunFailed` inhibit rule to it by hand (`gull-install.sh` warns
while it is missing).

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
| `SwatGPTBackupStale` | newest complete backup on eagle older than 36h for 15m | critical |
| `SwatGPTBackupRunFailed` | last `backup.sh` run failed, for 5m (inhibited once `SwatGPTBackupStale` fires) | warning |
| `SwatGPTBackupMetricsMissing` | eagle's node_exporter is up but exports no `swatgpt_backup_*` metrics, for 2h | warning |
| `SwatGPTBackupRestoreTestStale` | no passing `verify.sh` restore test in 8 days, for 1h | warning |
| `SwatGPTBackupRestoreTestMissing` | at least 8 backups retained but `verify.sh` has never written metrics, for 1h | warning |
| `SwatGPTBackupSizeDropped` | `swatgpt_backup_size_bytes` for `mongo.archive.gz` or `qdrant.snapshot` under 50% of its 7-day maximum, for 1h (a dump of an emptied database still "succeeds") | warning |

Without a blackbox exporter, `/readyz` is covered indirectly: the compose `healthcheck` on the `api`
service hits `/readyz` every 30 s (visible in `docker compose ps`), the deploy workflow polls it, and
`SwatGPTAppDown` fires when the process stops answering scrapes.

Every rule carries a `runbook_url` annotation pointing at its heading in the next section, and the
Alertmanager message template prints it. Notification titles come from the group labels
(`[FIRING:n] <alertname>`), not from `CommonAnnotations.summary`, which is empty whenever the grouped
summaries differ (the Dash MCP ones embed `kind`/`domain`). `monitoring/tests/hardening.test.mjs`
fails if a rule has no `runbook_url` or its anchor has no heading here.

## Runbooks

vLLM and TEI run as the `swatgpt_vllm` swarm stack managed from gull (`ops/vllm/README.md`); the
app, Dash MCP, exporters and backups run on eagle from `/srv/SwatGPT` (`docker compose` there).
Production changes on either host are planned and approved first.

### SwatGPTVllmDown

Chat is down for everyone. On gull: `docker service ps swatgpt_vllm_vllm --no-trunc` and
`docker service logs --since 10m swatgpt_vllm_vllm`. A restart takes about 12 minutes (weights
load); if the GPU is wedged (`nvidia-smi` on loon hangs or shows no process), the host needs a
reboot. Once `up{job="vllm"}` is 1 again, send one chat from SwatGPT to confirm.

### SwatGPTVllmQueueing

Requests are waiting for a slot. Check `vllm:num_requests_running` against `--max-num-seqs` (96)
and `vllm:kv_cache_usage_perc` on the dashboard. Sustained queueing at low concurrency means long
prompts or a lost prefix cache; see `SwatGPTVllmKvCacheHigh`. A one-off spike during a class
assignment clears on its own; do not restart vLLM for it.

### SwatGPTVllmTtftHigh

p95 time to first token is above 5 s. Usually a symptom of `SwatGPTVllmQueueing` or
`SwatGPTVllmKvCacheHigh`; check those first. If neither fires, compare
`ops/vllm/metrics.sh http://loon.sccs.swarthmore.edu:8000/metrics` with a saved baseline for a
drop in prefix-cache hit rate (a system-prompt or KB-context change invalidates it).

### SwatGPTVllmKvCacheHigh

KV cache above 90% leads to preemption and queueing. Lowering `--max-num-seqs` or
`--max-model-len`, or shortening the system prompt and KB context, are the levers; all but the
app-side ones need a vLLM restart (about 12 minutes) in a change window.

### SwatGPTTeiDown

Embeddings (`:8001`) or the reranker (`:8002`) is down; retrieval fails open, so users silently
lose the knowledge base. On gull: `docker service ps swatgpt_vllm_tei-embeddings swatgpt_vllm_tei-reranker`
and their logs. TEI restarts in under a minute. Confirm with a KB question in SwatGPT afterwards.

### SwatGPTRetrievalFailureRatioHigh

More than 20% of retrievals time out or error. If `SwatGPTTeiDown` is not firing, check Qdrant on
eagle (`docker compose logs --since 15m qdrant`, `curl -s localhost:6333/readyz`) and the app's
retrieval timeouts in the api logs (`[retrieveKbContext]`). The dashboard's by-result panel shows
whether it is `timeout` (slow TEI/Qdrant) or `error` (unreachable or a bad response).

### SwatGPTRetrievalDisabled

The app is running without `TEI_EMBEDDINGS_URL`, `TEI_RERANK_URL` or `QDRANT_URL`. Compare
`/srv/SwatGPT/.env` on eagle with `.env.example`; a deploy that recreated `api` after an `.env`
edit which replaced the file's inode is the usual cause (`ops/eagle/README.md`, section 2).
Fix the variable and `docker compose up -d --force-recreate --no-deps api`.

### SwatGPTAppDown

Prometheus cannot scrape `eagle:3080/metrics`. First `curl -s -o /dev/null -w '%{http_code}\n'
http://localhost:3080/readyz` on eagle: a 200 there with the alert firing means the scrape token
is wrong (a 401 counts as down); see B.2 to rotate it. Otherwise `docker compose ps` and
`docker compose logs --tail=100 api`; if a deploy just ran, the workflow's rollback step may
already be restoring the previous image.

### SwatGPTReadyzFailing

The blackbox probe of `/readyz` fails while the exporter may still answer. The app cannot reach
MongoDB or has not finished starting. On eagle: `docker compose ps`, `docker compose logs --tail=100
api mongodb`. Requires the optional blackbox job in `swatgpt-jobs.yml`.

### SwatGPTApp5xxRateHigh

More than 2% of responses are 5xx. Check the vLLM and TEI alerts first (a dead backend turns
every chat into a 5xx). Otherwise `docker compose logs --since 10m api | grep -iE 'error|5[0-9]{2}'`
on eagle and the latency panels; the ratio is over all routes, so one broken endpoint under load
is enough.

### SwatGPTMcpDown

Prometheus cannot scrape `eagle:3001/metrics`. On eagle: `docker compose ps swatgpt-mcp`,
`docker compose logs --tail=100 swatgpt-mcp`, and `curl -s localhost:3001/metrics | head`. If the
container is healthy but the scrape fails, the `3001` firewall rule or the
`SWATGPT_MCP_ALLOWED_HOSTS` entry is missing (A.4 and the Dash MCP note above).

### SwatGPTMcpPollFailing

Every poll of one kind failed with no success for an hour (three hours for `configuration`).
`docker compose logs --since 1h swatgpt-mcp | grep 'Polling job failed'` shows the upstream error.
A Dash outage clears on its own; a schema change needs a fix in `dash_mcp/` and a deploy. Tools
keep serving the last snapshot meanwhile.

### SwatGPTMcpPollStale

A poll kind has not succeeded for three intervals, with no error counted either: the scheduler
stopped or a poll is hanging on the job lock. `docker compose logs --since 30m swatgpt-mcp` and,
if nothing is logged at all, `docker compose restart swatgpt-mcp`.

### SwatGPTMcpSnapshotStale

Polls report success but no fresh rows are stored. For `hours`, `news` and `resources` this is
usually an upstream schema change that parses to zero records; check the raw Dash response
against the parser in `dash_mcp/src/`. For `weather` and `transit` it means the stored row is
old even though the poll ran; look at the poll logs for the domain.

### SwatGPTMcpToolErrorRatioHigh

More than 20% of Dash MCP tool calls from the app fail. If no other MCP alert is firing, the
failures are per-tool: `docker compose logs --since 15m swatgpt-mcp | grep -i error`, and the
dashboard's by-tool panel. A model passing bad arguments at volume shows up here too; compare
with the `swatgpt_mcp_tool_calls_total{result}` breakdown.

### SwatGPTEagleExporterDown

node_exporter (`:9100`) or cadvisor (`:8080`) is unreachable. On eagle: `docker compose ps
node-exporter cadvisor` and `docker compose up -d node-exporter cadvisor`. If both are up, the
firewall rule for gull is missing (A.4). Backup alerts read from `:9100`, so they are blind
while this fires.

### SwatGPTEagleDiskHigh

`/` on eagle is above 85%. `docker system df` first; then `docker builder prune -f --filter
until=168h` and `docker image prune -f` (the deploy workflow already does both). Container logs
are capped by the json-file options; if a volume is growing, `du -sh /var/lib/docker/volumes/*`
tells which. MongoDB and Meilisearch stop writing when the disk fills.

### SwatGPTEagleMemoryLow

Less than 10% of RAM is available. `docker stats --no-stream` shows which container is growing
(MongoDB's cache, Meilisearch, or the app). A restart of the offender buys time; a persistent
climb needs the VM's memory raised on nest (`context/eagle.md`).

### SwatGPTBackupStale

No complete backup for 36 hours. On eagle: `systemctl status swatgpt-backup.service`,
`journalctl -u swatgpt-backup.service -n 100`, and `ls -la /srv/backup/swatgpt`. Run
`sudo systemctl start swatgpt-backup.service` by hand once the cause (disk, a stopped service,
Qdrant alias) is fixed. `ops/backup/README.md` has the setup and restore runbook.

### SwatGPTBackupMetricsMissing

node_exporter is up but exports no `swatgpt_backup_*` metrics. Either the backup timer was never
installed (`ops/backup/README.md`, step 4), `/var/lib/node_exporter/textfile_collector` is missing
or unreadable, or node-exporter lost its `--collector.textfile.directory` flag. `cat
/var/lib/node_exporter/textfile_collector/swatgpt_backup.prom` on eagle tells which.

### SwatGPTBackupRunFailed

Last night's backup failed; older backups are intact. `journalctl -u swatgpt-backup.service -n 100`
on eagle names the failing component (`mongo`, `postgres`, `qdrant` or `files`). Fix and start the
service by hand. It becomes `SwatGPTBackupStale` after 36 hours.

### SwatGPTBackupRestoreTestStale

No passing restore test in 8 days. `journalctl -u swatgpt-backup-verify.service -n 200` on eagle
shows which component failed to restore; `systemctl list-timers swatgpt-backup-verify.timer`
confirms the timer is live. A backup that does not restore is not a backup: treat a repeated
failure as `SwatGPTBackupStale`.

### SwatGPTBackupRestoreTestMissing

Backups exist but `verify.sh` has never written metrics. Enable the timer:
`sudo systemctl enable --now swatgpt-backup-verify.timer` and run it once by hand
(`ops/backup/README.md`, step 4).

### SwatGPTBackupSizeDropped

The newest `mongo.archive.gz` or `qdrant.snapshot` is under half the size of any backup in the
last week, which is what a dropped collection, a `kb` alias pointing at an empty collection, or a
dump taken during a restore looks like. On eagle, `grep '^size\.' /srv/backup/swatgpt/*/MANIFEST`
shows when it shrank; compare `estimatedDocumentCount()` in MongoDB and `points_count` of `kb`
in Qdrant with the counts in the last passing `journalctl -u swatgpt-backup-verify.service`. If
data was lost, restore from the last large backup (`ops/backup/README.md`, restore runbook)
before retention prunes it. A deliberate purge (for example a KB re-ingest with fewer chunks)
clears after a week.

## Tests

`monitoring/tests/` checks this directory and the compose hardening before anything reaches eagle
or gull:

```sh
# compose hardening, firewall/script behavior (runs the scripts against stubbed iptables/docker/sudo)
node --test monitoring/tests/hardening.test.mjs          # needs js-yaml from the repo's node_modules
# alert rule unit tests and config syntax
docker run --rm -v "$PWD/monitoring:/m:ro" --entrypoint promtool prom/prometheus:v3.5.0 test rules /m/tests/swatgpt-alerts.test.yml
docker run --rm -v "$PWD:/r:ro" --entrypoint promtool prom/prometheus:v3.5.0 test rules /r/ops/backup/test/alerts.test.yml   # swatgpt-backup group
docker run --rm -v "$PWD/monitoring:/m:ro" --entrypoint promtool prom/prometheus:v3.5.0 check rules /m/prometheus/swatgpt-alerts.yml
docker run --rm -v "$PWD/monitoring:/m:ro" --entrypoint amtool prom/alertmanager:v0.28.1 check-config /m/alertmanager/alertmanager.yml
```
