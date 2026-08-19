import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { createMcpServer } from '../src/mcp/tools.js';
import type { SwatService } from '../src/service.js';

describe('MCP protocol surface', () => {
  it('advertises the bounded student-facing tools and calls one', async () => {
    const mockResult = { items: [{ title: 'A campus fact' }], meta: {
      source: ['The Dash'], fetched_at: new Date().toISOString(), data_as_of: new Date().toISOString(),
      stale: false, total: 1, returned: 1, truncated: false,
    } };
    const service = { getMindCandy: vi.fn().mockResolvedValue(mockResult) } as unknown as SwatService;
    const server = createMcpServer(service);
    const client = new Client({ name: 'swatgpt-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'get_alerts', 'get_weather', 'get_campus_hours', 'get_dining_menus', 'search_campus_events',
      'search_campus_news', 'get_transit_departures', 'get_sports', 'get_mind_candy',
      'get_campus_resources', 'search_archive', 'get_data_status',
    ]));
    expect(tools.tools).toHaveLength(12);

    const result = await client.callTool({ name: 'get_mind_candy', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(mockResult);
    expect(service.getMindCandy).toHaveBeenCalledOnce();

    await client.close();
    await server.close();
  });

  it('turns a stuck handler into a bounded MCP error response', async () => {
    const service = {
      config: { mcpToolTimeoutMs: 20 },
      getMindCandy: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as SwatService;
    const server = createMcpServer(service);
    const client = new Client({ name: 'swatgpt-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'get_mind_candy', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'MCP tool timed out after 20ms' }),
    ]));

    await client.close();
    await server.close();
  });
});
