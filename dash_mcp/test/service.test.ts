import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { campusDayRange, campusWallTime, currentCampusDate } from '../src/util.js';
import { PERSIST_CONCURRENCY, SwatService, TRANSIT_PAIRS, TRANSIT_POLL_LIMIT } from '../src/service.js';
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
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
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
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
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

  it('resolves dining hall aliases and refreshes live when cached hours do not match', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        data: [{
          id: 'dcc-hours', title: 'Dining Center Hours',
          startdate: '2026-09-16T07:30:00-04:00', enddate: '2026-09-16T20:00:00-04:00',
        }],
      }),
    } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({
        hours: [{ place: 'Dining Center', category: 'Dining', kind: 'google', sourceId: 'dcc-hours' }],
      }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const result = await service.getHours({ place: 'dining hall', date: '2026-09-16' });

    expect(client.query).toHaveBeenCalledWith('Calendar', expect.any(String), expect.objectContaining({
      calendarId: 'dcc-hours',
    }));
    expect(result.items).toEqual([expect.objectContaining({
      source: 'Dining Center',
      details: expect.objectContaining({
        campus_aliases: expect.arrayContaining(['Sharples', 'DCC', 'dining hall']),
      }),
    })]);
    expect(result.meta.resolved_date).toBe('2026-09-16');
    expect(result.meta.warning).toBeUndefined();
  });

  it('resolves Sharples against cached Dining Center hours without a live request', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([{
        id: 'dcc-hours', title: 'Dining Center Hours', source: 'Dining Center',
        start: '2026-09-16T07:30:00-04:00', end: '2026-09-16T20:00:00-04:00',
      }]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getHours({ place: 'Sharples', date: '2026-09-16' });

    expect(result.items).toHaveLength(1);
    expect(result.meta.resolved_date).toBe('2026-09-16');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('does not report hours that ended at midnight as the next day\'s hours', async () => {
    const today = currentCampusDate();
    const yesterday = new Date(campusWallTime(today, 0, 0).getTime() - 3_600_000);
    const client = { query: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([
        {
          id: 'late-night', title: 'McCabe Library', source: 'McCabe Library',
          start: new Date(yesterday.getTime() - 3 * 3_600_000).toISOString(), end: campusWallTime(today, 0, 0).toISOString(),
        },
        { id: 'opens-at-midnight', title: 'McCabe Library', source: 'McCabe Library', start: campusWallTime(today, 0, 0).toISOString() },
      ]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({ hours: [{ place: 'McCabe Library', kind: 'libcal', sourceId: 'mccabe' }] }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const todayResult = await service.getHours({ place: 'McCabe' });
    const yesterdayResult = await service.getHours({ place: 'McCabe', date: currentCampusDate(yesterday) });

    expect(todayResult.items.map((item) => item.id)).toEqual(['opens-at-midnight']);
    expect(todayResult.meta.stale).toBe(false);
    expect(yesterdayResult.items.map((item) => item.id)).toEqual(['late-night']);
  });

  it('applies the same half-open window to live event results', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ data: [
        { id: 'at-start', title: 'Opening', startdate: '2026-09-16T00:00:00-04:00' },
        { id: 'at-end', title: 'Next day', startdate: '2026-09-17T00:00:00-04:00' },
        { id: 'spans', title: 'Overnight', startdate: '2026-09-15T22:00:00-04:00', enddate: '2026-09-16T02:00:00-04:00' },
        { id: 'ended-at-midnight', title: 'Late', startdate: '2026-09-15T22:00:00-04:00', enddate: '2026-09-16T00:00:00-04:00' },
      ] }),
    } as unknown as DashClient;
    const store = {
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
      deactivateMissingSources: vi.fn().mockResolvedValue(0),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.searchEvents({ start: '2026-09-16', end: '2026-09-16' }, true);

    expect(result.items.map((item) => item.id)).toEqual(['at-start', 'spans']);
  });

  it('returns the resolved campus date and a truthful warning for a confirmed empty hours result', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({
        hours: [{ place: 'Dining Center', category: 'Dining', kind: 'google', sourceId: 'dcc-hours' }],
      }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const result = await service.getHours({ place: 'Sharples', date: '2026-09-16' });

    expect(result.items).toEqual([]);
    expect(result.meta.resolved_date).toBe('2026-09-16');
    expect(result.meta.stale).toBe(false);
    expect(result.meta.warning).toContain('do not infer that the venue is closed');
  });

  it('scopes a dining read-through to the requested day so other cached days stay active', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const store = {
      currentRecords: vi.fn().mockResolvedValue([]),
      latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, diningDiscovery(), store);

    await service.getDining({ location: 'Sharples', date: '2026-09-09' });

    expect(store.replaceSourceRecords).toHaveBeenCalledWith(
      'dining', 'Dining Center', [], undefined, campusDayRange('2026-09-09'),
    );
  });

  it('keeps the scheduled dining poll as a full replacement so past days are retired', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const store = {
      replaceSourceRecords: vi.fn().mockResolvedValue(undefined), markDomainSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, diningDiscovery(), store);

    await service.getDining({ date: '2026-09-08', limit: 100 }, true);

    expect(store.replaceSourceRecords).toHaveBeenCalledWith('dining', 'Dining Center', [], undefined, undefined);
  });
});

