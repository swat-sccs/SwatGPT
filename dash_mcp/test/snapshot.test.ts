import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { campusDayRange, campusWallTime, currentCampusDate } from '../src/util.js';
import { EVENTS_POLL_DAYS, SwatService, departureInstant } from '../src/service.js';
import type { PgStore } from '../src/storage/store.js';
import type { DashClient } from '../src/upstream/client.js';
import type { RegistryDiscovery } from '../src/upstream/discovery.js';

const DAY_MS = 86_400_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('campus hours outside the polled day', () => {
  const saturday = addDays(currentCampusDate(), 3);

  it('reads a non-today date live instead of answering with undated configuration rows', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [hoursRow(saturday)] }) } as unknown as DashClient;
    const store = memoryStore([{ id: 'configuration-mccabe', title: 'McCabe Library', source: 'McCabe Library' }]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    const result = await service.getHours({ place: 'McCabe', date: saturday });

    expect(client.query).toHaveBeenCalledWith('LibraryCalendar', expect.any(String), expect.objectContaining({
      timeMin: campusDayRange(saturday).start,
    }));
    expect(result.items).toEqual([expect.objectContaining({ id: `mccabe-${saturday}` })]);
    expect(result.meta.stale).toBe(false);
  });

  it('does not answer another date from rows a narrower read-through left behind', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [hoursRow(saturday)] }) } as unknown as DashClient;
    const store = memoryStore([{ ...hoursRow(saturday), start: hoursRow(saturday).startdate, source: 'McCabe Library' }]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    const result = await service.getHours({ date: saturday });

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(result.meta.stale).toBe(false);
  });

  it('retires only the requested day when persisting a read-through, so today stays cached', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [hoursRow(saturday)] }) } as unknown as DashClient;
    const store = memoryStore([]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    await service.getHours({ place: 'McCabe', date: saturday });

    expect(store.replaceSourceRecords).toHaveBeenCalledWith(
      'hours', 'McCabe Library', expect.any(Array), undefined, campusDayRange(saturday),
    );
    expect(store.deactivateMissingSources).not.toHaveBeenCalled();
  });

  it('marks undated cached rows stale with a coverage warning when the live lookup fails', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as DashClient;
    const store = memoryStore([{ id: 'configuration-mccabe', title: 'McCabe Library', source: 'McCabe Library' }]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    const result = await service.getHours({ place: 'McCabe', date: saturday });

    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain(`Campus hours for ${saturday} are outside the synced snapshot`);
    expect(result.meta.warning).toContain('Dash offline');
  });

  it('returns an unavailable result, never a silent empty one, when nothing is cached and Dash fails', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as DashClient;
    const service = new SwatService(config(), client, hoursDiscovery(), memoryStore([]));

    const result = await service.getHours({ place: 'McCabe', date: saturday });

    expect(result.items).toEqual([]);
    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('outside the synced snapshot');
  });

  it('still answers today from the snapshot without a live request', async () => {
    const today = currentCampusDate();
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = memoryStore([{ id: 'configuration-mccabe', title: 'McCabe Library', source: 'McCabe Library' }]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    const result = await service.getHours({ place: 'McCabe', date: today });

    expect(result.items).toHaveLength(1);
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('campus events outside the polled window', () => {
  it('serves the default window from the snapshot', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const store = memoryStore([eventItem('lecture', new Date(Date.now() + 2 * DAY_MS))]);
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.searchEvents({});

    expect(result.items).toHaveLength(1);
    expect(result.meta.stale).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('reads a window beyond the snapshot live without replacing the polled events', async () => {
    const start = addDays(currentCampusDate(), 60);
    const end = addDays(start, 2);
    const concert = new Date(campusDayRange(addDays(start, 1)).start).getTime() + 19 * 3_600_000;
    const client = {
      query: vi.fn().mockResolvedValue({ data: [eventRow('concert', new Date(concert)), eventRow('soon', new Date(Date.now() + DAY_MS))] }),
    } as unknown as DashClient;
    const store = memoryStore([]);
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.searchEvents({ start, end });

    expect(client.query).toHaveBeenCalledWith('CampusEvents', expect.any(String), { currentOnly: false, days: expect.any(Number) });
    const { days } = vi.mocked(client.query).mock.calls[0]![2] as { days: number };
    expect(days).toBeGreaterThanOrEqual(62);
    expect(days).toBeLessThanOrEqual(64);
    expect(result.items).toEqual([expect.objectContaining({ id: 'concert' })]);
    expect(result.meta.stale).toBe(false);
    expect(store.replaceSourceRecords).not.toHaveBeenCalled();
  });

  it('warns when the window reaches past what the Dash can list', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, memoryStore([]));

    const result = await service.searchEvents({ start: addDays(currentCampusDate(), 300), end: addDays(currentCampusDate(), 400) });

    expect(vi.mocked(client.query).mock.calls[0]![2]).toEqual({ currentOnly: false, days: 365 });
    expect(result.meta.warning).toContain('at most 365 days ahead');
  });

  it('marks a far-future lookup stale instead of silently empty when Dash fails', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('Dash offline')) } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, memoryStore([]));
    const start = addDays(currentCampusDate(), EVENTS_POLL_DAYS + 30);

    const result = await service.searchEvents({ start, end: addDays(start, 1) });

    expect(result.items).toEqual([]);
    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('outside the synced snapshot');
    expect(result.meta.warning).toContain('Dash offline');
  });

  it('points past windows at the archive and marks them stale without a live request', async () => {
    const client = { query: vi.fn() } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, memoryStore([]));
    const lastWeek = addDays(currentCampusDate(), -7);

    const result = await service.searchEvents({ start: lastWeek, end: addDays(lastWeek, 2) });

    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('search_archive');
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('upstream shape changes', () => {
  it('rejects the poll and leaves the snapshot untouched when result.data is not an array', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: null }) } as unknown as DashClient;
    const store = memoryStore([]);
    const service = new SwatService(config(), client, hoursDiscovery(), store);

    await expect(service.getHours({ date: currentCampusDate() }, true)).rejects.toThrow('Dash result.data was not an array');
    await expect(service.searchEvents({}, true)).rejects.toThrow('Dash result.data was not an array');
    expect(store.replaceSourceRecords).not.toHaveBeenCalled();
  });

  it('rejects a weather payload without data rather than storing an empty observation', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: null }) } as unknown as DashClient;
    const store = { addObservation: vi.fn() } as unknown as PgStore;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    await expect(service.getWeather(3, true)).rejects.toThrow('weather');
    expect(store.addObservation).not.toHaveBeenCalled();
  });
});

