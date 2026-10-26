import type { Config } from './config.js';
import { FULL_SYNC_SCOPE, PgStore } from './storage/store.js';
import type {
  ArchiveQuery, DashboardRegistry, Domain, FeedResult, JsonObject, NormalizedRecord, TimeWindow, TransitStation,
} from './types.js';
import { transitStations } from './types.js';
import {
  asObject, asObjects, campusDayRange, campusWallTime, cleanText, currentCampusDate, fuzzyMatch,
  log, normalizeRawRecord, toPublicRecord, withoutTypename,
} from './util.js';
import { campusHoursAliasesFor, campusHoursPlaceMatches } from './hoursAliases.js';
import { DashClient, resultData } from './upstream/client.js';
import { RegistryDiscovery } from './upstream/discovery.js';
import { queries } from './upstream/queries.js';

/** Departures stored per poll, so cached reads can satisfy the tool's maximum `limit`. */
export const TRANSIT_POLL_LIMIT = 10;

/** Every directed origin/destination pair the transit tool accepts. */
export const TRANSIT_PAIRS: ReadonlyArray<{ origin: TransitStation; destination: TransitStation }> = transitStations.flatMap(
  (origin) => transitStations.filter((destination) => destination !== origin).map((destination) => ({ origin, destination })),
);

/** Days ahead the scheduled content poll keeps in the events snapshot. */
export const EVENTS_POLL_DAYS = 30;
/** Furthest ahead the Dash `CampusEvents` query can list. */
const EVENTS_MAX_DAYS = 365;
const EVENTS_SOURCE = 'SwatCentral';
const DAY_MS = 86_400_000;
const HALF_DAY_MS = DAY_MS / 2;
/** A departure this recent is still shown, since trains rarely leave on the exact minute. */
const DEPARTURE_GRACE_MS = 60_000;

type DiningInput = { location?: string; date?: string; meal?: string; query?: string; limit?: number };
type DiningFilters = { meal?: string; query?: string };
type HoursInput = { place?: string; category?: string; date?: string; limit?: number };
type EventsInput = { query?: string; start?: string; end?: string; limit?: number };
type PersistOptions = { window?: TimeWindow; exhaustive?: boolean };
type EventsCoverage =
  | { kind: 'covered'; warning?: string }
  | { kind: 'past'; warning: string }
  | { kind: 'live'; days: number; warning?: string };

export class SwatService {
  constructor(
    readonly config: Config,
    readonly client: DashClient,
    readonly discovery: RegistryDiscovery,
    readonly store: PgStore,
  ) {}

