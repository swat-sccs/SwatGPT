import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
      'get_alerts', 'get_weather', 'get_campus_hours', 'get_dining_menus', 'search_campus_events',
      'search_campus_news', 'get_transit_departures', 'get_sports', 'get_mind_candy',
      'get_campus_resources', 'search_archive', 'get_data_status',
    ]));
    expect(listed.tools).toHaveLength(12);

    const result = await client.callTool({ name: 'get_campus_hours', arguments: { place: 'Sharples' } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      items: [{ place: 'Sharples Dining Hall' }],
      meta: { stale: false },
    });
    expect(hours).toHaveBeenCalledWith({ place: 'Sharples', limit: 30 });
    expect(performance.now() - started).toBeLessThan(500);

    await client.close();
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
) {
  const port = await freePort();
  const service = {
    config: { mcpToolTimeoutMs: 5_000 },
    store: { ping: async () => true },
    registry: () => ({ hashes: ['test'] }),
    getHours,
  } as unknown as SwatService;
  const server = new SwatHttpServer(loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    MCP_ALLOWED_HOSTS: allowedHosts,
    POLLING_ENABLED: 'false',
    DATABASE_URL: 'postgres://unused',
  }), service);
  await server.listen();
  servers.push(server);
  return { port, getHours };
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
