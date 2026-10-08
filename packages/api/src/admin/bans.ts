import { Keyv } from 'keyv';
import { ViolationTypes } from 'librechat-data-provider';
import { cacheConfig, keyvMongo } from '~/cache';

/**
 * Minimal get/set/delete surface shared by every Keyv-backed cache in the app.
 * `ttl` is milliseconds; `0` means "never expire" (Keyv semantics).
 */
export interface KeyValueStore {
  get: (key: string) => Promise<unknown>;
  /** Batched read in input order; used when the backing store offers it. */
  getMany?: (keys: string[]) => Promise<unknown[]>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
}

export type BanStore = KeyValueStore;

export interface BanRecord {
  userId: string;
  reason: string | null;
  expiresAt: string | null;
  /** Source IP `banViolation` also banned; `checkBan` blocks on it independently of the user key. */
  ip: string | null;
}

export interface BanOptions {
  /** Ban length in milliseconds; `0` is permanent. Defaults to `BAN_DURATION`. */
  durationMs?: number;
  reason?: string;
}

/** Raw log entries for a user (and the IP a violation ban tied to them), for rollback. */
export interface BanSnapshot {
  entry: BanEntry | null;
  ipEntry: BanEntry | null;
}

export interface BanService {
  isBanned: (userId: string) => Promise<boolean>;
  /** Batched {@link BanService.isBanned}: one store round trip, results in input order. */
  areBanned: (userIds: string[]) => Promise<boolean[]>;
  getBan: (userId: string) => Promise<BanRecord | null>;
  /** Throws `RangeError` before writing anything when `durationMs` exceeds {@link MAX_BAN_DURATION_MS}. */
  ban: (userId: string, options: BanOptions) => Promise<BanRecord>;
  unban: (userId: string) => Promise<void>;
  snapshot: (userId: string) => Promise<BanSnapshot>;
  /** Puts back what {@link BanService.snapshot} captured, with the TTL it had left. */
  restore: (userId: string, snapshot: BanSnapshot) => Promise<void>;
}

export interface BanServiceOptions {
  /** Fallback ban length when `ban()` gets no `durationMs`; defaults to `cacheConfig.BAN_DURATION`. */
  defaultDurationMs?: number;
  /**
   * The fast-path cache `checkBan` consults before the ban log (Keyv namespace
   * `ViolationTypes.BAN` over `keyvMongo`). Written on ban so enforcement does not
   * depend on `BAN_DURATION`, and cleared on unban so a lifted ban takes effect
   * on the next request.
   */
  enforcementCache?: KeyValueStore;
  /** Mirrors `USE_REDIS`: `checkBan` prefixes enforcement-cache keys under Redis. */
  useRedis?: boolean;
}

/** Marks entries written through the admin API (violation bans carry the violation type). */
export const ADMIN_BAN_TYPE = 'admin';

/** Longest timed ban; anything longer should be a permanent ban (`durationMs: 0`). */
export const MAX_BAN_DURATION_MS: number = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Value shape stored under the user id in the `BANS` namespace. `checkBan` only
 * reads `expiresAt` (absent or non-numeric means permanent); the remaining
 * fields mirror what `banViolation` writes so both producers stay interchangeable.
 */
export interface BanEntry {
  type: string;
  reason?: string;
  duration: number;
  expiresAt?: number;
  user_id?: string;
  violation_count?: number;
  /** Set by `banViolation` on the user entry: the IP it also banned under its own key. */
  ip?: string;
}

function isBanEntry(value: unknown): value is BanEntry {
  return typeof value === 'object' && value !== null && 'type' in value;
}

/** `checkBan.getBanCacheKey(prefix, value, useRedis)` */
function enforcementKey(prefix: 'user' | 'ip', value: string, useRedis: boolean): string {
  return useRedis ? `ban_cache:${prefix}:${value}` : value;
}

/**
 * Expiry as epoch ms, or `null` for a permanent ban. `checkBan` treats a missing or
 * non-numeric `expiresAt` as permanent; a value too large for a `Date` is
 * effectively permanent there too, so it is reported the same way here.
 */
function expiryOf(entry: BanEntry): number | null {
  const expiresAt = Number(entry.expiresAt);
  if (!entry.expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) {
    return null;
  }
  return expiresAt;
}

function remainingMs(entry: BanEntry): number | null {
  const expiresAt = expiryOf(entry);
  return expiresAt === null ? null : expiresAt - Date.now();
}

export function toBanRecord(userId: string, entry: BanEntry): BanRecord {
  const expiresAt = expiryOf(entry);
  return {
    userId,
    reason: entry.reason ?? null,
    expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
    ip: entry.ip ?? null,
  };
}

/** The stored value as an active ban, `'expired'` when it ran out, or `null` when absent. */
function toActiveEntry(value: unknown): BanEntry | 'expired' | null {
  if (!isBanEntry(value)) {
    return null;
  }
  const remaining = remainingMs(value);
  return remaining !== null && remaining <= 0 ? 'expired' : value;
}

/** Keyv TTL that keeps `entry` alive exactly as long as it has left; `null` when already expired. */
function ttlOf(entry: BanEntry): number | null {
  const remaining = remainingMs(entry);
  if (remaining === null) {
    return 0;
  }
  return remaining > 0 ? remaining : null;
}

export function isValidBanDuration(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs >= 0 && durationMs <= MAX_BAN_DURATION_MS;
}

