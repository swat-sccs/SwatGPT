const DAY_MS = 24 * 60 * 60 * 1000;

export const OVERSIGHT_RETENTION_ENV = 'OVERSIGHT_RETENTION_DAYS';

/** Positive whole number of days from `OVERSIGHT_RETENTION_DAYS`; `null` when unset or invalid. */
export function retentionDays(
  raw: string | undefined = process.env[OVERSIGHT_RETENTION_ENV],
): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const days = Number(trimmed);
  return Number.isInteger(days) && days > 0 ? days : null;
}

/**
 * When oversight rows written at `from` should fall off the TTL indexes, or `undefined`
 * when no retention window is configured (rows are kept until deleted by hand).
 */
export function retentionExpiry(
  from: number = Date.now(),
  days = retentionDays(),
): Date | undefined {
  return days == null ? undefined : new Date(from + days * DAY_MS);
}
