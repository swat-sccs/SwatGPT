# Connect SwatGPT MCP to LibreChat

This guide runs SwatGPT MCP and PostgreSQL as private sidecars in the same Docker Compose project and network as LibreChat. Neither service publishes a host port.

## 1. Prepare SwatGPT

From this repository, install dependencies and verify the build:

```sh
npm ci
npm test
npm run build
```

Generate a URL-safe database password with `openssl rand -hex 32`. In the environment file used to start LibreChat, add:

```dotenv
SWATGPT_MCP_PATH=/absolute/path/to/dash_mcp
SWATGPT_POSTGRES_DB=swatgpt
SWATGPT_POSTGRES_USER=swatgpt
SWATGPT_POSTGRES_PASSWORD=replace-with-a-long-random-password
```

Optional polling overrides are `SWATGPT_ALERT_POLL_INTERVAL_SECONDS`, `SWATGPT_REALTIME_POLL_INTERVAL_SECONDS`, `SWATGPT_CONTENT_POLL_INTERVAL_SECONDS`, `SWATGPT_CONFIG_POLL_INTERVAL_SECONDS`, and `SWATGPT_OBSERVATION_RETENTION_DAYS`.

## 2. Add the Compose sidecars

Copy the two services from `compose.librechat.example.yml` into a LibreChat Compose override, or start LibreChat with both files in one Compose project:

```sh
docker compose \
  -f /path/to/LibreChat/docker-compose.yml \
  -f /absolute/path/to/dash_mcp/compose.librechat.example.yml \
  up --build -d
```

Compose resolves all relative paths from the first file, which is why `SWATGPT_MCP_PATH` must be absolute. The services must be in the same Compose project; starting the two files as unrelated projects creates separate networks and LibreChat will not resolve `swatgpt-mcp`.

Check startup and automatic migrations:

```sh
docker compose \
  -f /path/to/LibreChat/docker-compose.yml \
  -f /absolute/path/to/dash_mcp/compose.librechat.example.yml \
  ps

docker compose \
  -f /path/to/LibreChat/docker-compose.yml \
  -f /absolute/path/to/dash_mcp/compose.librechat.example.yml \
  logs --tail=100 swatgpt-mcp
```

## 3. Configure LibreChat

Merge the following into the existing `librechat.yaml`; do not replace unrelated configuration:

```yaml
mcpSettings:
  allowedAddresses:
    - 'swatgpt-mcp:3000'

mcpServers:
  swatgpt:
    title: 'SwatGPT Campus Data'
    description: 'Read-only current and historical public data from the Swarthmore Dash.'
    type: streamable-http
    url: 'http://swatgpt-mcp:3000/mcp'
    timeout: 30000
    startup: true
    chatMenu: false
    serverInstructions: true
```

`allowedAddresses` is required because LibreChat blocks private and internal MCP targets by default as SSRF protection. `chatMenu: false` keeps SwatGPT agent-only; set it to `true` if you also want it in ordinary chat tool selection.

Restart LibreChat after editing YAML:

```sh
docker compose \
  -f /path/to/LibreChat/docker-compose.yml \
  -f /absolute/path/to/dash_mcp/compose.librechat.example.yml \
  up -d
```

## 4. Give the tools to an agent

1. Open LibreChat's Agent Builder and create or edit the SwatGPT agent.
2. Select **Add tools**, then **MCP**.
3. Choose **SwatGPT Campus Data**.
4. Enable the desired tools. A campus assistant normally enables all except `get_data_status`, which is primarily diagnostic.
5. Save the agent.

Useful verification prompts:

- “What is open on campus today?”
- “What is being served at the Dining Center today?”
- “What events are happening this week?”
- “When are the next trains from Swarthmore to 30th Street?”
- “Show changes to campus alerts during the last seven days.”

## Troubleshooting

- **MCP target blocked / SSRF error:** Confirm `mcpSettings.allowedAddresses` contains exactly `swatgpt-mcp:3000`, then restart LibreChat.
- **Name not resolved:** Confirm LibreChat and `swatgpt-mcp` were launched as one Compose project and appear on the same network with `docker compose ps`.
- **MCP initialization fails:** Inspect `docker compose logs swatgpt-mcp`; the service waits for PostgreSQL and Dash configuration discovery before becoming ready.
- **Database authentication fails:** The password embedded in the generated `DATABASE_URL` must match `SWATGPT_POSTGRES_PASSWORD`. If you changed credentials after the PostgreSQL volume was initialized, update the database role or recreate only the SwatGPT volume if losing history is acceptable.
- **No archive results:** History begins at the first successful poll; the HAR is not imported as production history.
- **Stale response:** The live Dash request failed and the tool deliberately returned the latest archived value. Check upstream connectivity and the response's `warning` field.
- **Tools missing after a YAML edit:** Restart LibreChat or reinitialize the server from its MCP settings panel.

## Operations

Back up history with PostgreSQL's standard tools:

```sh
docker compose exec -T swatgpt-postgres \
  pg_dump -U swatgpt -d swatgpt -Fc > swatgpt-backup.dump
```

Upgrade by pulling the new source and rebuilding only the MCP service. Migrations run automatically:

```sh
docker compose up --build -d swatgpt-mcp
```

The Compose configuration has no `ports` entries. Keep it that way unless you intentionally add authentication and external TLS termination.

References: [LibreChat MCP](https://www.librechat.ai/docs/features/mcp), [MCP server configuration](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers), and [LibreChat MCP network allowlisting](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_settings).
