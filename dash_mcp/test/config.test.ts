import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://unused' };

describe('environment configuration', () => {
  it('reads only explicit boolean spellings for POLLING_ENABLED', () => {
    expect(loadConfig(base).pollingEnabled).toBe(true);
    expect(loadConfig({ ...base, POLLING_ENABLED: 'false' }).pollingEnabled).toBe(false);
    expect(loadConfig({ ...base, POLLING_ENABLED: '0' }).pollingEnabled).toBe(false);
    expect(loadConfig({ ...base, POLLING_ENABLED: '1' }).pollingEnabled).toBe(true);
  });

  it('rejects ambiguous boolean spellings instead of treating them as true', () => {
    for (const value of ['no', 'off', 'yes', 'on', 'FALSE', '']) {
      expect(() => loadConfig({ ...base, POLLING_ENABLED: value }), value).toThrow();
    }
  });

  it('requires DATABASE_URL instead of defaulting to embedded credentials', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'test', DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
