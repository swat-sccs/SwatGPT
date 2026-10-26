import { logger } from '@librechat/data-schemas';
import type { DirectoryIntent } from './intent';
import type { DirectoryLoader } from './store';
import type { DirectoryLookup } from './match';
import { formatDirectoryContext, formatRateLimitContext } from './format';
import { getDirectoryIndex } from './store';
import { allowLookup } from './limiter';
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

/** Audits a person lookup the same way: who asked, how many matched, and whether the phrasing was explicit. */
function auditPersonLookup(
  intent: DirectoryIntent,
  lookup: DirectoryLookup,
  requester?: DirectoryRequester,
): void {
  if (intent.kind !== 'person' || lookup.kind !== 'person') {
    return;
  }
  logger.info('[directory] person lookup', {
    userId: requester?.userId ?? 'unknown',
    kind: intent.roommates ? 'roommates' : 'person',
    total: lookup.total,
    explicit: intent.explicit,
  });
}

/**
 * Resolves a housing question ("where does Jane Doe live?") against the
 * in-memory student directory and returns a context block for the model, or
 * `undefined` when the message is not a directory question. Fail-open: any
 * error yields `undefined` so the chat message is never affected. Every
 * lookup is logged with the requester's id and counts (never student data);
 * reverse lookups are additionally capped at `MAX_RESIDENTS`, and a user
 * over `DIRECTORY_LOOKUP_RATE` gets a block pointing at the official
 * directory instead of a result.
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
    if (!allowLookup(requester?.userId)) {
      return formatRateLimitContext();
    }
    const index = await getDirectoryIndex(load);
    if (!index) {
      return undefined;
    }
    const lookup = runLookup(intent, index);
    if (!lookup) {
      return undefined;
    }
    auditPersonLookup(intent, lookup, requester);
    auditReverseLookup(lookup, requester);
    return formatDirectoryContext(lookup);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[resolveDirectoryContext] lookup failed; continuing without context: ${message}`);
    return undefined;
  }
}
