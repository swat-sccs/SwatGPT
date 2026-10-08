import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { DashClient, resultData } from '../src/upstream/client.js';

describe('Dash GraphQL client', () => {
  it('sends required JSON headers and coalesces cached calls', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { result: { id: 'ok' } } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false' });
    const client = new DashClient(config, fetchMock);
    const first = await client.query<{ id: string }>('Test', 'query Test { result: test }');
    const second = await client.query<{ id: string }>('Test', 'query Test { result: test }');

    expect(first.id).toBe('ok');
    expect(second.id).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('operationName=Test');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('surfaces GraphQL errors returned with HTTP 200', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'bad query' }] }), { status: 200 }));
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false', UPSTREAM_RETRIES: '0' });
    await expect(new DashClient(config, fetchMock).query('Test', 'query Test { result: test }')).rejects.toThrow('bad query');
  });

  it('reports an actionable timeout instead of the generic abort message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('This operation was aborted', 'AbortError'));
    const config = loadConfig({
      NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false',
      UPSTREAM_TIMEOUT_MS: '25', UPSTREAM_RETRIES: '0',
    });

    await expect(new DashClient(config, fetchMock).query('Test', 'query Test { result: test }'))
      .rejects.toThrow('Dash request timed out after 25ms');
  });

  it('rejects a null data.result instead of caching it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ data: { result: null } }), { status: 200 }));
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false', UPSTREAM_RETRIES: '0' });
    const client = new DashClient(config, fetchMock);

    await expect(client.query('Test', 'query Test { result: test }')).rejects.toThrow('did not contain data.result');
    await expect(client.query('Test', 'query Test { result: test }')).rejects.toThrow('did not contain data.result');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('feed result rows', () => {
  it('returns rows for an array, including a legitimately empty one', () => {
    expect(resultData({ data: [{ id: 'a' }, 'junk'] })).toEqual([{ id: 'a' }]);
    expect(resultData({ data: [] })).toEqual([]);
  });

  it('throws on a shape change so a poll cannot retire the snapshot', () => {
    expect(() => resultData({ data: null })).toThrow('Dash result.data was not an array');
    expect(() => resultData({ items: [] })).toThrow('Dash result.data was not an array');
    expect(() => resultData(null)).toThrow('Dash result.data was not an array');
  });
});
