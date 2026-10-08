import { RetentionMode } from 'librechat-data-provider';
import { createTempChatExpirationDate } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';

/** The parts of a chat request that decide whether its conversation expires. */
export interface ExpiryRequest {
  body?: { isTemporary?: boolean | null };
  config?: Partial<Pick<AppConfig, 'interfaceConfig'>>;
}

/**
 * Expiry for rows tied to this turn (ledger, flags): the same date `saveConvo`
 * stamps on the conversation, or `null` when the conversation never expires.
 */
export function resolveGenerationExpiry(req: ExpiryRequest): Date | null {
  const interfaceConfig = req.config?.interfaceConfig;
  const expires =
    req.body?.isTemporary === true || interfaceConfig?.retentionMode === RetentionMode.ALL;
  return expires ? createTempChatExpirationDate(interfaceConfig) : null;
}