describe('sources that vanish upstream', () => {
  it('retires alert sources missing from a full poll', async () => {
    const client = {
      query: vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === 'CriticalAnnouncement'
        ? { data: { showMessage: 0, title: '' } }
        : { calendarName: 'Announcements', data: [{ id: 'a-1', title: 'Fire drill' }] })),
    } as unknown as DashClient;
    const store = memoryStore([]);
    const discovery = { current: () => ({ announcementCalendars: ['cal-1'], appAnnouncements: [] }) } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    const result = await service.getAlerts(20, true);

    expect(result.items).toEqual([expect.objectContaining({ title: 'Fire drill' })]);
    expect(store.deactivateMissingSources).toHaveBeenCalledWith(
      'alerts', expect.arrayContaining(['critical-announcement', 'app-announcement', 'Announcements']),
    );
  });

  it('does not retire sources on narrowed refreshes or when upstream returned nothing', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: [] }) } as unknown as DashClient;
    const store = memoryStore([]);
    const discovery = {
      current: () => ({ news: [{ title: 'News', url: 'https://example.edu/feed', sticky: false }] }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    await service.searchNews({}, true);
    vi.mocked(client.query).mockResolvedValue({ data: [{ id: 'n-1', title: 'Post', source: 'News' }] });
    await service.searchNews({ publishedAfter: addDays(currentCampusDate(), -2) }, true);

    expect(store.deactivateMissingSources).not.toHaveBeenCalled();
  });

  it('keeps sources that only appear in returned items when retiring news feeds', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ data: [{ id: 'n-1', title: 'Post', source: 'Campus Journal' }] }),
    } as unknown as DashClient;
    const store = memoryStore([]);
    const discovery = {
      current: () => ({ news: [{ title: 'News and Events', url: 'https://example.edu/feed', sticky: false }] }),
    } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, store);

    await service.searchNews({}, true);

    expect(store.deactivateMissingSources).toHaveBeenCalledWith('news', ['News and Events', 'Campus Journal']);
  });

  it('ignores a critical announcement the Dash has switched off', async () => {
    const client = {
      query: vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === 'CriticalAnnouncement'
        ? { data: { showMessage: 0, title: '', description: '' } }
        : { data: [] })),
    } as unknown as DashClient;
    const discovery = { current: () => ({ announcementCalendars: [], appAnnouncements: [] }) } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, memoryStore([]));

    const result = await service.getAlerts(20, true);

    expect(result.items).toEqual([]);
  });

  it('still stores a critical announcement the Dash has switched on', async () => {
    const client = {
      query: vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === 'CriticalAnnouncement'
        ? { data: { showMessage: 1, title: 'Campus closed', description: 'Snow' } }
        : { data: [] })),
    } as unknown as DashClient;
    const discovery = { current: () => ({ announcementCalendars: [], appAnnouncements: [] }) } as unknown as RegistryDiscovery;
    const service = new SwatService(config(), client, discovery, memoryStore([]));

    const result = await service.getAlerts(20, true);

    expect(result.items).toEqual([expect.objectContaining({ title: 'Campus closed' })]);
  });
});

