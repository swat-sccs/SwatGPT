import { RetentionMode } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ExpiryRequest } from './expiry';
import { resolveGenerationExpiry } from './expiry';

const HOUR_MS = 60 * 60 * 1000;

const request = (
  isTemporary: boolean | undefined,
  interfaceConfig?: AppConfig['interfaceConfig'],
): ExpiryRequest => ({ body: { isTemporary }, config: { interfaceConfig } });

describe('resolveGenerationExpiry', () => {
  it('returns null for a regular conversation', () => {
    expect(resolveGenerationExpiry(request(undefined))).toBeNull();
    expect(resolveGenerationExpiry(request(false, { temporaryChatRetention: 2 }))).toBeNull();
  });

  it('matches the temporary chat retention window', () => {
    const before = Date.now();
    const expiry = resolveGenerationExpiry(request(true, { temporaryChatRetention: 2 }));
    expect(expiry).toBeInstanceOf(Date);
    const delta = (expiry as Date).getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(2 * HOUR_MS);
    expect(delta).toBeLessThan(2 * HOUR_MS + 5000);
  });

  it('expires every conversation when retention mode is all', () => {
    const expiry = resolveGenerationExpiry(
      request(false, { retentionMode: RetentionMode.ALL, temporaryChatRetention: 1 }),
    );
    expect(expiry).toBeInstanceOf(Date);
  });
});
