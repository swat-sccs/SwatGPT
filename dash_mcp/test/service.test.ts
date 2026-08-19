import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { SwatService } from '../src/service.js';
import type { PgStore } from '../src/storage/store.js';
import type { DashClient } from '../src/upstream/client.js';
import type { RegistryDiscovery } from '../src/upstream/discovery.js';

describe('PostgreSQL-first service reads', () => {
  it('starts from PostgreSQL when Dash discovery is temporarily unavailable', async () => {
    const store = { migrate: vi.fn().mockResolvedValue(undefined) } as unknown as PgStore;
    const discovery = { load: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as RegistryDiscovery;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const service = new SwatService(config(), {} as DashClient, discovery, store);

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(store.migrate).toHaveBeenCalledOnce();
    expect(discovery.load).toHaveBeenCalledOnce();
    stderr.mockRestore();
  });

  it('returns cached content without contacting Dash', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([{ title: 'Cached feature', source: 'The Dash' }]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getMindCandy();

    expect(result.items).toEqual([{ title: 'Cached feature', source: 'The Dash' }]);
    expect(result.meta.stale).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('returns an immediate non-error result while the first snapshot is still empty', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getAlerts();

    expect(result.items).toEqual([]);
    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('background synchronization');
    expect(client.query).not.toHaveBeenCalled();
  });
});

function config() {
  return loadConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false',
  });
}
