import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { PgStore } from '../src/storage/store.js';
import { SwatService, TRANSIT_PAIRS } from '../src/service.js';
import { campusDayRange, currentCampusDate } from '../src/util.js';
import type { DashClient } from '../src/upstream/client.js';
import type { RegistryDiscovery } from '../src/upstream/discovery.js';

const databaseUrl = process.env.DASH_TEST_DATABASE_URL;

interface DashVariables {
  timeMin?: string;
  maxResults?: number;
}

describe.skipIf(!databaseUrl)('PostgreSQL-backed service cache', () => {
  let store: PgStore;
  const today = currentCampusDate();
  const tomorrow = addDays(today, 1);

  beforeAll(async () => {
    store = new PgStore(databaseUrl!);
    await store.migrate();
  });

  beforeEach(async () => {
    await store.pool.query('TRUNCATE source_records, observations RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await store.close();
  });

  it('keeps today\'s polled menu cached after a read-through for another day', async () => {
    const client = { query: vi.fn().mockImplementation(diningResponse) } as unknown as DashClient;
    const service = new SwatService(config(), client, diningDiscovery(), store);

    await service.getDining({ date: today, limit: 100 }, true);
    const tomorrowResult = await service.getDining({ location: 'Sharples', date: tomorrow });
    expect(tomorrowResult.items).toEqual([expect.objectContaining({ id: `lunch-${tomorrow}` })]);
    vi.mocked(client.query).mockClear();

    const todayResult = await service.getDining({ location: 'Sharples', date: today });
    const tomorrowCached = await service.getDining({ location: 'Sharples', date: tomorrow });

    expect(todayResult.items).toEqual([expect.objectContaining({ id: `lunch-${today}` })]);
    expect(todayResult.meta.stale).toBe(false);
    expect(tomorrowCached.items).toEqual([expect.objectContaining({ id: `lunch-${tomorrow}` })]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('retires only the fetched day\'s rows on a scoped replace', async () => {
    const client = { query: vi.fn().mockImplementation(diningResponse) } as unknown as DashClient;
    const service = new SwatService(config(), client, diningDiscovery(), store);
    await service.getDining({ date: today, limit: 100 }, true);
    await service.getDining({ location: 'Sharples', date: tomorrow });

    await store.replaceSourceRecords('dining', 'Dining Center', [], undefined, campusDayRange(today));

    expect(await store.currentRecords('dining')).toEqual([expect.objectContaining({ id: `lunch-${tomorrow}` })]);
  });

  it('serves every advertised transit pair from the cache after one realtime poll', async () => {
    const client = { query: vi.fn().mockImplementation(transitResponse) } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    await service.syncRealtime();
    vi.mocked(client.query).mockClear();

    const results = await Promise.all(TRANSIT_PAIRS.map((pair) => service.getTransit({ ...pair, limit: 10 })));

    for (const result of results) {
      expect(result.items).toHaveLength(10);
      expect(result.meta.stale).toBe(false);
    }
    expect(client.query).not.toHaveBeenCalled();
  });
});

function diningResponse(_operation: string, _query: string, variables: DashVariables = {}) {
  const date = currentCampusDate(new Date(variables.timeMin ?? Date.now()));
  return Promise.resolve({
    data: [{
      id: `lunch-${date}`, title: 'Lunch', description: `Menu for ${date}`,
      startdate: offsetIso(variables.timeMin, 15), enddate: offsetIso(variables.timeMin, 18),
    }],
  });
}

function transitResponse(operation: string, _query: string, variables: DashVariables = {}) {
  if (operation === 'Weather') return Promise.resolve({ data: { location: 'Swarthmore' } });
  return Promise.resolve({
    data: Array.from({ length: variables.maxResults ?? 0 }, (_, index) => ({ id: `train-${index}` })),
  });
}

function diningDiscovery(): RegistryDiscovery {
  return {
    current: () => ({
      dining: [{ location: 'Dining Center', kind: 'cbord', sourceId: 'DCC', labels: [], displayUpcoming: true }],
    }),
  } as unknown as RegistryDiscovery;
}

function offsetIso(base: string | undefined, hours: number): string {
  return new Date(new Date(base ?? Date.now()).getTime() + hours * 3_600_000).toISOString();
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function config() {
  return loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl ?? 'postgres://unused', POLLING_ENABLED: 'false' });
}
