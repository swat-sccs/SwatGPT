import { logger } from '@librechat/data-schemas';

export interface LookupRate {
  limit: number;
  windowMs: number;
}

export const DEFAULT_LOOKUP_RATE: LookupRate = { limit: 20, windowMs: 10 * 60 * 1000 };

const RATE_PATTERN = /^(\d+)\/(\d+)(s|m|h)$/;
const UNIT_MS: Record<'s' | 'm' | 'h', number> = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };

interface LookupWindow {
  hits: number[];
  warnedAt?: number;
}

const windows = new Map<string, LookupWindow>();

/** Parses `DIRECTORY_LOOKUP_RATE` such as `20/10m`; a limit of 0 disables the limiter, malformed values use the default. */
export function parseLookupRate(raw: string | undefined): LookupRate {
  const match = RATE_PATTERN.exec(raw?.trim() ?? '');
  if (!match) {
    return DEFAULT_LOOKUP_RATE;
  }
  const windowMs = Number(match[2]) * UNIT_MS[match[3] as keyof typeof UNIT_MS];
  if (windowMs <= 0) {
    return DEFAULT_LOOKUP_RATE;
  }
  return { limit: Number(match[1]), windowMs };
}

function currentRate(): LookupRate {
  return parseLookupRate(process.env.DIRECTORY_LOOKUP_RATE);
}

function warnOncePerWindow(
  userId: string,
  window: LookupWindow,
  rate: LookupRate,
  now: number,
): void {
  if (window.warnedAt !== undefined && now - window.warnedAt < rate.windowMs) {
    return;
  }
  window.warnedAt = now;
  logger.warn('[directory] lookup rate limit reached', {
    userId,
    limit: rate.limit,
    windowMs: rate.windowMs,
  });
}

/**
 * Sliding-window limit on directory lookups per user. Returns `true` and
 * records the lookup when the user is under the limit; otherwise `false`,
 * logging once per window. Requests without a user id are not limited.
 */
export function allowLookup(userId: string | undefined, now: number = Date.now()): boolean {
  const rate = currentRate();
  if (userId === undefined || rate.limit === 0) {
    return true;
  }
  const window = windows.get(userId) ?? { hits: [] };
  window.hits = window.hits.filter((at) => now - at < rate.windowMs);
  if (window.hits.length >= rate.limit) {
    warnOncePerWindow(userId, window, rate, now);
    windows.set(userId, window);
    return false;
  }
  window.hits.push(now);
  windows.set(userId, window);
  return true;
}

export function resetDirectoryLimiter(): void {
  windows.clear();
}
