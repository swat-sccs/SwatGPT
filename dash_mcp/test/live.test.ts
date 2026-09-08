import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { DashClient } from '../src/upstream/client.js';
import { RegistryDiscovery } from '../src/upstream/discovery.js';
import { queries } from '../src/upstream/queries.js';
import { campusDayRange, currentCampusDate } from '../src/util.js';

describe.skipIf(process.env.RUN_LIVE_TESTS !== 'true')('live Dash contract', () => {
  it('discovers current Gatsby configuration and reads the weather feed', async () => {
    const config = loadConfig({
      NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'false',
      UPSTREAM_TIMEOUT_MS: '15000', UPSTREAM_RETRIES: '1',
    });
    const client = new DashClient(config);
    const registry = await new RegistryDiscovery(client).load();
    const weather = await client.query<Record<string, unknown>>('Weather', queries.weather);
    const diningCenter = registry.dining.find((source) => source.sourceId === 'DCC');
    expect(diningCenter).toBeDefined();
    const range = campusDayRange(currentCampusDate());
    const dining = await client.query<Record<string, unknown>>('DiningMenu', queries.cbord, {
      calendarId: diningCenter!.sourceId,
      order: 'ASC',
      timeMin: range.start,
      timeMax: range.end,
      maxResults: 100,
    });

    expect(registry.hours.length).toBeGreaterThan(20);
    expect(registry.dining.length).toBeGreaterThan(3);
    expect(registry.news.length).toBeGreaterThan(5);
    expect(weather.data).toBeTypeOf('object');
    expect(dining.data).toBeInstanceOf(Array);
  }, 60_000);
});
