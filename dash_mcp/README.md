# SwatGPT MCP

SwatGPT MCP is an unofficial, read-only Model Context Protocol server for public data displayed by [The Dash](https://dash.swarthmore.edu/). It provides current student-friendly tools and a PostgreSQL-backed history of observed changes.

## Data and tools

The server discovers current Dash configuration and exposes alerts, weather, campus hours, dining menus, events, news, SEPTA departures, sports, Mind Candy, campus resources, archive search, and synchronization status. It does not expose arbitrary GraphQL queries or private Dash sessions.

Chat-facing tools normally read the latest PostgreSQL snapshot, which acts as a shared, persistent cache across MCP instances. Background polling refreshes that snapshot. Dining lookups additionally use a bounded read-through path: when the requested date, meal, or location is absent or stale, the MCP fetches the public Dash GraphQL feed and writes the result back to PostgreSQL. A short deadline keeps an upstream outage from holding a LibreChat response open, and stale cached data remains available as fallback. Each response includes source, retrieval time, data time, truncation, and stale-data metadata. Historical entity versions are retained indefinitely; high-frequency weather and transit observations default to 30 days.

`GET /healthz` reports liveness, `GET /readyz` reports PostgreSQL and registry readiness, and `GET /metrics` exposes Prometheus text-format metrics: `swatgpt_mcp_tool_calls_total{tool,result}` (result is `success`, `error`, or `timeout`), `swatgpt_mcp_upstream_polls_total{kind,result}` (one series per background job: `alerts`, `realtime`, `content`, `configuration`, `retention`; result is `success`, `error`, or `skipped` when another instance holds the job lock), `swatgpt_mcp_snapshot_age_seconds{domain}` (seconds since the newest stored snapshot for each domain), and the standard `swatgpt_mcp_process_*` / `swatgpt_mcp_nodejs_*` runtime metrics. None of these endpoints require authentication, so publish port 3000 only to networks you trust.

`LOG_LEVEL` (`debug`, `info`, `warn`, or `error`; default `info`) sets the minimum severity written to stderr as NDJSON.

The container probes its HTTP health endpoint every 30 seconds. After three consecutive failed or timed-out probes, its watchdog force-terminates the unresponsive server process; Compose's `restart: unless-stopped` policy then restarts it. `HEALTHCHECK_PROBE_TIMEOUT_MS` and `HEALTHCHECK_FAILURE_THRESHOLD` can tune the 4-second probe timeout and three-failure threshold.

## Quick start

```sh
cp .env.example .env
# Replace both occurrences of the sample PostgreSQL password in .env.
docker compose up --build -d
docker compose ps
```

The standalone Compose file deliberately publishes no ports. To inspect it locally, run a one-off request from its network or temporarily add a localhost-only port mapping for development. For the supported LibreChat integration, follow [LIBRECHAT_SETUP.md](./LIBRECHAT_SETUP.md).

## Local development

Node.js 20+ and PostgreSQL are required.

```sh
npm ci
DATABASE_URL=postgres://swatgpt:password@localhost:5432/swatgpt POLLING_ENABLED=false npm run dev
npm test
npm run build
```

Run the opt-in upstream contract test with `npm run test:live`; ordinary tests never require internet access.

Database migrations run automatically and idempotently during startup. The raw browser HAR is development evidence only and is ignored by Git and Docker.

## Notice

This project is not an official Swarthmore College service. Public upstream data may change or become unavailable. Respect the source site's terms and avoid reducing the configured polling intervals without authorization.