describe('persist fan-out', () => {
  it('holds at most PERSIST_CONCURRENCY write transactions open during a poll', async () => {
    const places = Array.from({ length: 12 }, (_, index) => `Place ${index}`);
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    let open = 0;
    let peak = 0;
    const store = {
      replaceSourceRecords: vi.fn().mockImplementation(async () => {
        open += 1;
        peak = Math.max(peak, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open -= 1;
      }),
      markDomainSynced: vi.fn().mockResolvedValue(undefined),
      deactivateMissingSources: vi.fn().mockResolvedValue(0),
    } as unknown as PgStore;
    const discovery = {
      current: vi.fn().mockReturnValue({ hours: places.map((place) => ({ place, kind: 'google', sourceId: place })) }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    await service.getHours({ limit: 100 }, true);

    expect(store.replaceSourceRecords).toHaveBeenCalledTimes(places.length);
    expect(peak).toBe(PERSIST_CONCURRENCY);
  });
});

describe('transit departures', () => {
  it('polls every directed station pair with enough departures for the largest tool limit', async () => {
    const client = { query: vi.fn().mockImplementation(transitResponse) } as unknown as DashClient;
    const store = { addObservation: vi.fn().mockResolvedValue(undefined) } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    await service.syncRealtime();

    const polled = vi.mocked(store.addObservation).mock.calls
      .filter(([domain]) => domain === 'transit')
      .map(([, source]) => source);
    expect(new Set(polled)).toEqual(new Set(TRANSIT_PAIRS.map(({ origin, destination }) => `${origin}->${destination}`)));
    expect(polled).toHaveLength(6);
    expect(polled).toContain('media->swarthmore');
    expect(client.query).toHaveBeenCalledWith('Transit', expect.any(String), expect.objectContaining({
      departureStation: 'Media', arrivalStation: 'Swarthmore', maxResults: TRANSIT_POLL_LIMIT,
    }));
  });

  it('serves up to the requested limit from the cached observation and reports truncation', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const departures = Array.from({ length: TRANSIT_POLL_LIMIT }, (_, index) => ({ id: `train-${index}` }));
    const store = {
      latestObservation: vi.fn().mockResolvedValue({ payload: { departures }, observed_at: new Date().toISOString() }),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: 'media', destination: 'swarthmore', limit: 7 });

    expect(result.items).toHaveLength(7);
    expect(result.meta.total).toBe(TRANSIT_POLL_LIMIT);
    expect(result.meta.truncated).toBe(true);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('reads through to The Dash when a pair has never been observed', async () => {
    const client = { query: vi.fn().mockImplementation(transitResponse) } as unknown as DashClient;
    const store = {
      latestObservation: vi.fn().mockResolvedValue(undefined),
      addObservation: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: '30th_street', destination: 'media', limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.meta.stale).toBe(false);
    expect(store.addObservation).toHaveBeenCalledWith('transit', '30th_street->media', expect.objectContaining({
      departures: expect.any(Array),
    }), expect.any(Date));
  });

  it('returns a structured warning when a never-observed pair also fails live', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('SEPTA offline')) } as unknown as DashClient;
    const store = { latestObservation: vi.fn().mockResolvedValue(undefined) } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: 'media', destination: '30th_street' });

    expect(result.items).toEqual([]);
    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('media->30th_street');
    expect(result.meta.warning).toContain('SEPTA offline');
  });
});

function transitResponse(operation: string, _query: string, variables: { maxResults?: number } = {}) {
  if (operation === 'Weather') return Promise.resolve({ data: { location: 'Swarthmore' } });
  const count = variables.maxResults ?? 0;
  return Promise.resolve({
    data: Array.from({ length: count }, (_, index) => ({ id: `train-${index}`, data: { orig_train: `${index}` } })),
  });
}

function diningDiscovery(): RegistryDiscovery {
  return {
    current: vi.fn().mockReturnValue({
      dining: [{ location: 'Dining Center', kind: 'cbord', sourceId: 'DCC', labels: [], displayUpcoming: true }],
    }),
  } as unknown as RegistryDiscovery;
}

function config() {
  return loadConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false',
  });
}
