import { logger } from '@librechat/data-schemas';
import type {
  AuditAction,
  AuditMetadata,
  RecordAuditEntryInput,
  RecordAuditEntryOptions,
} from '@librechat/data-schemas';
import type { ServerRequest } from '~/types/http';
import { buildAuditContext } from '~/admin/context';

export interface OversightActor {
  userId: string;
  name: string;
  tenantId?: string;
}

export interface OversightAuditDeps {
  recordAuditEntry: (
    input: RecordAuditEntryInput,
    options?: RecordAuditEntryOptions,
  ) => Promise<unknown>;
  /**
   * When true, a failed audit write surfaces as a 5xx and the handler must not
   * return the content it was about to disclose. Defaults to fail-open (log and
   * continue) so an audit outage never blocks oversight.
   */
  auditFailClosed?: boolean;
}

export interface OversightAuditEvent {
  action: AuditAction;
  actor: OversightActor;
  conversationId: string;
  title: string;
  metadata: AuditMetadata;
  req: ServerRequest;
}

/** Reads the acting admin from the JWT-loaded `req.user`; no database round-trip. */
export function resolveActor(req: ServerRequest): OversightActor | null {
  const user = req.user;
  if (!user) {
    return null;
  }
  const userId = user._id?.toString() ?? user.id;
  if (!userId) {
    return null;
  }
  return {
    userId,
    name: user.name || user.username || user.email || userId,
    tenantId: user.tenantId,
  };
}

/**
 * Builds the audit emitter shared by the conversation and flag handlers. The
 * returned function throws only under `auditFailClosed`; callers map that to a
 * 500 and withhold the response body.
 */
export function createOversightAudit(
  deps: OversightAuditDeps,
  scope: string,
): (event: OversightAuditEvent) => Promise<void> {
  const { recordAuditEntry, auditFailClosed } = deps;

  return async function emit(event: OversightAuditEvent): Promise<void> {
    const input: RecordAuditEntryInput = {
      action: event.action,
      outcome: 'success',
      actor: { type: 'user', id: event.actor.userId, name: event.actor.name },
      target: { type: 'conversation', id: event.conversationId, name: event.title },
      metadata: event.metadata,
      context: buildAuditContext(event.req),
      tenantId: event.actor.tenantId,
    };
    if (auditFailClosed) {
      await recordAuditEntry(input, { failClosed: true });
      return;
    }
    try {
      await recordAuditEntry(input);
    } catch (error) {
      logger.error(`[${scope}] audit write failed (fail-open)`, error);
    }
  };
}
