import type { KbRetrievalQueries } from './query';
import type { KbPayload } from './search';

/** Identical questions arrive in bursts (retries, regenerations, classmates); a minute covers them. */
const TTL_MS = 60_000;
const MAX_ENTRIES = 256;

interface CacheEntry {
  chunks: KbPayload[];
  expiresAt: number;
}

/**
 * Short-lived in-process cache of successful retrievals (`hit` and `empty` only, never
 * failures). Entries expire after the TTL and the least recently used one is evicted
 * once the cache is full; Map insertion order serves as the recency order.
 */
export class RetrievalCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = TTL_MS,
    private readonly maxEntries = MAX_ENTRIES,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string, now = Date.now()): KbPayload[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.entries.delete(key);
    if (entry.expiresAt <= now) {
      return undefined;
    }
    this.entries.set(key, entry);
    return entry.chunks;
  }

  set(key: string, chunks: KbPayload[], now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { chunks, expiresAt: now + this.ttlMs });
    if (this.entries.size <= this.maxEntries) {
      return;
    }
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) {
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** The search queries and the rerank query together determine the result. */
export const cacheKey = (queries: KbRetrievalQueries): string =>
  JSON.stringify([queries.search, queries.rerank]);

export const retrievalCache = new RetrievalCache();
