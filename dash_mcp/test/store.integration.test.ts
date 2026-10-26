import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { PgStore } from '../src/storage/store.js';
import { SwatService, TRANSIT_PAIRS } from '../src/service.js';
import { campusDayRange, currentCampusDate } from '../src/util.js';
import type { NormalizedRecord } from '../src/types.js';
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
    await store.pool.query('TRUNCATE source_records, observations, sync_runs, domain_sync RESTART IDENTITY CASCADE');
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

  it('keeps today\'s polled hours after a read-through for another day', async () => {
    const client = { query: vi.fn().mockImplementation(diningResponse) } as unknown as DashClient;
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    await service.getHours({ date: today, limit: 100 }, true);
    await service.getHours({ place: 'McCabe', date: tomorrow });
    vi.mocked(client.query).mockClear();

    const todayResult = await service.getHours({ place: 'McCabe', date: today });

    expect(todayResult.items).toEqual([expect.objectContaining({ id: `lunch-${today}` })]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('treats a successful poll that returned no alerts as fresh data', async () => {
    const client = {
      query: vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === 'CriticalAnnouncement'
        ? { data: { showMessage: 0 } }
        : { calendarName: 'Announcements', data: [] })),
    } as unknown as DashClient;
    const discovery = { current: () => ({ announcementCalendars: ['cal'], appAnnouncements: [] }) } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    expect(await service.snapshotObservedAt('alerts')).toBeUndefined();
    const before = Date.now();
    await service.getAlerts(100, true);

    const cached = await service.getAlerts(20);
    expect(cached.items).toEqual([]);
    expect(cached.meta.stale).toBe(false);
    expect(cached.meta.warning).toBeUndefined();
    const observed = await service.snapshotObservedAt('alerts');
    expect(new Date(observed!).getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('marks only the fetched day as synced on a read-through', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const service = new SwatService(config(), client, diningDiscovery(), store);

    await service.getDining({ location: 'Sharples', date: tomorrow });

    const scopes = await store.pool.query<{ scope: string }>('SELECT scope FROM domain_sync WHERE domain = $1', ['dining']);
    expect(scopes.rows.map((row) => row.scope)).toEqual([tomorrow]);
  });

  it('retires alerts from an announcement calendar that disappeared upstream', async () => {
    let calendarName = 'Old Announcements';
    const client = {
      query: vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === 'CriticalAnnouncement'
        ? { data: { showMessage: 0 } }
        : { calendarName, data: [{ id: `${calendarName}-1`, title: `${calendarName} notice` }] })),
    } as unknown as DashClient;
    const discovery = { current: () => ({ announcementCalendars: ['cal'], appAnnouncements: [] }) } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await service.getAlerts(20, true);
    calendarName = 'Campus Announcements';
    vi.mocked(client.query).mockClear();
    await service.getAlerts(20, true);

    const alerts = await service.getAlerts(20);
    expect(alerts.items).toEqual([expect.objectContaining({ title: 'Campus Announcements notice' })]);
  });

  it('keeps the snapshot active when a poll sees a malformed upstream payload', async () => {
    const client = { query: vi.fn().mockImplementation(diningResponse) } as unknown as DashClient;
    const service = new SwatService(config(), client, diningDiscovery(), store);
    await service.getDining({ date: today, limit: 100 }, true);
    vi.mocked(client.query).mockResolvedValue({ data: null });

    await expect(service.getDining({ date: today, limit: 100 }, true)).rejects.toThrow('not an array');

    expect(await store.currentRecords('dining')).toEqual([expect.objectContaining({ id: `lunch-${today}` })]);
  });

  it('prunes old history but keeps every record\'s newest version and active rows', async () => {
    const record = (id: string, title: string) => ({
      domain: 'news' as const, source: 'News', externalId: id, title, searchText: title, payload: { title },
    });
    const long = new Date(Date.now() - 400 * 86_400_000);
    const recent = new Date(Date.now() - 300 * 86_400_000);
    await store.replaceSourceRecords('news', 'News', [record('kept', 'v1'), record('gone', 'old')], long);
    await store.replaceSourceRecords('news', 'News', [record('kept', 'v2')], recent);
    await store.replaceSourceRecords('news', 'Other', [record('fresh', 'only')], long);
    await store.pool.query("INSERT INTO sync_runs(job, started_at) VALUES ('alerts', now() - interval '45 days'), ('alerts', now())");

    const archive = await store.pruneArchive(180);
    const syncRuns = await store.pruneSyncRuns(30);

    expect(archive).toEqual({ records: 1, versions: 1 });
    expect(syncRuns).toBe(1);
    const versions = await store.pool.query<{ external_id: string; title: string }>(`
      SELECT sr.external_id, rv.payload->>'title' AS title FROM record_versions rv
      JOIN source_records sr ON sr.id = rv.record_id ORDER BY sr.external_id
    `);
    expect(versions.rows).toEqual([{ external_id: 'fresh', title: 'only' }, { external_id: 'kept', title: 'v2' }]);
  });

  it('serves the soonest events and the newest news when a limit truncates the snapshot', async () => {
    const record = (id: string, fields: Partial<NormalizedRecord>) => ({
      domain: 'events' as const, source: 'SwatCentral', externalId: id, title: id, searchText: id, payload: {}, ...fields,
    });
    const day = (offset: number) => new Date(Date.UTC(2030, 0, 1 + offset)).toISOString();
    const shuffled = [7, 2, 9, 0, 5, 3, 8, 1, 6, 4];
    await store.replaceSourceRecords('events', 'SwatCentral', [
      record('undated', {}),
      ...shuffled.map((offset) => record(`event-${offset}`, { start: day(offset) })),
    ]);
    await store.replaceSourceRecords('news', 'News', shuffled.map((offset) => record(`post-${offset}`, {
      domain: 'news', source: 'News', published: day(offset),
    })));

    expect((await store.currentRecords('events', 3)).map((item) => item.id)).toEqual(['event-0', 'event-1', 'event-2']);
    expect((await store.currentRecords('news', 3)).map((item) => item.id)).toEqual(['post-9', 'post-8', 'post-7']);
    expect((await store.currentRecords('events')).at(-1)?.id).toBe('undated');
  });

  it('returns every hours source on a default read even when the registry lists more than 30', async () => {
    const places = Array.from({ length: 40 }, (_, index) => `Place ${index}`);
    const client = { query: vi.fn().mockImplementation(diningResponse) } as unknown as DashClient;
    const discovery = {
      current: () => ({ hours: places.map((place) => ({ place, category: 'Offices', kind: 'google', sourceId: place })) }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);
    await service.getHours({ date: today, limit: 100 }, true);
    vi.mocked(client.query).mockClear();

    const result = await service.getHours({});

    expect(result.items).toHaveLength(40);
    expect(result.meta.truncated).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('retires only the named domain\'s missing sources', async () => {
    const record = (id: string) => ({ domain: 'news' as const, source: 'News', externalId: id, title: id, searchText: id, payload: {} });
    await store.replaceSourceRecords('news', 'Kept', [record('a')]);
    await store.replaceSourceRecords('news', 'Vanished', [record('b')]);
    await store.replaceSourceRecords('events', 'SwatCentral', [{ ...record('c'), domain: 'events' }]);

    expect(await store.deactivateMissingSources('news', ['Kept'])).toBe(1);

    expect((await store.currentRecords('news')).map((item) => item.id)).toEqual(['a']);
    expect(await store.currentRecords('events')).toHaveLength(1);
  });
});

function hoursDiscovery(): RegistryDiscovery {
  return {
    current: () => ({
      hours: [{ place: 'McCabe Library', category: 'Libraries', kind: 'libcal', sourceId: 'mccabe' }],
    }),
  } as unknown as RegistryDiscovery;
}

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
