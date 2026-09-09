import { Keyv } from 'keyv';
import type { BanEntry } from './bans';
import { createBanService, ADMIN_BAN_TYPE } from './bans';

const HOUR = 60 * 60 * 1000;
const START = new Date('2026-09-09T12:00:00.000Z').getTime();

describe('createBanService', () => {
  let store: Keyv;
  let enforcementCache: Keyv;

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    store = new Keyv({ namespace: 'BANS', ttl: 2 * HOUR });
    enforcementCache = new Keyv({ namespace: 'ban', ttl: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes a checkBan-compatible entry under the raw user id', async () => {
    const service = createBanService(store, { enforcementCache });

    const record = await service.ban('user-1', { durationMs: HOUR, reason: 'spam' });

    expect(record).toEqual({
      userId: 'user-1',
      reason: 'spam',
      expiresAt: new Date(START + HOUR).toISOString(),
    });
    await expect(store.get<BanEntry>('user-1')).resolves.toEqual({
      type: ADMIN_BAN_TYPE,
      reason: 'spam',
      duration: HOUR,
      expiresAt: START + HOUR,
    });
    await expect(enforcementCache.get<BanEntry>('user-1')).resolves.toMatchObject({
      type: ADMIN_BAN_TYPE,
      expiresAt: START + HOUR,
    });
    await expect(service.isBanned('user-1')).resolves.toBe(true);
  });

  it('prefixes the enforcement key like checkBan does under Redis', async () => {
    const service = createBanService(store, { enforcementCache, useRedis: true });

    await service.ban('user-1', { durationMs: HOUR });

    await expect(enforcementCache.get('ban_cache:user:user-1')).resolves.toBeDefined();
    await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();

    await service.unban('user-1');
    await expect(enforcementCache.get('ban_cache:user:user-1')).resolves.toBeUndefined();
  });

  it('falls back to the configured default duration', async () => {
    const service = createBanService(store, { defaultDurationMs: 3 * HOUR });

    const record = await service.ban('user-1', {});

    expect(record.expiresAt).toBe(new Date(START + 3 * HOUR).toISOString());
  });

  it('stores a permanent ban without expiresAt and never expires it', async () => {
    const service = createBanService(store, { enforcementCache, defaultDurationMs: 0 });

    const record = await service.ban('user-1', { reason: 'abuse' });

    expect(record).toEqual({ userId: 'user-1', reason: 'abuse', expiresAt: null });
    const entry = await store.get<BanEntry>('user-1');
    expect(entry).toEqual({ type: ADMIN_BAN_TYPE, reason: 'abuse', duration: 0 });
    expect(entry).not.toHaveProperty('expiresAt');

    jest.setSystemTime(START + 365 * 24 * HOUR);
    await expect(service.isBanned('user-1')).resolves.toBe(true);
    await expect(enforcementCache.get('user-1')).resolves.toBeDefined();
  });

  it('treats an explicit durationMs of 0 as permanent', async () => {
    const service = createBanService(store, { defaultDurationMs: HOUR });

    const record = await service.ban('user-1', { durationMs: 0 });

    expect(record.expiresAt).toBeNull();
  });

  it('reports an expired ban as lifted and clears the stale entries', async () => {
    const service = createBanService(store, { enforcementCache });
    await service.ban('user-1', { durationMs: HOUR });

    jest.setSystemTime(START + HOUR + 1);

    await expect(service.isBanned('user-1')).resolves.toBe(false);
    await expect(service.getBan('user-1')).resolves.toBeNull();
    await expect(store.get('user-1')).resolves.toBeUndefined();
    await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();
  });

  it('clears an expiresAt-bearing entry whose Keyv TTL outlives it', async () => {
    const service = createBanService(store, { enforcementCache });
    await store.set('user-1', { type: 'message_limit', duration: HOUR, expiresAt: START + HOUR });
    await enforcementCache.set('user-1', { type: 'message_limit', expiresAt: START + HOUR });

    jest.setSystemTime(START + HOUR + 1);

    await expect(service.isBanned('user-1')).resolves.toBe(false);
    await expect(store.get('user-1')).resolves.toBeUndefined();
    await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();
  });

  it('reads bans written by banViolation', async () => {
    const service = createBanService(store);
    await store.set('user-2', {
      type: 'message_limit',
      violation_count: 20,
      duration: HOUR,
      expiresAt: START + HOUR,
    });

    await expect(service.getBan('user-2')).resolves.toEqual({
      userId: 'user-2',
      reason: null,
      expiresAt: new Date(START + HOUR).toISOString(),
    });
  });

  it('ignores values that are not ban entries', async () => {
    const service = createBanService(store);
    await store.set('user-3', 'garbage');

    await expect(service.isBanned('user-3')).resolves.toBe(false);
    await expect(service.getBan('user-3')).resolves.toBeNull();
  });

  it('unban removes the ban from both stores', async () => {
    const service = createBanService(store, { enforcementCache });
    await service.ban('user-1', { durationMs: HOUR });

    await service.unban('user-1');

    await expect(service.isBanned('user-1')).resolves.toBe(false);
    await expect(store.get('user-1')).resolves.toBeUndefined();
    await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();
  });

  it('works without an enforcement cache', async () => {
    const service = createBanService(store);

    await service.ban('user-1', { durationMs: HOUR });
    await expect(service.isBanned('user-1')).resolves.toBe(true);
    await service.unban('user-1');
    await expect(service.isBanned('user-1')).resolves.toBe(false);
  });
});
