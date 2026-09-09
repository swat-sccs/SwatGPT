import { cacheConfig } from '~/cache';

/**
 * Minimal get/set/delete surface shared by every Keyv-backed cache in the app.
 * `ttl` is milliseconds; `0` means "never expire" (Keyv semantics).
 */
export interface KeyValueStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
}

export type BanStore = KeyValueStore;

export interface BanRecord {
  userId: string;
  reason: string | null;
  expiresAt: string | null;
}

export interface BanOptions {
  /** Ban length in milliseconds; `0` is permanent. Defaults to `BAN_DURATION`. */
  durationMs?: number;
  reason?: string;
}

export interface BanService {
  isBanned: (userId: string) => Promise<boolean>;
  getBan: (userId: string) => Promise<BanRecord | null>;
  ban: (userId: string, options: BanOptions) => Promise<BanRecord>;
  unban: (userId: string) => Promise<void>;
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
}

function isBanEntry(value: unknown): value is BanEntry {
  return typeof value === 'object' && value !== null && 'type' in value;
}

/** `checkBan.getBanCacheKey('user', userId, useRedis)` */
function enforcementKey(userId: string, useRedis: boolean): string {
  return useRedis ? `ban_cache:user:${userId}` : userId;
}

function remainingMs(entry: BanEntry): number | null {
  const expiresAt = Number(entry.expiresAt);
  if (!entry.expiresAt || Number.isNaN(expiresAt)) {
    return null;
  }
  return expiresAt - Date.now();
}

function toRecord(userId: string, entry: BanEntry): BanRecord {
  const remaining = remainingMs(entry);
  return {
    userId,
    reason: entry.reason ?? null,
    expiresAt: remaining === null ? null : new Date(Number(entry.expiresAt)).toISOString(),
  };
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
      enforcementCache?.delete(enforcementKey(userId, useRedis)),
    ]);
  }

  async function readActive(userId: string): Promise<BanEntry | null> {
    const value = await store.get(userId);
    if (!isBanEntry(value)) {
      return null;
    }
    const remaining = remainingMs(value);
    if (remaining !== null && remaining <= 0) {
      await clear(userId);
      return null;
    }
    return value;
  }

  async function getBan(userId: string): Promise<BanRecord | null> {
    const entry = await readActive(userId);
    return entry ? toRecord(userId, entry) : null;
  }

  async function ban(userId: string, { durationMs, reason }: BanOptions): Promise<BanRecord> {
    const duration = durationMs ?? defaultDurationMs;
    const permanent = !(duration > 0);
    const ttl = permanent ? 0 : duration;
    const entry: BanEntry = {
      type: ADMIN_BAN_TYPE,
      duration: ttl,
      ...(reason ? { reason } : {}),
      ...(permanent ? {} : { expiresAt: Date.now() + duration }),
    };
    await Promise.all([
      store.set(userId, entry, ttl),
      enforcementCache?.set(enforcementKey(userId, useRedis), entry, ttl),
    ]);
    return toRecord(userId, entry);
  }

  return {
    isBanned: async (userId) => (await readActive(userId)) !== null,
    getBan,
    ban,
    unban: clear,
  };
}
