import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { SwatHttpServer } from '../src/http.js';
import type { SwatService } from '../src/service.js';

const servers: SwatHttpServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('LibreChat streamable-http handshake', () => {
  it('lists tools and returns campus hours through the SDK 1.30 client LibreChat uses', async () => {
    const hours = vi.fn().mockResolvedValue(hoursResult('Sharples Dining Hall'));
    const { port } = await listen(hours);
    const started = performance.now();

    const client = new Client({ name: 'librechat', version: '1.30.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'get_alerts', 'get_weather', 'get_campus_hours', 'get_open_now', 'get_dining_menus', 'search_campus_events',
      'search_campus_news', 'get_transit_departures', 'get_sports', 'get_mind_candy',
      'get_campus_resources', 'search_archive', 'get_data_status',
    ]));
    expect(listed.tools).toHaveLength(13);

    const result = await client.callTool({ name: 'get_campus_hours', arguments: { place: 'Sharples' } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ place: 'Sharples Dining Hall' }],
      meta: { stale: false },
    });
    expect(hours).toHaveBeenCalledWith({ place: 'Sharples', limit: 60 });
    expect(performance.now() - started).toBeLessThan(500);

    await client.close();
  });

  it('serves Prometheus metrics that reflect tool calls', async () => {
    const { port } = await listen();
    const client = new Client({ name: 'librechat', version: '1.30.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await client.callTool({ name: 'get_campus_hours', arguments: { place: 'Sharples' } });
    await client.close();

    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toMatch(/swatgpt_mcp_tool_calls_total\{tool="get_campus_hours",result="success"\} [1-9]/);
    expect(body).toMatch(/# TYPE swatgpt_mcp_snapshot_age_seconds gauge/);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await health.json()).toEqual({ status: 'ok' });
  });

  it('reports operator status as JSON without leaking the database URL', async () => {
    const { port } = await listen();
    await initialize(port);

    const response = await fetch(`http://127.0.0.1:${port}/status`);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      sessions: { active: 1, pending: 0, max: 256 },
      registry: { hours_sources: 2, dining_sources: 1 },
      polling: { enabled: false, tool_timeout_ms: 5_000 },
      snapshots: { hours: { age_seconds: expect.any(Number) }, weather: null },
      sync_runs: [{ job: 'alerts', status: 'success' }],
    });
    expect((body.snapshots as { hours: { age_seconds: number } }).hours.age_seconds).toBeGreaterThanOrEqual(60);
    expect(JSON.stringify(body)).not.toContain('postgres://');
  });

  it('accepts a 2025-03-26 initialize POST and serves tools/list on the new session immediately', async () => {
    const { port } = await listen();
    const started = performance.now();

    const initialized = await mcpRequest(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'librechat', version: '0' },
      },
    });

    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(jsonRpcMethod(initialized.body)).toMatchObject({
      id: 1,
      result: expect.objectContaining({ protocolVersion: expect.any(String) }),
    });

    await mcpRequest(port, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, sessionId);

    const listed = await mcpRequest(port, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }, sessionId);

    expect(listed.status).toBe(200);
    const tools = jsonRpcMethod(listed.body).result?.tools as Array<{ name: string }> | undefined;
    expect(tools?.map((tool) => tool.name)).toContain('get_campus_hours');
    expect(performance.now() - started).toBeLessThan(400);
  });

  it('accepts the Docker service Host header LibreChat sends', async () => {
    const { port } = await listen(undefined, 'swatgpt-mcp,localhost,127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        host: 'swatgpt-mcp:3000',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'librechat', version: '0' },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeTruthy();
  });
});

async function listen(
  getHours = vi.fn().mockResolvedValue(hoursResult('Sharples Dining Hall')),
  allowedHosts = '127.0.0.1,localhost',
  env: Record<string, string> = {},
) {
  const port = await freePort();
  const service = {
    config: { mcpToolTimeoutMs: 5_000 },
    store: { ping: async () => true, status: async () => [{ job: 'alerts', status: 'success' }] },
    registry: () => ({
      loadedAt: '2026-10-26T00:00:00.000Z', hashes: ['test'], hours: [{}, {}], dining: [{}], news: [], announcementCalendars: [], resources: [],
    }),
    snapshotObservedAt: async (domain: string) => domain === 'hours' ? new Date(Date.now() - 60_000).toISOString() : undefined,
    getHours,
  } as unknown as SwatService;
  const server = new SwatHttpServer(loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    MCP_ALLOWED_HOSTS: allowedHosts,
    POLLING_ENABLED: 'false',
    DATABASE_URL: 'postgres://unused',
    ...env,
  }), service);
  await server.listen();
  servers.push(server);
  return { port, getHours, server };
}

