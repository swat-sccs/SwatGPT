import type { Config } from './config.js';
import { PgStore } from './storage/store.js';
import type { ArchiveQuery, DashboardRegistry, Domain, FeedResult, JsonObject, NormalizedRecord } from './types.js';
import {
  asObject, asObjects, campusDayRange, cleanText, currentCampusDate, fuzzyMatch,
  normalizeRawRecord, toPublicRecord, withoutTypename,
} from './util.js';
import { DashClient, resultData } from './upstream/client.js';
import { RegistryDiscovery } from './upstream/discovery.js';
import { queries } from './upstream/queries.js';

export class SwatService {
  constructor(
    readonly config: Config,
    readonly client: DashClient,
    readonly discovery: RegistryDiscovery,
    readonly store: PgStore,
  ) {}

  async initialize(): Promise<void> {
    await this.store.migrate();
    await this.discovery.load();
  }

  registry(): DashboardRegistry {
    return this.discovery.current();
  }

  async refreshRegistry(): Promise<DashboardRegistry> {
    return this.discovery.load(true);
  }

  async getAlerts(limit = 20): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    try {
      const registry = this.registry();
      const [critical, calendars] = await Promise.all([
        this.client.query<unknown>('CriticalAnnouncement', queries.critical, {}, 15),
        Promise.all(registry.announcementCalendars.map((calendarId) => this.client.query<unknown>('Calendar', queries.calendar, {
          calendarId, order: 'DESC', timeWindow: '7 days', maxResults: limit,
        }))),
      ]);
      const records: NormalizedRecord[] = [];
      const criticalData = asObject(asObject(critical)?.data);
      if (criticalData && criticalData.showMessage !== false) records.push(normalizeRawRecord('alerts', 'critical-announcement', criticalData));
      for (const announcement of registry.appAnnouncements) {
        if (announcement.status === false) continue;
        records.push(normalizeRawRecord('alerts', 'app-announcement', {
          ...announcement,
          description: asObject(announcement.body)?.processed ?? announcement.body,
        }));
      }
      calendars.forEach((calendar, index) => {
        const source = cleanText(asObject(calendar)?.calendarName, 300) ?? `announcement-calendar-${index + 1}`;
        records.push(...resultData(calendar).map((raw) => normalizeRawRecord('alerts', source, raw)));
      });
      await this.persist(records);
      return makeResult(records.map(toPublicRecord), fetchedAt, records.map((item) => item.source), limit);
    } catch (error) {
      return this.recordsFallback('alerts', limit, fetchedAt, error);
    }
  }

  async getWeather(days = 3): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    try {
      const raw = await this.client.query<unknown>('Weather', queries.weather);
      const data = asObject(asObject(raw)?.data) ?? {};
      const current = asObject(data.current);
      const forecast = asObjects(data.forecast).slice(0, days);
      const item = withoutTypename({ created: data.created, location: data.location, current, forecast }) as JsonObject;
      await this.store.addObservation('weather', String(data.location ?? 'Swarthmore'), item, fetchedAt);
      return makeResult([item], fetchedAt, ['weatherfeed'], 1);
    } catch (error) {
      const fallback = await this.store.latestObservation('weather');
      if (!fallback) throw error;
      return makeStaleResult([fallback.payload], fetchedAt, ['weatherfeed'], fallback.observed_at, error);
    }
  }

  async getHours(input: { place?: string; category?: string; date?: string; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 30;
    try {
      const range = campusDayRange(input.date ?? currentCampusDate());
      const sources = this.registry().hours.filter((source) =>
        fuzzyMatch(source.place, input.place) && fuzzyMatch(source.category ?? '', input.category),
      );
      const records = (await Promise.all(sources.map(async (source) => {
        const query = source.kind === 'libcal' ? queries.libcal : source.kind === 'cbord' ? queries.cbord : queries.calendar;
        const operation = source.kind === 'libcal' ? 'LibraryCalendar' : source.kind === 'cbord' ? 'DiningMenu' : 'Calendar';
        const raw = await this.client.query<unknown>(operation, query, {
          calendarId: source.sourceId, order: 'ASC', timeMin: range.start, timeMax: range.end, maxResults: 50,
        });
        const events = resultData(raw).map((item) => normalizeRawRecord('hours', source.place, {
          ...item, campus_place: source.place, campus_category: source.category,
          additional_info_url: source.additionalInfoUrl, location_text: source.locationText,
          location_url: source.locationUrl, hours_announcement: source.announcement, hours_override: source.override,
        }, { category: source.category, location: source.locationText }));
        if (!events.length && (source.announcement || source.override)) {
          events.push(normalizeRawRecord('hours', source.place, {
            id: `configuration-${source.sourceId}`, title: source.place, description: source.announcement,
            campus_category: source.category, hours_override: source.override,
          }, { category: source.category, location: source.locationText }));
        }
        return events;
      }))).flat();
      await this.persist(records);
      return makeResult(records.map(toPublicRecord), fetchedAt, sources.map((source) => source.place), limit);
    } catch (error) {
      return this.recordsFallback('hours', limit, fetchedAt, error, input.place ?? input.category);
    }
  }

  async getDining(input: { location?: string; date?: string; meal?: string; query?: string; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 30;
    try {
      const range = campusDayRange(input.date ?? currentCampusDate());
      const sources = this.registry().dining.filter((source) => fuzzyMatch(source.location, input.location));
      let records = (await Promise.all(sources.map(async (source) => {
        const query = source.kind === 'cbord' ? queries.cbord : queries.calendar;
        const operation = source.kind === 'cbord' ? 'DiningMenu' : 'Calendar';
        const raw = await this.client.query<unknown>(operation, query, {
          calendarId: source.sourceId, order: 'ASC', timeMin: range.start, timeMax: range.end, maxResults: 100,
        });
        return resultData(raw).map((item) => normalizeRawRecord('dining', source.location, {
          ...item, dining_location: source.location, dining_labels: source.labels,
        }, { location: source.location }));
      }))).flat();
      await this.persist(records);
      if (input.meal) records = records.filter((record) => fuzzyMatch(`${record.title} ${record.description ?? ''}`, input.meal));
      if (input.query) records = records.filter((record) => fuzzyMatch(record.searchText, input.query));
      return makeResult(records.map(toPublicRecord), fetchedAt, sources.map((source) => source.location), limit);
    } catch (error) {
      return this.recordsFallback('dining', limit, fetchedAt, error, input.location ?? input.meal ?? input.query);
    }
  }

  async searchEvents(input: { query?: string; start?: string; end?: string; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    try {
      const start = input.start ? new Date(campusDayRange(input.start).start) : fetchedAt;
      const end = input.end ? new Date(campusDayRange(input.end).end) : new Date(start.getTime() + 30 * 86_400_000);
      const days = Math.max(1, Math.min(365, Math.ceil((end.getTime() - fetchedAt.getTime()) / 86_400_000)));
      const raw = await this.client.query<unknown>('CampusEvents', queries.events, { currentOnly: false, days });
      let records = resultData(raw).map((item) => normalizeRawRecord('events', 'SwatCentral', item));
      await this.persist(records);
      records = filterRange(records, start, end);
      if (input.query) records = records.filter((record) => fuzzyMatch(record.searchText, input.query));
      return makeResult(records.map(toPublicRecord), fetchedAt, ['SwatCentral'], limit);
    } catch (error) {
      return this.recordsFallback('events', limit, fetchedAt, error, input.query);
    }
  }

  async searchNews(input: { query?: string; source?: string; publishedAfter?: string; publishedBefore?: string; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    try {
      const registry = this.registry();
      const prevDays = input.publishedAfter
        ? Math.max(1, Math.min(365, Math.ceil((fetchedAt.getTime() - new Date(input.publishedAfter).getTime()) / 86_400_000)))
        : 30;
      const raw = await this.client.query<unknown>('CampusNews', queries.news, {
        feedUrls: registry.news.map((source) => source.url),
        feedStickyUrls: registry.news.filter((source) => source.sticky).map((source) => source.url),
        maxResults: 100,
        prevDaysToQuery: prevDays,
      });
      let records = resultData(raw).map((item) => normalizeRawRecord('news', cleanText(item.source, 300) ?? 'Around Campus', item));
      await this.persist(records);
      if (input.query) records = records.filter((record) => fuzzyMatch(record.searchText, input.query));
      if (input.source) records = records.filter((record) => fuzzyMatch(record.source, input.source));
      if (input.publishedAfter) {
        const after = new Date(campusDayRange(input.publishedAfter).start);
        records = records.filter((record) => !record.published || new Date(record.published) >= after);
      }
      if (input.publishedBefore) {
        const before = new Date(campusDayRange(input.publishedBefore).end);
        records = records.filter((record) => !record.published || new Date(record.published) <= before);
      }
      return makeResult(records.map(toPublicRecord), fetchedAt, registry.news.map((source) => source.title), limit);
    } catch (error) {
      return this.recordsFallback('news', limit, fetchedAt, error, input.query ?? input.source);
    }
  }

  async getTransit(input: { origin: 'swarthmore' | '30th_street' | 'media'; destination: 'swarthmore' | '30th_street' | 'media'; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 4;
    const stations = { swarthmore: 'Swarthmore', '30th_street': '30th%20Street%20Station', media: 'Media' } as const;
    if (input.origin === input.destination) throw new Error('Origin and destination must be different');
    const source = `${input.origin}->${input.destination}`;
    try {
      const raw = await this.client.query<unknown>('Transit', queries.transit, {
        departureStation: stations[input.origin], arrivalStation: stations[input.destination], maxResults: limit,
      });
      const items = resultData(raw).map((item) => withoutTypename(item) as JsonObject);
      const observation = { origin: input.origin, destination: input.destination, departures: items };
      await this.store.addObservation('transit', source, observation, fetchedAt);
      return makeResult(items, fetchedAt, [source], limit);
    } catch (error) {
      const fallback = await this.store.latestObservation('transit', source);
      if (!fallback) throw error;
      const items = Array.isArray(fallback.payload.departures) ? fallback.payload.departures as JsonObject[] : [fallback.payload];
      return makeStaleResult(items.slice(0, limit), fetchedAt, [source], fallback.observed_at, error);
    }
  }

  async getSports(input: { sport?: string; gender?: string; start?: string; end?: string; limit?: number }): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    try {
      const raw = await this.client.query<unknown>('Sports', queries.sports, { count: 100 });
      let records = resultData(raw).map((item) => normalizeRawRecord('sports', 'Swarthmore Athletics', item));
      await this.persist(records);
      if (input.sport) records = records.filter((record) => fuzzyMatch(String(record.payload.sport_title ?? record.title), input.sport));
      if (input.gender) records = records.filter((record) => fuzzyMatch(String(record.payload.gender ?? ''), input.gender));
      if (input.start || input.end) records = filterRange(
        records,
        input.start ? new Date(campusDayRange(input.start).start) : new Date(0),
        input.end ? new Date(campusDayRange(input.end).end) : new Date('9999-12-31'),
      );
      return makeResult(records.map(toPublicRecord), fetchedAt, ['Swarthmore Athletics'], limit);
    } catch (error) {
      return this.recordsFallback('sports', limit, fetchedAt, error, input.sport ?? input.gender);
    }
  }

  async getMindCandy(): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    try {
      const raw = await this.client.query<unknown>('MindCandy', queries.mindCandy, { maxResults: 10 });
      const records = resultData(raw).map((item) => normalizeRawRecord('mind_candy', 'The Dash', item));
      await this.persist(records);
      return makeResult(records.map(toPublicRecord), fetchedAt, ['The Dash'], 10);
    } catch (error) {
      return this.recordsFallback('mind_candy', 10, fetchedAt, error);
    }
  }

  async getResources(section?: string, limit = 30): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    try {
      const selected = this.registry().resources.filter((item) => fuzzyMatch(item.section, section));
      const records = selected.flatMap((resource) => resource.content.map((content, index) => {
        const object = asObject(content) ?? { value: content };
        const header = asObject(object.field_header_text);
        const title = cleanText(header?.processed ?? header?.value ?? object.title, 500) ?? `${resource.section} resource ${index + 1}`;
        return normalizeRawRecord('resources', resource.section, { ...object, id: object.id ?? `${resource.section}-${index}`, title });
      }));
      await this.persist(records);
      return makeResult(records.map(toPublicRecord), fetchedAt, selected.map((item) => item.section), limit);
    } catch (error) {
      return this.recordsFallback('resources', limit, fetchedAt, error, section);
    }
  }

  async searchArchive(query: ArchiveQuery): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const items = await this.store.searchArchive(query);
    return makeResult(items.map((item) => ({
      domain: item.domain, source: item.source, title: item.title, observed_at: item.observed_at,
      kind: item.kind, data: item.payload,
    })), fetchedAt, ['SwatGPT PostgreSQL archive'], query.limit, query.observedTo);
  }

  async getDataStatus(): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const items = await this.store.status();
    return makeResult(items, fetchedAt, ['SwatGPT sync history'], 50);
  }

  async syncRealtime(): Promise<void> {
    assertPollResults(await Promise.allSettled([
      this.getWeather(7),
      this.getTransit({ origin: 'swarthmore', destination: '30th_street', limit: 4 }),
      this.getTransit({ origin: '30th_street', destination: 'swarthmore', limit: 4 }),
      this.getTransit({ origin: 'swarthmore', destination: 'media', limit: 4 }),
    ]));
  }

  async syncContent(): Promise<void> {
    const today = currentCampusDate();
    assertPollResults(await Promise.allSettled([
      this.getHours({ date: today, limit: 100 }), this.getDining({ date: today, limit: 100 }),
      this.searchEvents({ limit: 100 }), this.searchNews({ limit: 100 }), this.getSports({ limit: 100 }),
      this.getMindCandy(), this.getResources(undefined, 100),
    ]));
  }

  private async persist(records: NormalizedRecord[]): Promise<void> {
    const grouped = new Map<string, NormalizedRecord[]>();
    for (const record of records) {
      const key = `${record.domain}\0${record.source}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    await Promise.all([...grouped.values()].map((items) => this.store.replaceSourceRecords(items[0]!.domain, items[0]!.source, items)));
  }

  private async recordsFallback(domain: Domain, limit: number, fetchedAt: Date, error: unknown, query?: string): Promise<FeedResult<JsonObject>> {
    let items = await this.store.currentRecords(domain, Math.max(limit * 3, 100));
    if (query) items = items.filter((item) => fuzzyMatch(JSON.stringify(item), query));
    if (!items.length) throw error;
    const dataAsOf = await this.store.latestRecordObservedAt(domain) ?? fetchedAt.toISOString();
    return makeStaleResult(items.slice(0, limit), fetchedAt, ['SwatGPT PostgreSQL archive'], dataAsOf, error);
  }
}

function assertPollResults(results: PromiseSettledResult<unknown>[]): void {
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length) {
    throw new Error(`${failures.length} polling request(s) failed: ${failures.map((failure) => failure.reason instanceof Error ? failure.reason.message : String(failure.reason)).join('; ')}`);
  }
}

function filterRange(records: NormalizedRecord[], start: Date, end: Date): NormalizedRecord[] {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Invalid date range');
  return records.filter((record) => {
    const value = record.start ?? record.published;
    if (!value) return true;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  });
}

function makeResult<T>(items: T[], fetchedAt: Date, sources: string[], limit: number, dataAsOf = fetchedAt.toISOString()): FeedResult<T> {
  const bounded = items.slice(0, limit);
  return { items: bounded, meta: {
    source: [...new Set(sources)], fetched_at: fetchedAt.toISOString(), data_as_of: dataAsOf,
    stale: false, total: items.length, returned: bounded.length, truncated: items.length > bounded.length,
  } };
}

function makeStaleResult<T>(items: T[], fetchedAt: Date, sources: string[], dataAsOf: string, error: unknown): FeedResult<T> {
  return { items, meta: {
    source: sources, fetched_at: fetchedAt.toISOString(), data_as_of: dataAsOf, stale: true,
    total: items.length, returned: items.length, truncated: false,
    warning: `Live Dash request failed; returning archived data: ${error instanceof Error ? error.message : String(error)}`,
  } };
}
