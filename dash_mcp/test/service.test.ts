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

  it('fetches and persists a dining menu when the matching cache entry is absent', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        data: [{
          id: 'lunch-1', title: 'Lunch', description: '<b>World of Flavor</b><ul><li>Tacos</li></ul>',
          startdate: '2026-09-08T11:00:00-04:00', enddate: '2026-09-08T14:00:00-04:00',
        }],
      }),
    } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({
        dining: [{ location: 'Dining Center', kind: 'cbord', sourceId: 'DCC', labels: [], displayUpcoming: true }],
      }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const result = await service.getDining({
      location: 'Sharples Dining Hall', date: '2026-09-08', query: "what's for lunch?",
    });

    expect(client.query).toHaveBeenCalledWith('DiningMenu', expect.any(String), expect.objectContaining({
      calendarId: 'DCC',
    }));
    expect(store.replaceSourceRecords).toHaveBeenCalledOnce();
    expect(result.items).toEqual([expect.objectContaining({
      title: 'Lunch', description: expect.stringContaining('Tacos'), source: 'Dining Center',
    })]);
    expect(result.meta.stale).toBe(false);
  });

  it('serves fresh matching dining data without making a GraphQL request', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([{
        id: 'lunch-1', title: 'Lunch', description: 'Tacos', source: 'Dining Center',
        start: '2026-09-08T11:00:00-04:00', end: '2026-09-08T14:00:00-04:00',
      }]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getDining({ location: 'Sharples', date: '2026-09-08', meal: 'lunch' });

    expect(result.items).toHaveLength(1);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('returns a structured warning if both the dining cache and live lookup are unavailable', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(undefined),
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({
        dining: [{ location: 'Dining Center', kind: 'cbord', sourceId: 'DCC', labels: [], displayUpcoming: true }],
      }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const result = await service.getDining({ location: 'Sharples', date: '2026-09-08', meal: 'lunch' });

    expect(result.items).toEqual([]);
    expect(result.meta.warning).toContain('live Dash lookup failed: Dash offline');
  });
});

function config() {
  return loadConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false',
  });
}
