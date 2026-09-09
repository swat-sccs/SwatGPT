import { logger } from '@librechat/data-schemas';
import type { DirectoryLoader } from './store';
import { formatDirectoryContext } from './format';
import { getDirectoryIndex } from './store';
import { detectIntent } from './intent';
import { runLookup } from './match';

function isEnabled(): boolean {
  return process.env.DIRECTORY_LOOKUP_ENABLED !== 'false';
}

/**
 * Resolves a housing question ("where does Jane Doe live?") against the
 * in-memory student directory and returns a context block for the model, or
 * `undefined` when the message is not a directory question. Fail-open: any
 * error yields `undefined` so the chat message is never affected.
 */
export async function resolveDirectoryContext(
  text: string,
  load: DirectoryLoader,
): Promise<string | undefined> {
  try {
    if (!isEnabled()) {
      return undefined;
    }
    const intent = detectIntent(text);
    if (!intent) {
      return undefined;
    }
    const index = await getDirectoryIndex(load);
    if (!index) {
      return undefined;
    }
    const lookup = runLookup(intent, index);
    return lookup ? formatDirectoryContext(lookup) : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[resolveDirectoryContext] lookup failed; continuing without context: ${message}`);
    return undefined;
  }
}
