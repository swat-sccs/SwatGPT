import type { KbPayload } from './search';
import { RetrievalCache, cacheKey } from './cache';

const chunk = (id: number): KbPayload => ({
  text: `text ${id}`,
  title: `Title ${id}`,
  source: `https://kb.test/${id}`,
});

describe('RetrievalCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns stored chunks until the TTL elapses', () => {
    const cache = new RetrievalCache(60_000, 256);
    cache.set('q', [chunk(1)]);

    jest.advanceTimersByTime(59_999);
    expect(cache.get('q')).toEqual([chunk(1)]);
    jest.advanceTimersByTime(1);
    expect(cache.get('q')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('caches empty results as a value distinct from a miss', () => {
    const cache = new RetrievalCache();
    cache.set('q', []);
    expect(cache.get('q')).toEqual([]);
    expect(cache.get('other')).toBeUndefined();
  });

  it('evicts the least recently used entry once full', () => {
    const cache = new RetrievalCache(60_000, 2);
    cache.set('a', [chunk(1)]);
    cache.set('b', [chunk(2)]);
    expect(cache.get('a')).toEqual([chunk(1)]);
    cache.set('c', [chunk(3)]);

    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toEqual([chunk(1)]);
    expect(cache.get('c')).toEqual([chunk(3)]);
  });

  it('replacing an entry refreshes its TTL', () => {
    const cache = new RetrievalCache(60_000, 256);
    cache.set('q', [chunk(1)]);
    jest.advanceTimersByTime(50_000);
    cache.set('q', [chunk(2)]);
    jest.advanceTimersByTime(50_000);
    expect(cache.get('q')).toEqual([chunk(2)]);
  });
});

describe('cacheKey', () => {
  it('depends on every search query and the rerank query', () => {
    const single = cacheKey({ search: ['eduroam'], rerank: 'eduroam' });
    expect(cacheKey({ search: ['eduroam'], rerank: 'eduroam' })).toBe(single);
    expect(cacheKey({ search: ['eduroam', 'wifi\neduroam'], rerank: 'wifi\neduroam' })).not.toBe(
      single,
    );
    expect(cacheKey({ search: ['eduroam'], rerank: 'wifi' })).not.toBe(single);
  });
});