describe('MCP session lifecycle', () => {
  it('expires sessions a client abandoned without sending DELETE', async () => {
    const { port, server } = await listen(undefined, undefined, { MCP_SESSION_IDLE_SECONDS: '60' });
    const sessionId = (await initialize(port)).headers.get('mcp-session-id');
    expect(server.sessionCount).toBe(1);

    expect(await server.sweepIdleSessions(Date.now() + 30_000)).toBe(0);
    expect(await server.sweepIdleSessions(Date.now() + 61_000)).toBe(1);

    expect(server.sessionCount).toBe(0);
    const swept = await mcpRequest(port, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, sessionId);
    expect(swept.status).toBe(404);
  });

  it('never sweeps a session whose event stream is still open', async () => {
    const { port, server } = await listen(undefined, undefined, { MCP_SESSION_IDLE_SECONDS: '60' });
    const client = new Client({ name: 'librechat', version: '1.30.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await waitFor(() => openStreams(server) > 0);

    expect(await server.sweepIdleSessions(Date.now() + 3_600_000)).toBe(0);
    expect(server.sessionCount).toBe(1);
    await client.close();
  });

  it('does not keep a session for an initialize the transport rejected', async () => {
    const { port, server } = await listen();
    const rejected = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/plain' },
      body: JSON.stringify(initializeBody()),
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.status).toBeLessThan(500);
    expect(server.sessionCount).toBe(0);
  });

  it('honours the cap when initializes arrive concurrently', async () => {
    const { port, server } = await listen(undefined, undefined, { MCP_MAX_SESSIONS: '1' });
    const connect = McpServer.prototype.connect;
    const slowConnect = vi.spyOn(McpServer.prototype, 'connect').mockImplementation(async function (this: McpServer, transport) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return connect.call(this, transport);
    });

    try {
      const responses = await Promise.all([mcpRequest(port, initializeBody()), mcpRequest(port, initializeBody())]);
      const statuses = responses.map((response) => response.status);
      expect(statuses).toContain(200);
      for (const status of statuses) expect([200, 503]).toContain(status);
      expect(server.sessionCount).toBe(1);
    } finally {
      slowConnect.mockRestore();
    }

    expect((await initialize(port)).headers.get('mcp-session-id')).toBeTruthy();
    expect(server.sessionCount).toBe(1);
  });

  it('evicts the least recently used idle session at the cap', async () => {
    const { port, server } = await listen(undefined, undefined, { MCP_MAX_SESSIONS: '1' });
    const first = (await initialize(port)).headers.get('mcp-session-id');
    const second = (await initialize(port)).headers.get('mcp-session-id');

    expect(second).toBeTruthy();
    expect(server.sessionCount).toBe(1);
    expect((await mcpRequest(port, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, first)).status).toBe(404);
  });
});

function initializeBody() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'librechat', version: '0' } },
  };
}

async function initialize(port: number) {
  const response = await mcpRequest(port, initializeBody());
  expect(response.status).toBe(200);
  return response;
}

function openStreams(server: SwatHttpServer): number {
  const sessions = (server as unknown as { sessions: Map<string, { openRequests: number }> }).sessions;
  return [...sessions.values()].reduce((total, session) => total + session.openRequests, 0);
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function mcpRequest(port: number, body: unknown, sessionId?: string | null) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

function jsonRpcMethod(raw: string): { id?: unknown; result?: { tools?: Array<{ name: string }>; protocolVersion?: string } } {
  const json = raw.trim().startsWith('event:')
    ? JSON.parse(raw.split('\n').find((line) => line.startsWith('data:'))?.slice(5) ?? '{}')
    : JSON.parse(raw);
  return json;
}

function hoursResult(place: string) {
  const now = new Date().toISOString();
  return {
    items: [{ place, hours: '7:30 AM – 7:30 PM' }],
    meta: {
      source: ['The Dash'],
      fetched_at: now,
      data_as_of: now,
      stale: false,
      total: 1,
      returned: 1,
      truncated: false,
    },
  };
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('could not allocate a TCP port'));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}
