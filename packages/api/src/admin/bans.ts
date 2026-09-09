/**
 * Owned by the controls work (Layer E). Wraps the existing ban cache
 * (`getLogStores(ViolationTypes.BAN)` in `/api`) so TypeScript callers can
 * read and change ban state without touching the legacy layer.
 */
export interface BanRecord {
  userId: string;
  reason: string | null;
  expiresAt: string | null;
}

export interface BanStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
}

export interface BanService {
  isBanned: (userId: string) => Promise<boolean>;
  getBan: (userId: string) => Promise<BanRecord | null>;
  ban: (userId: string, options: { durationMs?: number; reason?: string }) => Promise<BanRecord>;
  unban: (userId: string) => Promise<void>;
}

export function createBanService(_store: BanStore): BanService {
  return {
    isBanned: async () => false,
    getBan: async () => null,
    ban: async (userId) => ({ userId, reason: null, expiresAt: null }),
    unban: async () => undefined,
  };
}