/**
 * Wraps the ban log `checkBan` enforces (`getLogStores(ViolationTypes.BAN)`) so
 * bans placed here are honored on the next request and lifted bans stop
 * immediately. Keys are raw user ids; see {@link BanEntry} for the value shape.
 */
export function createBanService(store: BanStore, options: BanServiceOptions = {}): BanService {
  const {
    defaultDurationMs = cacheConfig.BAN_DURATION,
    enforcementCache,
    useRedis = false,
  } = options;

  async function clear(userId: string): Promise<void> {
    await Promise.all([
      store.delete(userId),
      enforcementCache?.delete(enforcementKey('user', userId, useRedis)),
    ]);
  }

  /**
   * Lifts the IP ban `banViolation` wrote alongside the user ban. The log entry is
   * removed only while it still belongs to this user so a later ban of another
   * account behind the same address survives; the enforcement-cache key is always
   * dropped because `checkBan` re-caches it from the log if a ban remains.
   */
  async function clearIp(ip: string, userId: string): Promise<void> {
    const entry = await store.get(ip);
    const ownsEntry = isBanEntry(entry) && String(entry.user_id) === userId;
    await Promise.all([
      ownsEntry ? store.delete(ip) : undefined,
      enforcementCache?.delete(enforcementKey('ip', ip, useRedis)),
    ]);
  }

  async function unban(userId: string): Promise<void> {
    const entry = await store.get(userId);
    const ip = isBanEntry(entry) ? entry.ip : undefined;
    await Promise.all([clear(userId), ip ? clearIp(ip, userId) : undefined]);
  }

  async function readActive(userId: string): Promise<BanEntry | null> {
    const entry = toActiveEntry(await store.get(userId));
    if (entry !== 'expired') {
      return entry;
    }
    await clear(userId);
    return null;
  }

  async function readMany(userIds: string[]): Promise<unknown[]> {
    if (store.getMany) {
      return store.getMany(userIds);
    }
    return Promise.all(userIds.map((userId) => store.get(userId)));
  }

  async function areBanned(userIds: string[]): Promise<boolean[]> {
    if (userIds.length === 0) {
      return [];
    }
    const values = await readMany(userIds);
    const expired: string[] = [];
    const banned = userIds.map((userId, i) => {
      const entry = toActiveEntry(values[i]);
      if (entry === 'expired') {
        expired.push(userId);
      }
      return entry !== null && entry !== 'expired';
    });
    await Promise.all(expired.map(clear));
    return banned;
  }

  async function getBan(userId: string): Promise<BanRecord | null> {
    const entry = await readActive(userId);
    return entry ? toBanRecord(userId, entry) : null;
  }

  async function write(userId: string, entry: BanEntry, ttl: number): Promise<void> {
    await Promise.all([
      store.set(userId, entry, ttl),
      enforcementCache?.set(enforcementKey('user', userId, useRedis), entry, ttl),
    ]);
  }

  async function snapshot(userId: string): Promise<BanSnapshot> {
    const entry = await readActive(userId);
    if (!entry?.ip) {
      return { entry, ipEntry: null };
    }
    const ipEntry = await store.get(entry.ip);
    return { entry, ipEntry: isBanEntry(ipEntry) ? ipEntry : null };
  }

  async function restore(userId: string, { entry, ipEntry }: BanSnapshot): Promise<void> {
    const ttl = entry ? ttlOf(entry) : null;
    if (!entry || ttl === null) {
      await clear(userId);
      return;
    }
    const ipTtl = ipEntry ? ttlOf(ipEntry) : null;
    await Promise.all([
      write(userId, entry, ttl),
      entry.ip && ipEntry && ipTtl !== null ? store.set(entry.ip, ipEntry, ipTtl) : undefined,
    ]);
  }

  async function ban(userId: string, { durationMs, reason }: BanOptions): Promise<BanRecord> {
    const duration = durationMs ?? defaultDurationMs;
    if (!isValidBanDuration(duration)) {
      throw new RangeError(`Ban duration must be between 0 and ${MAX_BAN_DURATION_MS} ms`);
    }
    const permanent = !(duration > 0);
    const ttl = permanent ? 0 : duration;
    const ip = (await readActive(userId))?.ip;
    const entry: BanEntry = {
      type: ADMIN_BAN_TYPE,
      duration: ttl,
      ...(reason ? { reason } : {}),
      ...(ip ? { ip } : {}),
      ...(permanent ? {} : { expiresAt: Date.now() + duration }),
    };
    const record = toBanRecord(userId, entry);
    await write(userId, entry, ttl);
    return record;
  }

  return {
    isBanned: async (userId) => (await readActive(userId)) !== null,
    areBanned,
    getBan,
    ban,
    unban,
    snapshot,
    restore,
  };
}

let adminEnforcementCache: Keyv | undefined;

/**
 * The ban service the admin API uses in production: `banLog` is
 * `getLogStores(ViolationTypes.BAN)` and the enforcement cache is the same
 * `keyvMongo` namespace `checkBan` reads as its fast-path `banCache`.
 */
export function createAdminBanService(
  banLog: BanStore,
  options: Omit<BanServiceOptions, 'enforcementCache'> = {},
): BanService {
  adminEnforcementCache ??= new Keyv({
    store: keyvMongo,
    namespace: ViolationTypes.BAN,
    ttl: 0,
  });
  return createBanService(banLog, { ...options, enforcementCache: adminEnforcementCache });
}
