import type { TAdminUsageBucket, TAdminUsageRange } from 'librechat-data-provider';

export const EMPTY_VALUE = '—';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const hourTick = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const dayTick = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

type Nullable = number | null | undefined;

export const formatCompact = (value: Nullable): string =>
  value == null ? EMPTY_VALUE : compact.format(value);

export const formatInt = (value: Nullable): string =>
  value == null ? EMPTY_VALUE : integer.format(value);

export const formatRate = (rate: Nullable): string =>
  rate == null ? EMPTY_VALUE : percent.format(rate);

export const formatMs = (ms: Nullable): string => {
  if (ms == null) {
    return EMPTY_VALUE;
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
};

export const formatDate = (iso: string | null | undefined): string =>
  iso ? dateTime.format(new Date(iso)) : EMPTY_VALUE;

export const formatTick = (iso: string, bucket: TAdminUsageBucket): string =>
  (bucket === 'hour' ? hourTick : dayTick).format(new Date(iso));

export const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

export type TRangePreset = '24h' | '7d' | '30d';

export const RANGE_PRESETS: readonly TRangePreset[] = ['24h', '7d', '30d'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const presetDurations: Record<TRangePreset, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

export const bucketFor = (preset: TRangePreset): TAdminUsageBucket =>
  preset === '24h' ? 'hour' : 'day';

/** Builds ISO bounds for a preset, aligned to the minute so query keys stay stable. */
export const rangeFor = (preset: TRangePreset, now: number = Date.now()): TAdminUsageRange => {
  const to = Math.floor(now / 60000) * 60000;
  return {
    from: new Date(to - presetDurations[preset]).toISOString(),
    to: new Date(to).toISOString(),
  };
};

const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const fromLocalInput = (value: string): string | undefined =>
  value ? new Date(value).toISOString() : undefined;

export const toDateInput = (iso: string | undefined): string => (iso ? toLocalInput(iso) : '');
