import pLimit from 'p-limit';
import type { Config } from '../config.js';
import { asObject, log, stableStringify } from '../util.js';

interface GraphqlEnvelope {
  data?: { result?: unknown };
  errors?: Array<{ message?: string }>;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export class DashClient {
  readonly limit;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly config: Config, private readonly fetchImpl: typeof fetch = fetch) {
    this.limit = pLimit(config.upstreamConcurrency);
  }

  async query<T>(operationName: string, query: string, variables: Record<string, unknown> = {}, ttlSeconds = 60): Promise<T> {
    const key = `${operationName}:${stableStringify(variables)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;

    const request = this.limit(async () => {
      const params = new URLSearchParams({ query, operationName, variables: JSON.stringify(variables) });
      const envelope = await this.requestJson<GraphqlEnvelope>(`${this.config.dashBaseUrl}/graphql?${params.toString()}`, {
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'swatgpt-mcp/0.1 (public Swarthmore Dash reader)',
        },
      });
      if (envelope.errors?.length) {
        throw new Error(`Dash GraphQL error: ${envelope.errors.map((error) => error.message ?? 'unknown error').join('; ')}`);
      }
      if (!envelope.data || !('result' in envelope.data)) throw new Error('Dash GraphQL response did not contain data.result');
      this.cache.set(key, { value: envelope.data.result, expiresAt: Date.now() + ttlSeconds * 1000 });
      return envelope.data.result;
    });
    this.pending.set(key, request);
    try {
      return await request as T;
    } finally {
      this.pending.delete(key);
    }
  }

  async getJson<T>(path: string, ttlSeconds = 300): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.config.dashBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const key = `GET:${url}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const value = await this.limit(() => this.requestJson<T>(url, {
      headers: { accept: 'application/json', 'user-agent': 'swatgpt-mcp/0.1 (public Swarthmore Dash reader)' },
    }));
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return value;
  }

  clearCache() {
    this.cache.clear();
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.upstreamRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.upstreamTimeoutMs);
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const error = new Error(`Dash request failed with HTTP ${response.status}`);
          if (!retryable || attempt === this.config.upstreamRetries) throw error;
          lastError = error;
        } else {
          return await response.json() as T;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.name === 'AbortError') {
          lastError = new Error(`Dash request timed out after ${this.config.upstreamTimeoutMs}ms`);
          lastError.name = 'TimeoutError';
        }
        if (attempt === this.config.upstreamRetries || (lastError.name !== 'AbortError' && /HTTP 4\d\d/.test(lastError.message))) throw lastError;
      } finally {
        clearTimeout(timer);
      }
      const delay = Math.min(2_000, 150 * 2 ** attempt) + Math.floor(Math.random() * 100);
      log('warn', 'Retrying Dash request', { attempt: attempt + 1, delay, reason: lastError?.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError ?? new Error('Dash request failed');
  }
}

export function resultData(value: unknown): Record<string, unknown>[] {
  const object = asObject(value);
  const data = object?.data;
  return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}