  async initialize(): Promise<void> {
    await this.store.migrate();
    try {
      await this.discovery.load();
    } catch (error) {
      log('warn', 'Dash configuration unavailable at startup; serving PostgreSQL snapshots while background discovery retries', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  registry(): DashboardRegistry {
    return this.discovery.current();
  }

  async refreshRegistry(): Promise<DashboardRegistry> {
    return this.discovery.load(true);
  }

  async getAlerts(limit = 20, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    if (!refresh) return this.cachedRecords('alerts', limit, fetchedAt, undefined, this.config.alertPollMs);
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
      if (criticalData && isShown(criticalData.showMessage)) records.push(normalizeRawRecord('alerts', 'critical-announcement', criticalData));
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
      await this.persist(records, [
        { domain: 'alerts', source: 'critical-announcement' },
        { domain: 'alerts', source: 'app-announcement' },
        ...calendars.map((calendar, index) => ({
          domain: 'alerts' as const,
          source: cleanText(asObject(calendar)?.calendarName, 300) ?? `announcement-calendar-${index + 1}`,
        })),
      ], { exhaustive: true });
      return makeResult(records.map(toPublicRecord), fetchedAt, records.map((item) => item.source), limit);
    } catch (error) {
      if (refresh) throw error;
      return this.recordsFallback('alerts', limit, fetchedAt, error);
    }
  }

  async getWeather(days = 3, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    if (!refresh) {
      const fallback = await this.store.latestObservation('weather');
      if (!fallback) return makeUnavailableResult(fetchedAt, 'weather');
      const item = { ...fallback.payload };
      if (Array.isArray(item.forecast)) item.forecast = item.forecast.slice(0, days);
      return makeCachedResult([item], fetchedAt, ['weatherfeed'], fallback.observed_at, this.config.realtimePollMs);
    }
    try {
      const raw = await this.client.query<unknown>('Weather', queries.weather);
      const data = asObject(asObject(raw)?.data);
      if (!data) throw new Error('Dash weather result.data was not an object');
      const current = asObject(data.current);
      const forecast = asObjects(data.forecast).slice(0, days);
      const item = withoutTypename({ created: data.created, location: data.location, current, forecast }) as JsonObject;
      await this.store.addObservation('weather', String(data.location ?? 'Swarthmore'), item, fetchedAt);
      return makeResult([item], fetchedAt, ['weatherfeed'], 1);
    } catch (error) {
      if (refresh) throw error;
      const fallback = await this.store.latestObservation('weather');
      if (!fallback) throw error;
      return makeStaleResult([fallback.payload], fetchedAt, ['weatherfeed'], fallback.observed_at, error);
    }
  }

  async getHours(input: HoursInput, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 30;
    const resolvedDate = input.date ?? currentCampusDate(fetchedAt);
    const range = campusDayRange(resolvedDate);
    if (refresh) {
      const exhaustive = !input.place && !input.category;
      return withHoursQueryMeta(await this.fetchHours(input, limit, fetchedAt, range, { exhaustive }), resolvedDate, input);
    }

    const polled = resolvedDate === currentCampusDate(fetchedAt);
    const cached = await this.cachedRecords('hours', limit, fetchedAt, (item) =>
      campusHoursPlaceMatches(JSON.stringify(item), input.place) &&
      fuzzyMatch(JSON.stringify(item), input.category) &&
      recordOverlapsRange(item, new Date(range.start), new Date(range.end)),
    this.config.contentPollMs);
    if (polled && cached.items.length && !cached.meta.stale) return withHoursQueryMeta(cached, resolvedDate, input);

    try {
      const live = await this.withinToolBudget(
        fetchedAt,
        'hours',
        this.fetchHours(input, limit, new Date(), range, { window: range }),
      );
      return withHoursQueryMeta(live, resolvedDate, input);
    } catch (error) {
      const coverage = polled ? undefined : `Campus hours for ${resolvedDate} are outside the synced snapshot (today only).`;
      if (cached.items.length) {
        return withHoursQueryMeta(
          makeStaleResult(cached.items, fetchedAt, cached.meta.source, cached.meta.data_as_of, error, coverage),
          resolvedDate,
          input,
        );
      }
      return withHoursQueryMeta(makeUnavailableResult(
        fetchedAt,
        'hours',
        [coverage, `No matching cached campus-hours data is available and the live Dash lookup failed: ${errorMessage(error)}`]
          .filter(Boolean).join(' '),
      ), resolvedDate, input);
    }
  }

  /**
   * Fetches one campus day of hours for the matching registry places and persists it.
   * The scheduled poll replaces each place's rows; a read-through passes `window` so
   * only that day is retired and today's polled snapshot stays cached.
   */
  private async fetchHours(
    input: HoursInput,
    limit: number,
    fetchedAt: Date,
    range: TimeWindow,
    persistOptions: PersistOptions,
  ): Promise<FeedResult<JsonObject>> {
    const registry = await this.loadedRegistry();
    const sources = registry.hours.filter((source) =>
      campusHoursPlaceMatches(source.place, input.place) && fuzzyMatch(source.category ?? '', input.category),
    );
    const records = (await Promise.all(sources.map(async (source) => {
      const query = source.kind === 'libcal' ? queries.libcal : source.kind === 'cbord' ? queries.cbord : queries.calendar;
      const operation = source.kind === 'libcal' ? 'LibraryCalendar' : source.kind === 'cbord' ? 'DiningMenu' : 'Calendar';
      const raw = await this.client.query<unknown>(operation, query, {
        calendarId: source.sourceId, order: 'ASC', timeMin: range.start, timeMax: range.end, maxResults: 50,
      });
      const events = resultData(raw).map((item) => normalizeRawRecord('hours', source.place, {
        ...item, campus_place: source.place, campus_category: source.category,
        campus_aliases: campusHoursAliasesFor(source.place),
        additional_info_url: source.additionalInfoUrl, location_text: source.locationText,
        location_url: source.locationUrl, hours_announcement: source.announcement, hours_override: source.override,
      }, { category: source.category, location: source.locationText }));
      if (!events.length && (source.announcement || source.override)) {
        events.push(normalizeRawRecord('hours', source.place, {
          id: `configuration-${source.sourceId}`, title: source.place, description: source.announcement,
          campus_category: source.category, campus_aliases: campusHoursAliasesFor(source.place),
          hours_override: source.override,
        }, { category: source.category, location: source.locationText }));
      }
      return events;
    }))).flat();
    await this.persist(records, sources.map((source) => ({ domain: 'hours', source: source.place })), persistOptions);
    return makeResult(records.map(toPublicRecord), fetchedAt, sources.map((source) => source.place), limit);
  }

  async getDining(input: DiningInput, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 30;
    const filters = normalizeDiningFilters(input.meal, input.query);
    const range = campusDayRange(input.date ?? currentCampusDate());
    if (!refresh) {
      const cached = await this.cachedRecords('dining', limit, fetchedAt, (item) => {
        const text = JSON.stringify(item);
        return diningLocationMatches(text, input.location) && fuzzyMatch(text, filters.meal) &&
          fuzzyMatch(text, filters.query) && recordOverlapsRange(item, new Date(range.start), new Date(range.end));
      }, this.config.contentPollMs);

      // PostgreSQL remains the shared cache. Only wait on The Dash when this
      // specific lookup missed the snapshot or the snapshot is stale.
      if (cached.items.length && !cached.meta.stale) return cached;
      try {
        return await this.withinToolBudget(
          fetchedAt,
          'dining',
          this.fetchDining(input, filters, limit, new Date(), range, range),
        );
      } catch (error) {
        if (cached.items.length) {
          return makeStaleResult(cached.items, fetchedAt, cached.meta.source, cached.meta.data_as_of, error);
        }
        return makeUnavailableResult(
          fetchedAt,
          'dining',
          `No matching cached dining data is available and the live Dash lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return this.fetchDining(input, filters, limit, fetchedAt, range);
  }

  /**
   * Fetches one campus day of dining from The Dash and persists it. A `persistWindow` limits
   * which cached rows are retired to that day; without it every row for the fetched sources
   * is replaced, which is how the scheduled poll clears past days.
   */
  private async fetchDining(
    input: DiningInput,
    filters: DiningFilters,
    limit: number,
    fetchedAt: Date,
    range: TimeWindow,
    persistWindow?: TimeWindow,
  ): Promise<FeedResult<JsonObject>> {
    const registry = await this.loadedRegistry();
    const sources = registry.dining.filter((source) =>
      diningLocationMatches(`${source.location} ${source.sourceId} ${source.labels.join(' ')}`, input.location),
    );
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
    await this.persist(records, sources.map((source) => ({ domain: 'dining', source: source.location })), {
      window: persistWindow,
      exhaustive: !persistWindow && !input.location,
    });
    if (filters.meal) records = records.filter((record) => fuzzyMatch(`${record.title} ${record.description ?? ''}`, filters.meal));
    if (filters.query) records = records.filter((record) => fuzzyMatch(record.searchText, filters.query));
    return makeResult(records.map(toPublicRecord), fetchedAt, sources.map((source) => source.location), limit);
  }

  async searchEvents(input: EventsInput, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    const start = input.start ? new Date(campusDayRange(input.start).start) : fetchedAt;
    const end = input.end ? new Date(campusDayRange(input.end).end) : new Date(start.getTime() + EVENTS_POLL_DAYS * DAY_MS);
    if (refresh) {
      const records = await this.fetchEvents(EVENTS_POLL_DAYS);
      await this.persist(records, [{ domain: 'events', source: EVENTS_SOURCE }], { exhaustive: true });
      return makeResult(filterEvents(records, start, end, input.query).map(toPublicRecord), fetchedAt, [EVENTS_SOURCE], limit);
    }

    const cached = await this.cachedRecords('events', limit, fetchedAt, (item) =>
      fuzzyMatch(JSON.stringify(item), input.query) && recordOverlapsRange(item, start, end),
    this.config.contentPollMs);
    const coverage = eventsCoverage(input, start, end, fetchedAt, cached.meta.data_as_of);
    if (coverage.kind === 'covered') return withWarning(cached, coverage.warning);
    if (coverage.kind === 'past') return { ...cached, meta: { ...cached.meta, stale: true, warning: coverage.warning } };

    try {
      const records = await this.withinToolBudget(fetchedAt, 'events', this.fetchEvents(coverage.days));
      return withWarning(
        makeResult(filterEvents(records, start, end, input.query).map(toPublicRecord), fetchedAt, [EVENTS_SOURCE], limit),
        coverage.warning,
      );
    } catch (error) {
      const outside = `The requested events window is outside the synced snapshot (today through the next ${EVENTS_POLL_DAYS} days).`;
      if (cached.items.length) {
        return makeStaleResult(cached.items, fetchedAt, cached.meta.source, cached.meta.data_as_of, error, outside);
      }
      return makeUnavailableResult(fetchedAt, 'events', `${outside} The live Dash lookup failed: ${errorMessage(error)}`);
    }
  }

  /** Reads SwatCentral events from now through `days` ahead; the Dash query has no start bound. */
  private async fetchEvents(days: number): Promise<NormalizedRecord[]> {
    const raw = await this.client.query<unknown>('CampusEvents', queries.events, { currentOnly: false, days });
    return resultData(raw).map((item) => normalizeRawRecord('events', EVENTS_SOURCE, item));
  }

  async searchNews(input: { query?: string; source?: string; publishedAfter?: string; publishedBefore?: string; limit?: number }, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    if (!refresh) {
      const after = input.publishedAfter ? new Date(campusDayRange(input.publishedAfter).start) : undefined;
      const before = input.publishedBefore ? new Date(campusDayRange(input.publishedBefore).end) : undefined;
      return this.cachedRecords('news', limit, fetchedAt, (item) => {
        const text = JSON.stringify(item);
        const published = typeof item.published === 'string' ? new Date(item.published) : undefined;
        return fuzzyMatch(text, input.query) && fuzzyMatch(String(item.source ?? ''), input.source) &&
          (!after || !published || published >= after) && (!before || !published || published <= before);
      }, this.config.contentPollMs);
    }
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
      await this.persist(
        records,
        registry.news.map((source) => ({ domain: 'news', source: source.title })),
        { exhaustive: !input.publishedAfter },
      );
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
      if (refresh) throw error;
      return this.recordsFallback('news', limit, fetchedAt, error, input.query ?? input.source);
    }
  }

  async getTransit(input: { origin: TransitStation; destination: TransitStation; limit?: number }, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 4;
    const stations = { swarthmore: 'Swarthmore', '30th_street': '30th%20Street%20Station', media: 'Media' } as const;
    if (input.origin === input.destination) throw new Error('Origin and destination must be different');
    const source = `${input.origin}->${input.destination}`;
    if (!refresh) {
      const cached = await this.store.latestObservation('transit', source);
      const departures = cached ? cachedDepartures(cached.payload) : [];
      const upcoming = cached ? upcomingDepartures(departures, new Date(cached.observed_at), fetchedAt) : [];
      if (cached && (upcoming.length || !departures.length)) {
        return makeCachedResult(upcoming, fetchedAt, [source], cached.observed_at, this.config.realtimePollMs, limit);
      }
      try {
        return await this.withinToolBudget(fetchedAt, 'transit', this.getTransit(input, true));
      } catch (error) {
        const reason = cached
          ? `Every cached departure for ${source} has already left`
          : `No cached transit data is available for ${source}`;
        return makeUnavailableResult(fetchedAt, 'transit', `${reason} and the live Dash lookup failed: ${errorMessage(error)}`);
      }
    }
    const raw = await this.client.query<unknown>('Transit', queries.transit, {
      departureStation: stations[input.origin],
      arrivalStation: stations[input.destination],
      maxResults: Math.max(limit, TRANSIT_POLL_LIMIT),
    });
    const items = resultData(raw).map((item) => withoutTypename(item) as JsonObject);
    const observation = { origin: input.origin, destination: input.destination, departures: items };
    await this.store.addObservation('transit', source, observation, fetchedAt);
    return makeResult(items, fetchedAt, [source], limit);
  }

  async getSports(input: { sport?: string; gender?: string; start?: string; end?: string; limit?: number }, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const limit = input.limit ?? 20;
    if (!refresh) {
      const start = input.start ? new Date(campusDayRange(input.start).start) : undefined;
      const end = input.end ? new Date(campusDayRange(input.end).end) : undefined;
      return this.cachedRecords('sports', limit, fetchedAt, (item) => {
        const text = JSON.stringify(item);
        return fuzzyMatch(text, input.sport) && fuzzyMatch(text, input.gender) &&
          (!start && !end || recordOverlapsRange(item, start ?? new Date(0), end ?? new Date('9999-12-31')));
      }, this.config.contentPollMs);
    }
    try {
      const raw = await this.client.query<unknown>('Sports', queries.sports, { count: 100 });
      let records = resultData(raw).map((item) => normalizeRawRecord('sports', 'Swarthmore Athletics', item));
      await this.persist(records, [{ domain: 'sports', source: 'Swarthmore Athletics' }], { exhaustive: true });
      if (input.sport) records = records.filter((record) => fuzzyMatch(String(record.payload.sport_title ?? record.title), input.sport));
      if (input.gender) records = records.filter((record) => fuzzyMatch(String(record.payload.gender ?? ''), input.gender));
      if (input.start || input.end) records = filterRange(
        records,
        input.start ? new Date(campusDayRange(input.start).start) : new Date(0),
        input.end ? new Date(campusDayRange(input.end).end) : new Date('9999-12-31'),
      );
      return makeResult(records.map(toPublicRecord), fetchedAt, ['Swarthmore Athletics'], limit);
    } catch (error) {
      if (refresh) throw error;
      return this.recordsFallback('sports', limit, fetchedAt, error, input.sport ?? input.gender);
    }
  }

  async getMindCandy(refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    if (!refresh) return this.cachedRecords('mind_candy', 10, fetchedAt, undefined, this.config.contentPollMs);
    try {
      const raw = await this.client.query<unknown>('MindCandy', queries.mindCandy, { maxResults: 10 });
      const records = resultData(raw).map((item) => normalizeRawRecord('mind_candy', 'The Dash', item));
      await this.persist(records, [{ domain: 'mind_candy', source: 'The Dash' }], { exhaustive: true });
      return makeResult(records.map(toPublicRecord), fetchedAt, ['The Dash'], 10);
    } catch (error) {
      if (refresh) throw error;
      return this.recordsFallback('mind_candy', 10, fetchedAt, error);
    }
  }

  async getResources(section?: string, limit = 30, refresh = false): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    if (!refresh) return this.cachedRecords('resources', limit, fetchedAt,
      (item) => fuzzyMatch(JSON.stringify(item), section), this.config.contentPollMs);
    try {
      const selected = this.registry().resources.filter((item) => fuzzyMatch(item.section, section));
      const records = selected.flatMap((resource) => resource.content.map((content, index) => {
        const object = asObject(content) ?? { value: content };
        const header = asObject(object.field_header_text);
        const title = cleanText(header?.processed ?? header?.value ?? object.title, 500) ?? `${resource.section} resource ${index + 1}`;
        return normalizeRawRecord('resources', resource.section, { ...object, id: object.id ?? `${resource.section}-${index}`, title });
      }));
      await this.persist(
        records,
        selected.map((resource) => ({ domain: 'resources', source: resource.section })),
        { exhaustive: !section },
      );
      return makeResult(records.map(toPublicRecord), fetchedAt, selected.map((item) => item.section), limit);
    } catch (error) {
      if (refresh) throw error;
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

  /** When the newest stored snapshot for a domain was observed, whichever table backs it. */
  async snapshotObservedAt(domain: Domain): Promise<string | undefined> {
    if (domain === 'weather' || domain === 'transit') {
      return (await this.store.latestObservation(domain))?.observed_at;
    }
    return this.store.latestRecordObservedAt(domain);
  }

  async getDataStatus(): Promise<FeedResult<JsonObject>> {
    const fetchedAt = new Date();
    const items = await this.store.status();
    return makeResult(items, fetchedAt, ['SwatGPT sync history'], 50);
  }

  /** Daily retention: high-frequency observations, sync history, and (when configured) record history. */
  async pruneHistory(): Promise<void> {
    const { store, config } = this;
    const observations = await store.pruneObservations(config.observationRetentionDays);
    const syncRuns = await store.pruneSyncRuns(config.syncRunRetentionDays);
    const archive = config.archiveRetentionDays > 0 ? await store.pruneArchive(config.archiveRetentionDays) : undefined;
    log('info', 'Pruned stored history', { observations, syncRuns, ...archive });
  }

  async syncRealtime(): Promise<void> {
    assertPollResults(await Promise.allSettled([
      this.getWeather(7, true),
      ...TRANSIT_PAIRS.map((pair) => this.getTransit({ ...pair, limit: TRANSIT_POLL_LIMIT }, true)),
    ]));
  }

  async syncContent(): Promise<void> {
    const today = currentCampusDate();
    assertPollResults(await Promise.allSettled([
      this.getHours({ date: today, limit: 100 }, true), this.getDining({ date: today, limit: 100 }, true),
      this.searchEvents({ limit: 100 }, true), this.searchNews({ limit: 100 }, true), this.getSports({ limit: 100 }, true),
      this.getMindCandy(true), this.getResources(undefined, 100, true),
    ]));
  }

  /** Bounds a live read-through so it finishes inside the MCP tool timeout. */
  private withinToolBudget<T>(startedAt: Date, domain: Domain, task: Promise<T>): Promise<T> {
    const elapsedMs = Date.now() - startedAt.getTime();
    const budgetMs = Math.max(250, this.config.mcpToolTimeoutMs - elapsedMs - 500);
    return withDeadline(task, budgetMs, `Live Dash ${domain} lookup exceeded ${budgetMs}ms`);
  }

  private async loadedRegistry(): Promise<DashboardRegistry> {
    try {
      return this.registry();
    } catch {
      return this.discovery.load();
    }
  }

  /**
   * Replaces each fetched source's active rows (only inside `window` when given). An
   * `exhaustive` poll read the whole domain, so it also retires sources that were not
   * returned at all, unless upstream returned nothing, which is treated as a transient gap.
   */
  private async persist(
    records: NormalizedRecord[],
    expectedSources: Array<{ domain: Domain; source: string }> = [],
    { window, exhaustive = false }: PersistOptions = {},
  ): Promise<void> {
    const grouped = new Map<string, NormalizedRecord[]>();
    const sourceInfo = new Map<string, { domain: Domain; source: string }>();
    for (const expected of expectedSources) {
      const key = `${expected.domain}\0${expected.source}`;
      grouped.set(key, []);
      sourceInfo.set(key, expected);
    }
    for (const record of records) {
      const key = `${record.domain}\0${record.source}`;
      const group = grouped.get(key);
      if (group) group.push(record);
      else grouped.set(key, [record]);
      sourceInfo.set(key, { domain: record.domain, source: record.source });
    }
    await Promise.all([...grouped.entries()].map(([key, items]) => {
      const source = sourceInfo.get(key)!;
      return this.store.replaceSourceRecords(source.domain, source.source, items, undefined, window);
    }));
    const keep = new Map<Domain, string[]>();
    for (const { domain, source } of sourceInfo.values()) keep.set(domain, [...(keep.get(domain) ?? []), source]);
    const syncScope = window ? currentCampusDate(new Date(window.start)) : exhaustive ? FULL_SYNC_SCOPE : undefined;
    if (syncScope) await Promise.all([...keep.keys()].map((domain) => this.store.markDomainSynced(domain, syncScope)));
    if (!exhaustive || window || !records.length) return;
    await Promise.all([...keep.entries()].map(async ([domain, sources]) => {
      const retired = await this.store.deactivateMissingSources(domain, sources);
      if (retired) log('info', 'Retired records from sources no longer returned upstream', { domain, retired });
    }));
  }

  private async cachedRecords(
    domain: Domain,
    limit: number,
    fetchedAt: Date,
    predicate: ((item: JsonObject) => boolean) | undefined,
    pollIntervalMs: number,
  ): Promise<FeedResult<JsonObject>> {
    let items = await this.store.currentRecords(domain, Math.max(limit * 20, 500));
    if (predicate) items = items.filter(predicate);
    const dataAsOf = await this.store.latestRecordObservedAt(domain);
    if (!dataAsOf) return makeUnavailableResult(fetchedAt, domain);
    const sources = items.map((item) => typeof item.source === 'string' ? item.source : 'SwatGPT PostgreSQL cache');
    return makeCachedResult(items, fetchedAt, sources, dataAsOf, pollIntervalMs, limit);
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

function recordOverlapsRange(item: JsonObject, start: Date, end: Date): boolean {
  const rawStart = typeof item.start === 'string' ? item.start : typeof item.published === 'string' ? item.published : undefined;
  if (!rawStart) return true;
  const itemStart = new Date(rawStart);
  if (Number.isNaN(itemStart.getTime())) return true;
  const itemEnd = typeof item.end === 'string' ? new Date(item.end) : itemStart;
  const effectiveEnd = Number.isNaN(itemEnd.getTime()) ? itemStart : itemEnd;
  return itemStart <= end && effectiveEnd >= start;
}

function diningLocationMatches(value: string, query?: string): boolean {
  return campusHoursPlaceMatches(value, query);
}

function withHoursQueryMeta(
  result: FeedResult<JsonObject>,
  resolvedDate: string,
  input: { place?: string; category?: string },
): FeedResult<JsonObject> {
  const warning = result.meta.warning ?? (result.items.length === 0
    ? `The Dash returned no campus-hours entries matching${input.place ? ` place "${input.place}"` : ''}${input.category ? ` category "${input.category}"` : ''} for ${resolvedDate}; do not infer that the venue is closed.`
    : undefined);
  return { ...result, meta: { ...result.meta, resolved_date: resolvedDate, ...(warning ? { warning } : {}) } };
}

function normalizeDiningFilters(meal?: string, query?: string): { meal?: string; query?: string } {
  if (meal || !query) return { meal, query };
  const detectedMeal = query.toLocaleLowerCase().match(/\b(breakfast|brunch|lunch|dinner|supper)\b/)?.[1];
  if (!detectedMeal) return { query };
  const meaningfulQuery = query
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word && word !== detectedMeal && !DINING_QUERY_FILLER_WORDS.has(word))
    .join(' ');
  return { meal: detectedMeal, query: meaningfulQuery || undefined };
}

const DINING_QUERY_FILLER_WORDS = new Set([
  'a', 'an', 'any', 'anything', 'are', 'at', 'available', 'being', 'do', 'does',
  'for', 'have', 'is', 'menu', 'on', 's', 'served', 'serving', 'the', 'there',
  'this', 'today', 'tonight', 'what', 'whats', 'which', 'with',
]);

function makeResult<T>(items: T[], fetchedAt: Date, sources: string[], limit: number, dataAsOf = fetchedAt.toISOString()): FeedResult<T> {
  const bounded = items.slice(0, limit);
  return { items: bounded, meta: {
    source: [...new Set(sources)], fetched_at: fetchedAt.toISOString(), data_as_of: dataAsOf,
    stale: false, total: items.length, returned: bounded.length, truncated: items.length > bounded.length,
  } };
}

function makeCachedResult<T>(
  items: T[],
  fetchedAt: Date,
  sources: string[],
  dataAsOf: string,
  pollIntervalMs: number,
  limit = items.length,
): FeedResult<T> {
  const bounded = items.slice(0, limit);
  const cacheAgeMs = fetchedAt.getTime() - new Date(dataAsOf).getTime();
  const stale = !Number.isFinite(cacheAgeMs) || cacheAgeMs > pollIntervalMs * 2;
  return { items: bounded, meta: {
    source: [...new Set(sources.length ? sources : ['SwatGPT PostgreSQL cache'])],
    fetched_at: fetchedAt.toISOString(), data_as_of: dataAsOf, stale,
    total: items.length, returned: bounded.length, truncated: items.length > bounded.length,
    ...(stale ? { warning: `PostgreSQL cache is older than ${Math.round(pollIntervalMs * 2 / 1000)} seconds; the background Dash refresh may be failing.` } : {}),
  } };
}

function makeUnavailableResult(fetchedAt: Date, domain: Domain, warning?: string): FeedResult<JsonObject> {
  return { items: [], meta: {
    source: ['SwatGPT PostgreSQL cache'], fetched_at: fetchedAt.toISOString(),
    data_as_of: fetchedAt.toISOString(), stale: true, total: 0, returned: 0, truncated: false,
    warning: warning ?? `No cached ${domain} data is available yet; background synchronization will retry without blocking this chat.`,
  } };
}

function makeStaleResult<T>(
  items: T[],
  fetchedAt: Date,
  sources: string[],
  dataAsOf: string,
  error: unknown,
  context?: string,
): FeedResult<T> {
  return { items, meta: {
    source: sources, fetched_at: fetchedAt.toISOString(), data_as_of: dataAsOf, stale: true,
    total: items.length, returned: items.length, truncated: false,
    warning: [context, `Live Dash request failed; returning archived data: ${errorMessage(error)}`].filter(Boolean).join(' '),
  } };
}

function withWarning<T>(result: FeedResult<T>, warning?: string): FeedResult<T> {
  if (!warning) return result;
  return { ...result, meta: { ...result.meta, warning: [result.meta.warning, warning].filter(Boolean).join(' ') } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Dash sends `campusmessageon` as 0/1 (sometimes as a boolean or string). */
function isShown(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * Decides whether the polled events snapshot can answer [start, end]. The poll keeps today
 * through EVENTS_POLL_DAYS after its last run; later windows need a live read and earlier
 * days are only in the archive.
 */
function eventsCoverage(input: EventsInput, start: Date, end: Date, fetchedAt: Date, dataAsOf: string): EventsCoverage {
  const today = currentCampusDate(fetchedAt);
  const todayStart = new Date(campusDayRange(today).start);
  const pastWarning = `Events before ${today} are not in SwatGPT's upcoming-events snapshot; use search_archive for past events.`;
  if (end <= todayStart) return { kind: 'past', warning: pastWarning };
  const partialPast = start < todayStart ? pastWarning : undefined;
  const snapshotAt = new Date(dataAsOf).getTime();
  const polledThrough = (Number.isNaN(snapshotAt) ? fetchedAt.getTime() : snapshotAt) + EVENTS_POLL_DAYS * DAY_MS;
  if ((!input.start && !input.end) || end.getTime() <= polledThrough) return { kind: 'covered', warning: partialPast };
  const neededDays = Math.max(1, Math.ceil((end.getTime() - fetchedAt.getTime()) / DAY_MS));
  const beyond = neededDays > EVENTS_MAX_DAYS
    ? `The Dash lists events at most ${EVENTS_MAX_DAYS} days ahead; later events are not included.`
    : undefined;
  return {
    kind: 'live',
    days: Math.min(EVENTS_MAX_DAYS, neededDays),
    warning: [partialPast, beyond].filter(Boolean).join(' ') || undefined,
  };
}

function filterEvents(records: NormalizedRecord[], start: Date, end: Date, query?: string): NormalizedRecord[] {
  const inRange = filterRange(records, start, end);
  return query ? inRange.filter((record) => fuzzyMatch(record.searchText, query)) : inRange;
}

function cachedDepartures(payload: JsonObject): JsonObject[] {
  return Array.isArray(payload.departures) ? asObjects(payload.departures) : [payload];
}

/** Drops departures whose scheduled time plus reported delay is already past; unparseable times are kept. */
function upcomingDepartures(departures: JsonObject[], observedAt: Date, now: Date): JsonObject[] {
  const cutoff = now.getTime() - DEPARTURE_GRACE_MS;
  return departures.filter((departure) => {
    const instant = departureInstant(departure, observedAt);
    return instant === undefined || instant >= cutoff;
  });
}

const DEPARTURE_TIME = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*$/i;
const DELAY_MINUTES = /(\d+)\s*min/i;

/**
 * SEPTA reports `orig_departure_time` as a campus clock time such as "10:10AM" with no date,
 * and `orig_delay` as "On time" or "3 mins". The date is taken from the snapshot, shifted a
 * day when the clock time is more than twelve hours from it (a midnight rollover).
 */
export function departureInstant(departure: JsonObject, observedAt: Date): number | undefined {
  const match = typeof departure.orig_departure_time === 'string' ? DEPARTURE_TIME.exec(departure.orig_departure_time) : null;
  if (!match) return undefined;
  const hour = (Number(match[1]) % 12) + (match[3]!.toUpperCase() === 'P' ? 12 : 0);
  const scheduled = campusWallTime(currentCampusDate(observedAt), hour, Number(match[2])).getTime();
  const offset = scheduled - observedAt.getTime();
  const rollover = offset < -HALF_DAY_MS ? DAY_MS : offset > HALF_DAY_MS ? -DAY_MS : 0;
  const delayMinutes = Number(DELAY_MINUTES.exec(String(departure.orig_delay ?? ''))?.[1] ?? 0);
  return scheduled + rollover + delayMinutes * 60_000;
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
