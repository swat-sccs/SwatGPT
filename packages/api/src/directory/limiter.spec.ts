import { logger } from '@librechat/data-schemas';
import {
  allowLookup,
  DEFAULT_LOOKUP_RATE,
  parseLookupRate,
  resetDirectoryLimiter,
} from './limiter';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const warn = logger.warn as jest.Mock;
const MINUTE = 60 * 1000;

function allowedCount(userId: string | undefined, attempts: number): number {
  return Array.from({ length: attempts }).filter(() => allowLookup(userId)).length;
}

beforeEach(() => {
  resetDirectoryLimiter();
  warn.mockClear();
  delete process.env.DIRECTORY_LOOKUP_RATE;
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('parseLookupRate', () => {
  it.each([
    [undefined, DEFAULT_LOOKUP_RATE],
    ['', DEFAULT_LOOKUP_RATE],
    ['twenty per hour', DEFAULT_LOOKUP_RATE],
    ['5/0m', DEFAULT_LOOKUP_RATE],
    ['5/1m', { limit: 5, windowMs: MINUTE }],
    [' 100/2h ', { limit: 100, windowMs: 120 * MINUTE }],
    ['3/30s', { limit: 3, windowMs: 30 * 1000 }],
    ['0/10m', { limit: 0, windowMs: 10 * MINUTE }],
  ])('parses %j', (raw, expected) => {
    expect(parseLookupRate(raw)).toEqual(expected);
  });
});

describe('allowLookup', () => {
  it('allows the default 20 lookups per 10 minutes and blocks the rest', () => {
    expect(allowedCount('u1', 25)).toBe(DEFAULT_LOOKUP_RATE.limit);
    expect(allowLookup('u1')).toBe(false);
  });

  it('keeps users separate', () => {
    expect(allowedCount('u1', 20)).toBe(20);
    expect(allowLookup('u2')).toBe(true);
  });

  it('slides the window instead of resetting it', () => {
    process.env.DIRECTORY_LOOKUP_RATE = '3/10m';
    expect(allowLookup('u1')).toBe(true);
    jest.advanceTimersByTime(4 * MINUTE);
    expect(allowLookup('u1')).toBe(true);
    expect(allowLookup('u1')).toBe(true);
    expect(allowLookup('u1')).toBe(false);

    jest.advanceTimersByTime(6 * MINUTE + 1);
    expect(allowLookup('u1')).toBe(true);
    expect(allowLookup('u1')).toBe(false);

    jest.advanceTimersByTime(4 * MINUTE);
    expect(allowLookup('u1')).toBe(true);
    expect(allowLookup('u1')).toBe(true);
    expect(allowLookup('u1')).toBe(false);
  });

  it('does not extend the block by counting refused attempts', () => {
    process.env.DIRECTORY_LOOKUP_RATE = '2/10m';
    expect(allowedCount('u1', 10)).toBe(2);
    jest.advanceTimersByTime(10 * MINUTE + 1);
    expect(allowLookup('u1')).toBe(true);
  });

  it('logs once per window with the user id and the limit', () => {
    process.env.DIRECTORY_LOOKUP_RATE = '2/5m';
    allowedCount('u1', 10);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[directory] lookup rate limit reached', {
      userId: 'u1',
      limit: 2,
      windowMs: 5 * MINUTE,
    });

    jest.advanceTimersByTime(5 * MINUTE);
    allowedCount('u1', 5);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('never limits a request without a user id', () => {
    process.env.DIRECTORY_LOOKUP_RATE = '1/10m';
    expect(allowedCount(undefined, 5)).toBe(5);
  });

  it('is disabled by a zero limit', () => {
    process.env.DIRECTORY_LOOKUP_RATE = '0/10m';
    expect(allowedCount('u1', 50)).toBe(50);
    expect(warn).not.toHaveBeenCalled();
  });
});
