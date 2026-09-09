import { Types } from 'mongoose';

/** Raised by the query/body parsers below; handlers translate it into a 400. */
export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

/** Express may hand back arrays or nested objects; only a plain string is accepted. */
export function queryString(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new QueryError('Query parameters must be single strings');
  }
  return value;
}

export function parseLimit(value: unknown, fallback: number, max: number): number {
  const raw = queryString(value);
  if (raw == null) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new QueryError(`limit must be an integer between 1 and ${max}`);
  }
  return parsed;
}

export function parseBoolean(value: unknown, name: string): boolean | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new QueryError(`${name} must be "true" or "false"`);
}

export function parseIsoDate(value: unknown, name: string): Date | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new QueryError(`${name} must be an ISO-8601 date`);
  }
  return date;
}

export function parseDateRange(query: { from?: unknown; to?: unknown }): {
  from?: Date;
  to?: Date;
} {
  const from = parseIsoDate(query.from, 'from');
  const to = parseIsoDate(query.to, 'to');
  if (from && to && from > to) {
    throw new QueryError('from must not be after to');
  }
  return { from, to };
}

function isKeysetShape(cursor: string): boolean {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      Types.ObjectId.isValid(parsed[1])
    );
  } catch {
    return false;
  }
}

/** Accepts the opaque keyset cursor produced by the data layer; rejects anything else. */
export function parseCursor(value: unknown): string | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  if (!isKeysetShape(raw)) {
    throw new QueryError('cursor is invalid');
  }
  return raw;
}

export function parseEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: ReadonlyArray<T>,
): T | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  if (!allowed.includes(raw as T)) {
    throw new QueryError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

export function parseObjectId(value: unknown, name: string): string | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  if (!Types.ObjectId.isValid(raw) || raw.length !== 24) {
    throw new QueryError(`${name} must be a valid id`);
  }
  return raw;
}

export function parseText(
  value: unknown,
  name: string,
  { min = 1, max }: { min?: number; max: number },
): string | undefined {
  const raw = queryString(value);
  if (raw == null) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length < min) {
    throw new QueryError(`${name} must be at least ${min} character${min === 1 ? '' : 's'}`);
  }
  if (trimmed.length > max) {
    throw new QueryError(`${name} must not exceed ${max} characters`);
  }
  return trimmed;
}
