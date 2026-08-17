import { createHash } from 'node:crypto';
import { htmlToText } from 'html-to-text';
import type { JsonObject, NormalizedRecord } from './types.js';

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function cleanText(value: unknown, maxLength = 4_000): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === 'string' ? value : String(value);
  const text = htmlToText(raw, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] })
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function withoutTypename(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[nested data omitted]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => withoutTypename(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== '__typename' && key !== 'subscribeKey' && key !== 'editurl')
        .map(([key, item]) => [key, typeof item === 'string' ? cleanText(item) ?? '' : withoutTypename(item, depth + 1)]),
    );
  }
  return value;
}

export function normalizeRawRecord(
  domain: NormalizedRecord['domain'],
  source: string,
  raw: JsonObject,
  defaults: Partial<NormalizedRecord> = {},
): NormalizedRecord {
  const title = cleanText(raw.title ?? raw.sport_title ?? raw.periodname ?? defaults.title ?? source, 500) ?? source;
  const description = cleanText(raw.description ?? raw.text ?? raw.mcAbstractText ?? defaults.description);
  const start = stringValue(raw.startdate ?? raw.startTime ?? defaults.start);
  const end = stringValue(raw.enddate ?? defaults.end);
  const published = stringValue(raw.published ?? raw.date ?? defaults.published);
  const location = cleanText(raw.location ?? defaults.location, 500);
  const url = stringValue(raw.url ?? raw.story_url ?? raw.mcLink ?? defaults.url);
  const externalId = String(raw.id ?? raw.orig_train ?? contentHash(raw).slice(0, 24));
  const payload = withoutTypename(raw) as JsonObject;
  const searchText = [title, description, location, raw.source, raw.organization, raw.opponent, raw.eventtype]
    .map((item) => cleanText(item, 2_000))
    .filter(Boolean)
    .join(' ');
  return {
    domain,
    source,
    externalId,
    title,
    description,
    category: cleanText(raw.eventtype ?? raw.source ?? defaults.category, 300),
    location,
    url,
    start,
    end,
    published,
    searchText,
    payload,
  };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

export function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((item): item is JsonObject => Boolean(item)) : [];
}

export function fuzzyMatch(value: string, query?: string): boolean {
  if (!query) return true;
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = value.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function campusDayRange(date = currentCampusDate()): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD');
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return { start: campusMidnight(date).toISOString(), end: campusMidnight(nextDate).toISOString() };
}

export function currentCampusDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function campusMidnight(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return new Date(guess - (representedAsUtc - guess));
}

export function toPublicRecord(record: NormalizedRecord): JsonObject {
  const exposed = new Set(['id', 'title', 'description', 'url', 'startdate', 'enddate', 'published', 'date', 'location']);
  const details = Object.fromEntries(Object.entries(record.payload).filter(([key]) => !exposed.has(key)));
  return Object.fromEntries(Object.entries({
    id: record.externalId,
    title: record.title,
    description: record.description,
    category: record.category,
    location: record.location,
    url: record.url,
    start: record.start,
    end: record.end,
    published: record.published,
    source: record.source,
    details: Object.keys(details).length ? details : undefined,
  }).filter(([, value]) => value !== undefined));
}

export function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, details?: unknown) {
  const entry = { level, time: new Date().toISOString(), message, ...(details === undefined ? {} : { details }) };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
