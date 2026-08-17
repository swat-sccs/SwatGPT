# SwatGPT MCP

SwatGPT MCP is an unofficial, read-only Model Context Protocol server for public data displayed by [The Dash](https://dash.swarthmore.edu/). It provides current student-friendly tools and a PostgreSQL-backed history of observed changes.

## Data and tools

The server discovers current Dash configuration and exposes alerts, weather, campus hours, dining menus, events, news, SEPTA departures, sports, Mind Candy, campus resources, archive search, and synchronization status. It does not expose arbitrary GraphQL queries or private Dash sessions.

Each response includes source, retrieval time, data time, truncation, and stale-data metadata. Historical entity versions are retained indefinitely; high-frequency weather and transit observations default to 30 days.

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
