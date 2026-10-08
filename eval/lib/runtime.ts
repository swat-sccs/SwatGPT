import { createRequire } from 'node:module';

export type LibreChatApi = typeof import('@librechat/api', {
  with: { 'resolution-mode': 'require' }
});

const require = createRequire(import.meta.url);

/**
 * The built `@librechat/api` package (CommonJS-only exports), so the eval formats
 * context and derives retrieval queries with exactly the code production runs.
 */
export const librechatApi = require('@librechat/api') as LibreChatApi;

/** Retrieval inputs production derives from the conversation (`buildKbQueries`). */
export type KbQueries = ReturnType<LibreChatApi['buildKbQueries']>;
