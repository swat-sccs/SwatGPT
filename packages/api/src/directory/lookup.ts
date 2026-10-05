import { logger } from '@librechat/data-schemas';
import type { DirectoryLoader } from './store';
import type { DirectoryLookup } from './match';
import { formatDirectoryContext } from './format';
import { getDirectoryIndex } from './store';
import { detectIntent } from './intent';
import { runLookup } from './match';

export interface DirectoryRequester {
  userId?: string;
}

type ReverseKind = 'room' | 'floor' | 'dorm' | 'roommates';

interface ReverseAudit {
  kind: ReverseKind;
  total: number;
  returned: number;
}

function isEnabled(): boolean {
  return process.env.DIRECTORY_LOOKUP_ENABLED !== 'false';
}

function placeKind(lookup: Extract<DirectoryLookup, { kind: 'place' }>): ReverseKind {
  if (lookup.room !== undefined) {
    return 'room';
  }
  return lookup.floor !== undefined ? 'floor' : 'dorm';
}

function reverseAudit(lookup: DirectoryLookup): ReverseAudit | undefined {
  if (lookup.kind === 'place') {
    return { kind: placeKind(lookup), total: lookup.total, returned: lookup.residents.length };
  }
  if (lookup.roommates === undefined) {
    return undefined;
  }
  return {
    kind: 'roommates',
    total: lookup.roommateTotal ?? lookup.roommates.length,
    returned: lookup.roommates.length,
  };
}

/** Audits a reverse lookup: requester id, lookup kind, and counts only, never student data. */
function auditReverseLookup(lookup: DirectoryLookup, requester?: DirectoryRequester): void {
  const audit = reverseAudit(lookup);
  if (!audit) {
    return;
  }
  logger.info('[directory] reverse lookup', { userId: requester?.userId ?? 'unknown', ...audit });
}

/**
 * Resolves a housing question ("where does Jane Doe live?") against the
 * in-memory student directory and returns a context block for the model, or
 * `undefined` when the message is not a directory question. Fail-open: any
 * error yields `undefined` so the chat message is never affected. Reverse
 * lookups are capped at `MAX_RESIDENTS` and logged with the requester's id.
 */
export async function resolveDirectoryContext(
  text: string,
  load: DirectoryLoader,
  requester?: DirectoryRequester,
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
    if (!lookup) {
      return undefined;
    }
    auditReverseLookup(lookup, requester);
    return formatDirectoryContext(lookup);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[resolveDirectoryContext] lookup failed; continuing without context: ${message}`);
    return undefined;
  }
}