describe('cached transit departures', () => {
  it('drops trains that have already left the cached snapshot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const date = currentCampusDate();
    vi.setSystemTime(campusWallTime(date, 10, 14));
    const store = {
      latestObservation: vi.fn().mockResolvedValue({
        observed_at: campusWallTime(date, 10, 6).toISOString(),
        payload: { departures: [
          departure('1', '10:10AM', 'On time'),
          departure('2', '10:05AM', '12 mins'),
          departure('3', '10:40AM', 'On time'),
        ] },
      }),
    } as unknown as PgStore;
    const client = { query: vi.fn() } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: 'swarthmore', destination: '30th_street' });

    expect(result.items.map((item) => item.id)).toEqual(['2', '3']);
    expect(result.meta.total).toBe(2);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('reads through live when every cached departure has left', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const date = currentCampusDate();
    vi.setSystemTime(campusWallTime(date, 11, 0));
    const store = {
      latestObservation: vi.fn().mockResolvedValue({
        observed_at: campusWallTime(date, 10, 6).toISOString(),
        payload: { departures: [departure('1', '10:10AM', 'On time')] },
      }),
      addObservation: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgStore;
    const client = { query: vi.fn().mockResolvedValue({ data: [departure('9', '11:20AM', 'On time')] }) } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: 'swarthmore', destination: '30th_street' });

    expect(result.items).toEqual([expect.objectContaining({ id: '9' })]);
    expect(store.addObservation).toHaveBeenCalledOnce();
  });

  it('says the cached departures have left when the live read also fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const date = currentCampusDate();
    vi.setSystemTime(campusWallTime(date, 11, 0));
    const store = {
      latestObservation: vi.fn().mockResolvedValue({
        observed_at: campusWallTime(date, 10, 6).toISOString(),
        payload: { departures: [departure('1', '10:10AM', 'On time')] },
      }),
    } as unknown as PgStore;
    const client = { query: vi.fn().mockRejectedValue(new Error('SEPTA offline')) } as unknown as DashClient;
    const service = new SwatService(config(), client, {} as RegistryDiscovery, store);

    const result = await service.getTransit({ origin: 'swarthmore', destination: '30th_street' });

    expect(result.items).toEqual([]);
    expect(result.meta.stale).toBe(true);
    expect(result.meta.warning).toContain('already left');
  });

  it('places clock times on the right side of midnight and adds the reported delay', () => {
    const date = currentCampusDate();
    const lateNight = campusWallTime(date, 23, 55);
    expect(departureInstant(departure('a', '12:05AM', 'On time'), lateNight))
      .toBe(campusWallTime(date, 0, 5).getTime() + DAY_MS);
    expect(departureInstant(departure('b', '11:58PM', '3 mins'), lateNight))
      .toBe(campusWallTime(date, 23, 58).getTime() + 3 * 60_000);
    expect(departureInstant(departure('c', 'soon', 'On time'), lateNight)).toBeUndefined();
  });
});

