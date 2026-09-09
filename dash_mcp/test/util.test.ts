import { afterEach, describe, expect, it, vi } from 'vitest';
import { campusDayRange, cleanText, contentHash, currentLogLevel, log, normalizeRawRecord, setLogLevel } from '../src/util.js';

describe('utility normalization', () => {
  it('normalizes HTML and strips subscription/edit-only fields', () => {
    const record = normalizeRawRecord('events', 'SwatCentral', {
      id: 'event-1', title: '<strong>Lecture</strong>', description: '<p>Hello&nbsp;campus</p>',
      startdate: '2026-08-20T18:00:00-04:00', subscribeKey: 'secretish', editurl: 'https://example/edit',
    });
    expect(record.title).toBe('Lecture');
    expect(record.description).toBe('Hello campus');
    expect(record.payload).not.toHaveProperty('subscribeKey');
    expect(record.payload).not.toHaveProperty('editurl');
  });

  it('creates stable hashes independent of object key order', () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it('uses the correct campus UTC offset in summer and winter', () => {
    expect(campusDayRange('2026-08-16').start).toBe('2026-08-16T04:00:00.000Z');
    expect(campusDayRange('2026-01-16').start).toBe('2026-01-16T05:00:00.000Z');
  });

  it('bounds normalized text', () => {
    expect(cleanText('abcdef', 4)).toBe('abc…');
  });

  describe('log level filtering', () => {
    afterEach(() => {
      setLogLevel('info');
      vi.restoreAllMocks();
    });

    it('drops entries below the configured level and keeps the rest', () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      setLogLevel('warn');
      log('debug', 'hidden');
      log('info', 'hidden');
      log('warn', 'shown', { job: 'content' });
      log('error', 'shown');

      expect(currentLogLevel()).toBe('warn');
      expect(stderr).toHaveBeenCalledTimes(2);
      const first = JSON.parse(String(stderr.mock.calls[0]?.[0]));
      expect(first).toMatchObject({ level: 'warn', message: 'shown', details: { job: 'content' } });
    });

    it('defaults to info so debug entries stay quiet', () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      log('debug', 'hidden');
      log('info', 'shown');
      expect(stderr).toHaveBeenCalledTimes(1);
    });
  });
});
