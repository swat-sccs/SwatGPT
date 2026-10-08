import { Keyv } from 'keyv';
import type { BanEntry } from './bans';
import { ADMIN_BAN_TYPE, createBanService, MAX_BAN_DURATION_MS } from './bans';

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
      ip: null,
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

    expect(record).toEqual({ userId: 'user-1', reason: 'abuse', expiresAt: null, ip: null });
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
      ip: null,
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

  it.each([MAX_BAN_DURATION_MS + 1, 1e16, Number.POSITIVE_INFINITY, -1])(
    'rejects durationMs %p before writing anything',
    async (durationMs) => {
      const service = createBanService(store, { enforcementCache });

      await expect(service.ban('user-1', { durationMs })).rejects.toThrow(RangeError);

      await expect(store.get('user-1')).resolves.toBeUndefined();
      await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();
    },
  );

  it('accepts the maximum duration', async () => {
    const service = createBanService(store);

    const record = await service.ban('user-1', { durationMs: MAX_BAN_DURATION_MS });

    expect(record.expiresAt).toBe(new Date(START + MAX_BAN_DURATION_MS).toISOString());
  });

  it('reports an entry whose expiresAt is too large for a Date as permanent', async () => {
    const service = createBanService(store);
    await store.set('user-1', { type: ADMIN_BAN_TYPE, duration: 1e16, expiresAt: START + 1e16 });

    await expect(service.getBan('user-1')).resolves.toMatchObject({ expiresAt: null });
    await expect(service.isBanned('user-1')).resolves.toBe(true);
  });

  describe('areBanned', () => {
    async function seedMixed(): Promise<void> {
      await store.set('active', { type: ADMIN_BAN_TYPE, duration: HOUR, expiresAt: START + HOUR });
      await store.set('permanent', { type: ADMIN_BAN_TYPE, duration: 0 }, 0);
      await store.set('expired', { type: ADMIN_BAN_TYPE, duration: HOUR, expiresAt: START - 1 }, 0);
      await enforcementCache.set('expired', { type: ADMIN_BAN_TYPE, expiresAt: START - 1 });
    }

    const ids = ['missing', 'active', 'expired', 'permanent', 'active'];
    const expected = [false, true, false, true, true];

    it('returns an empty list without touching the store', async () => {
      const getMany = jest.spyOn(store, 'getMany');
      const service = createBanService(store, { enforcementCache });

      await expect(service.areBanned([])).resolves.toEqual([]);
      expect(getMany).not.toHaveBeenCalled();
    });

    it('reads in one batch, keeps input order and clears expired entries', async () => {
      await seedMixed();
      const getMany = jest.spyOn(store, 'getMany');
      const get = jest.spyOn(store, 'get');
      const service = createBanService(store, { enforcementCache });

      await expect(service.areBanned(ids)).resolves.toEqual(expected);

      expect(getMany).toHaveBeenCalledTimes(1);
      expect(getMany).toHaveBeenCalledWith(ids);
      expect(get).not.toHaveBeenCalled();
      await expect(store.get('expired')).resolves.toBeUndefined();
      await expect(enforcementCache.get('expired')).resolves.toBeUndefined();
      await expect(store.get('active')).resolves.toBeDefined();
    });

    it('falls back to per-key reads when the store has no getMany', async () => {
      await seedMixed();
      const plain = {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown, ttl?: number) => store.set(key, value, ttl),
        delete: (key: string) => store.delete(key),
      };
      const service = createBanService(plain, { enforcementCache });

      await expect(service.areBanned(ids)).resolves.toEqual(expected);
      await expect(store.get('expired')).resolves.toBeUndefined();
    });

    it('agrees with isBanned for every id', async () => {
      await seedMixed();
      const service = createBanService(store, { enforcementCache });
      const single = await Promise.all(
        ['missing', 'active', 'permanent'].map((id) => service.isBanned(id)),
      );

      await expect(service.areBanned(['missing', 'active', 'permanent'])).resolves.toEqual(single);
    });
  });

  describe('snapshot / restore', () => {
    it('restores a timed ban with the time it had left', async () => {
      const service = createBanService(store, { enforcementCache });
      await service.ban('user-1', { durationMs: HOUR, reason: 'spam' });
      const prior = await service.snapshot('user-1');

      await service.ban('user-1', { durationMs: 0, reason: 'worse' });
      await service.restore('user-1', prior);

      await expect(service.getBan('user-1')).resolves.toMatchObject({
        reason: 'spam',
        expiresAt: new Date(START + HOUR).toISOString(),
      });
      await expect(enforcementCache.get('user-1')).resolves.toMatchObject({ reason: 'spam' });
      jest.setSystemTime(START + HOUR + 1);
      await expect(service.isBanned('user-1')).resolves.toBe(false);
    });

    it('restoring an empty snapshot lifts a ban placed after it', async () => {
      const service = createBanService(store, { enforcementCache });
      const prior = await service.snapshot('user-1');
      expect(prior).toEqual({ entry: null, ipEntry: null });

      await service.ban('user-1', { durationMs: HOUR });
      await service.restore('user-1', prior);

      await expect(service.isBanned('user-1')).resolves.toBe(false);
      await expect(enforcementCache.get('user-1')).resolves.toBeUndefined();
    });

    it('puts back the IP ban an unban removed', async () => {
      const service = createBanService(store, { enforcementCache });
      const base = { type: 'message_limit', duration: HOUR, expiresAt: START + HOUR };
      await store.set('user-2', { ...base, ip: '130.58.1.2' });
      await store.set('130.58.1.2', { ...base, user_id: 'user-2' });
      const prior = await service.snapshot('user-2');

      await service.unban('user-2');
      await service.restore('user-2', prior);

      await expect(store.get('user-2')).resolves.toMatchObject({ ip: '130.58.1.2' });
      await expect(store.get('130.58.1.2')).resolves.toMatchObject({ user_id: 'user-2' });
    });
  });

  describe('violation bans that also banned the source IP', () => {
    const IP = '130.58.1.2';

    async function seedViolationBan(userId: string, ip?: string): Promise<void> {
      const base = { type: 'message_limit', violation_count: 20, duration: HOUR };
      await store.set(userId, { ...base, expiresAt: START + HOUR, ...(ip ? { ip } : {}) });
      await store.set(IP, { ...base, user_id: userId, expiresAt: START + HOUR });
    }

    it('reports the banned IP on the record', async () => {
      const service = createBanService(store);
      await seedViolationBan('user-2', IP);

      await expect(service.getBan('user-2')).resolves.toMatchObject({ ip: IP });
    });

    it.each([
      { useRedis: false, userKey: 'user-2', ipKey: IP },
      { useRedis: true, userKey: 'ban_cache:user:user-2', ipKey: `ban_cache:ip:${IP}` },
    ])(
      'unban lifts the user and IP bans from both stores (useRedis=$useRedis)',
      async ({ useRedis, userKey, ipKey }) => {
        const service = createBanService(store, { enforcementCache, useRedis });
        await seedViolationBan('user-2', IP);
        const cached = { type: 'message_limit', user_id: 'user-2', expiresAt: START + HOUR };
        await enforcementCache.set(userKey, cached);
        await enforcementCache.set(ipKey, cached);

        await service.unban('user-2');

        await expect(store.get('user-2')).resolves.toBeUndefined();
        await expect(store.get(IP)).resolves.toBeUndefined();
        await expect(enforcementCache.get(userKey)).resolves.toBeUndefined();
        await expect(enforcementCache.get(ipKey)).resolves.toBeUndefined();
        await expect(service.isBanned('user-2')).resolves.toBe(false);
      },
    );

    it("keeps another user's later ban on the same IP in the log", async () => {
      const service = createBanService(store, { enforcementCache });
      await seedViolationBan('user-2', IP);
      await store.set(IP, {
        type: 'message_limit',
        user_id: 'user-3',
        duration: HOUR,
        expiresAt: START + HOUR,
      });
      await enforcementCache.set(IP, { type: 'message_limit', user_id: 'user-3' });

      await service.unban('user-2');

      await expect(store.get('user-2')).resolves.toBeUndefined();
      await expect(store.get(IP)).resolves.toMatchObject({ user_id: 'user-3' });
      await expect(enforcementCache.get(IP)).resolves.toBeUndefined();
    });

    it('keeps the banned IP when an admin re-bans so a later unban still lifts it', async () => {
      const service = createBanService(store, { enforcementCache });
      await seedViolationBan('user-2', IP);

      const record = await service.ban('user-2', { durationMs: 2 * HOUR, reason: 'extend' });
      expect(record).toMatchObject({ reason: 'extend', ip: IP });

      await service.unban('user-2');

      await expect(store.get('user-2')).resolves.toBeUndefined();
      await expect(store.get(IP)).resolves.toBeUndefined();
    });

    it('leaves the IP log entry alone when the user entry does not name it', async () => {
      const service = createBanService(store, { enforcementCache });
      await seedViolationBan('user-2');

      await service.unban('user-2');

      await expect(store.get('user-2')).resolves.toBeUndefined();
      await expect(store.get(IP)).resolves.toMatchObject({ user_id: 'user-2' });
    });
  });
});
