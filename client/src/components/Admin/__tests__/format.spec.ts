import {
  bucketFor,
  formatTick,
  rangeFor,
  formatDate,
  formatBucket,
  floorToMinute,
  formatRelative,
} from '../format';

const NOW = Date.parse('2026-10-05T12:34:56.789Z');

describe('admin format helpers', () => {
  it('labels day buckets by their UTC date, whatever the viewer time zone', () => {
    const utcMidnight = '2026-10-01T00:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(utcMidnight));
    expect(formatTick(utcMidnight, 'day')).toBe(expected);
    expect(formatTick(utcMidnight, 'day')).toMatch(/\b1\b/);
    expect(formatTick('2026-10-01T23:59:00.000Z', 'day')).toBe(expected);
  });

  it('does not shift day labels back a day for Eastern viewers', () => {
    const eastern = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
    const bucket = '2026-10-01T00:00:00.000Z';
    expect(eastern.format(new Date(bucket))).not.toBe(formatTick(bucket, 'day'));
  });

  it('labels a day bucket tooltip by its UTC date and an hour bucket by local time', () => {
    const utcMidnight = '2026-10-01T00:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(utcMidnight));
    expect(formatBucket(utcMidnight, 'day')).toBe(expected);
    expect(formatBucket(utcMidnight, 'hour')).toBe(formatDate(utcMidnight));
  });

  it('picks hourly buckets only for the 24h preset', () => {
    expect(bucketFor('24h')).toBe('hour');
    expect(bucketFor('7d')).toBe('day');
    expect(bucketFor('30d')).toBe('day');
    expect(bucketFor('all')).toBe('day');
  });

  it('aligns range ends to the minute', () => {
    expect(new Date(floorToMinute(NOW)).toISOString()).toBe('2026-10-05T12:34:00.000Z');
    expect(rangeFor('all', NOW)).toEqual({ to: '2026-10-05T12:34:00.000Z', all: true });
    expect(rangeFor('7d', NOW).to).toBe('2026-10-05T12:34:00.000Z');
    expect(rangeFor('24h', NOW).to).toBe('2026-10-05T12:34:00.000Z');
  });

  it('starts day presets at a UTC midnight so the first bar is a whole day', () => {
    expect(rangeFor('7d', NOW)).toEqual({
      from: '2026-09-28T00:00:00.000Z',
      to: '2026-10-05T12:34:00.000Z',
    });
    expect(rangeFor('30d', NOW).from).toBe('2026-09-05T00:00:00.000Z');
  });

  it('starts the 24h preset at the top of an hour so the first bar is a whole hour', () => {
    expect(rangeFor('24h', NOW).from).toBe('2026-10-04T12:00:00.000Z');
  });

  it('never trims the window shorter than the preset', () => {
    const presets = ['24h', '7d', '30d'] as const;
    const durations = { '24h': 1, '7d': 7, '30d': 30 };
    for (const preset of presets) {
      const { from = '', to } = rangeFor(preset, NOW);
      const spanMs = Date.parse(to) - Date.parse(from);
      expect(spanMs).toBeGreaterThanOrEqual(durations[preset] * 24 * 60 * 60 * 1000);
    }
  });

  it('describes past instants relative to now in the largest fitting unit', () => {
    const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
    expect(formatRelative(at(-20 * 1000), NOW)).toBe('now');
    expect(formatRelative(at(-5 * 60 * 1000), NOW)).toBe('5 minutes ago');
    expect(formatRelative(at(-59 * 60 * 1000), NOW)).toBe('59 minutes ago');
    expect(formatRelative(at(-3 * 60 * 60 * 1000), NOW)).toBe('3 hours ago');
    expect(formatRelative(at(-23 * 60 * 60 * 1000 - 30 * 60 * 1000), NOW)).toBe('23 hours ago');
    expect(formatRelative(at(-24 * 60 * 60 * 1000), NOW)).toBe('yesterday');
    expect(formatRelative(at(-9 * 24 * 60 * 60 * 1000), NOW)).toBe('9 days ago');
  });

  it('describes future instants too', () => {
    expect(formatRelative(new Date(NOW + 2 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      'in 2 hours',
    );
  });
});