describe('history retention', () => {
  it('keeps record history forever by default but always trims sync runs', async () => {
    const store = retentionStore();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const service = new SwatService(config(), {} as DashClient, {} as RegistryDiscovery, store);

    await service.pruneHistory();

    expect(store.pruneObservations).toHaveBeenCalledWith(30);
    expect(store.pruneSyncRuns).toHaveBeenCalledWith(30);
    expect(store.pruneArchive).not.toHaveBeenCalled();
  });

  it('prunes record history when a retention window is configured', async () => {
    const store = retentionStore();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const service = new SwatService(config({ ARCHIVE_RETENTION_DAYS: '180' }), {} as DashClient, {} as RegistryDiscovery, store);

    await service.pruneHistory();

    expect(store.pruneArchive).toHaveBeenCalledWith(180);
  });
});

function memoryStore(items: Array<Record<string, unknown>>) {
  return {
    currentRecords: vi.fn().mockResolvedValue(items),
    latestRecordObservedAt: vi.fn().mockResolvedValue(new Date().toISOString()),
    replaceSourceRecords: vi.fn().mockResolvedValue(undefined),
    deactivateMissingSources: vi.fn().mockResolvedValue(0),
    markDomainSynced: vi.fn().mockResolvedValue(undefined),
  } as unknown as PgStore & {
    replaceSourceRecords: ReturnType<typeof vi.fn>;
    deactivateMissingSources: ReturnType<typeof vi.fn>;
  };
}

function retentionStore() {
  return {
    pruneObservations: vi.fn().mockResolvedValue(1),
    pruneSyncRuns: vi.fn().mockResolvedValue(2),
    pruneArchive: vi.fn().mockResolvedValue({ records: 3, versions: 4 }),
  } as unknown as PgStore;
}

function hoursDiscovery(): RegistryDiscovery {
  return {
    current: () => ({
      hours: [{ place: 'McCabe Library', category: 'Libraries', kind: 'libcal', sourceId: 'mccabe', announcement: 'See website' }],
    }),
  } as unknown as RegistryDiscovery;
}

function hoursRow(date: string) {
  const start = new Date(campusDayRange(date).start).getTime();
  return {
    id: `mccabe-${date}`, title: 'Open',
    startdate: new Date(start + 9 * 3_600_000).toISOString(), enddate: new Date(start + 17 * 3_600_000).toISOString(),
  };
}

function eventItem(id: string, start: Date) {
  return { id, title: id, start: start.toISOString(), source: 'SwatCentral' };
}

function eventRow(id: string, start: Date) {
  return { id, title: id, startdate: start.toISOString() };
}

function departure(id: string, time: string, delay: string) {
  return { id, orig_train: id, orig_line: 'Media/Wawa', orig_departure_time: time, orig_delay: delay };
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function config(overrides: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false', ...overrides });
}
