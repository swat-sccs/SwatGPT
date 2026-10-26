import { afterEach, describe, expect, it, vi } from 'vitest';
import { PgStore } from '../src/storage/store.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('replaceSourceRecords failure handling', () => {
  it('reports the write error, not the ROLLBACK error, when the connection has died', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const store = new PgStore('postgres://unused');
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
        if (sql === 'ROLLBACK') return Promise.reject(new Error('Connection terminated'));
        return Promise.reject(new Error('duplicate key value'));
      }),
      release: vi.fn(),
    };
    vi.spyOn(store.pool, 'connect').mockResolvedValue(client as never);

    await expect(store.replaceSourceRecords('news', 'News', [])).rejects.toThrow('duplicate key value');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
    await store.close();
  });
});
