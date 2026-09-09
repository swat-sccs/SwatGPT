import { logger } from '@librechat/data-schemas';
import type {
  TAdminConversationsResponse,
  TAdminConversationsSort,
  TAdminFlagRequest,
} from 'librechat-data-provider';
import type { AuditLogMethods, FlagMethods, OversightMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { OversightAuditDeps } from '~/oversight/audit';
import type { ServerRequest } from '~/types/http';
import { createOversightAudit, resolveActor } from '~/oversight/audit';
import { writeConversationJsonl } from '~/oversight/export';
import {
  QueryError,
  parseBoolean,
  parseCursor,
  parseDateRange,
  parseEnum,
  parseLimit,
  parseObjectId,
  parseText,
} from '~/oversight/params';

const SCOPE = 'adminConversations';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_MODEL_LENGTH = 200;
const MAX_SEARCH_LENGTH = 200;
const MAX_REASON_LENGTH = 500;
const MAX_MESSAGE_ID_LENGTH = 128;
const MAX_CONVERSATION_ID_LENGTH = 256;
/** Upper bound on search hits turned into a conversation scope. */
const SEARCH_HIT_LIMIT = 200;
const SORT_VALUES: ReadonlyArray<TAdminConversationsSort> = ['updatedAt', 'createdAt'];

type ListOptions = NonNullable<Parameters<OversightMethods['listConversationsAdmin']>[0]>;

export interface AdminConversationsDeps extends OversightAuditDeps {
  listConversationsAdmin: OversightMethods['listConversationsAdmin'];
  getConversationAdmin: OversightMethods['getConversationAdmin'];
  findConversationOwner: OversightMethods['findConversationOwner'];
  searchMessagesAdmin: OversightMethods['searchMessagesAdmin'];
  searchMessageTextAdmin: OversightMethods['searchMessageTextAdmin'];
  createFlagAdmin: FlagMethods['createFlagAdmin'];
  deleteFlag: FlagMethods['deleteFlag'];
  recordAuditEntry: AuditLogMethods['recordAuditEntry'];
}

type Handler = (req: ServerRequest, res: Response) => Promise<Response>;

interface ConversationsQuery extends ListOptions {
  search?: string;
}

function parseConversationsQuery(query: Record<string, unknown>): ConversationsQuery {
  return {
    cursor: parseCursor(query.cursor),
    limit: parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT),
    userId: parseObjectId(query.userId, 'userId'),
    model: parseText(query.model, 'model', { max: MAX_MODEL_LENGTH }),
    ...parseDateRange(query),
    flagged: parseBoolean(query.flagged, 'flagged'),
    errors: parseBoolean(query.errors, 'errors'),
    search: parseText(query.search, 'search', { min: 2, max: MAX_SEARCH_LENGTH }),
    sort: parseEnum(query.sort, 'sort', SORT_VALUES),
  };
}

function parseConversationId(params: unknown): string {
  const { conversationId } = params as { conversationId?: string };
  if (
    !conversationId ||
    typeof conversationId !== 'string' ||
    conversationId.length > MAX_CONVERSATION_ID_LENGTH
  ) {
    throw new QueryError('conversationId is invalid');
  }
  return conversationId;
}

function parseFlagBody(body: unknown): { reason: string; messageId?: string } {
  const { reason, messageId } = (body ?? {}) as Partial<TAdminFlagRequest>;
  const parsedReason = parseText(reason, 'reason', { max: MAX_REASON_LENGTH });
  if (!parsedReason) {
    throw new QueryError('reason is required');
  }
  return {
    reason: parsedReason,
    messageId: parseText(messageId, 'messageId', { max: MAX_MESSAGE_ID_LENGTH }),
  };
}

function badRequest(res: Response, error: unknown): Response | null {
  if (error instanceof QueryError) {
    return res.status(400).json({ error: error.message });
  }
  return null;
}

/** Creates the `/api/admin/conversations` handlers. Every detail read and export is audited. */
export function createAdminConversationsHandlers(deps: AdminConversationsDeps): {
  listConversations: Handler;
  getConversation: Handler;
  exportConversation: Handler;
  flagConversation: Handler;
} {
  const {
    listConversationsAdmin,
    getConversationAdmin,
    findConversationOwner,
    searchMessagesAdmin,
    searchMessageTextAdmin,
    createFlagAdmin,
    deleteFlag,
  } = deps;
  const emitAudit = createOversightAudit(deps, SCOPE);

  async function resolveSearchScope(search: string): Promise<string[]> {
    const viaMeili = await searchMessagesAdmin(search, SEARCH_HIT_LIMIT);
    return viaMeili ?? searchMessageTextAdmin(search, SEARCH_HIT_LIMIT);
  }

  async function listConversationsHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { search, ...options } = parseConversationsQuery(req.query as Record<string, unknown>);
      const conversationIds = search ? await resolveSearchScope(search) : undefined;
      if (conversationIds && conversationIds.length === 0) {
        const empty: TAdminConversationsResponse = { conversations: [], nextCursor: null };
        return res.status(200).json(empty);
      }
      const page = await listConversationsAdmin({ ...options, conversationIds });
      const body: TAdminConversationsResponse = {
        conversations: page.items,
        nextCursor: page.nextCursor,
      };
      return res.status(200).json(body);
    } catch (error) {
      const handled = badRequest(res, error);
      if (handled) {
        return handled;
      }
      logger.error(`[${SCOPE}] listConversations error:`, error);
      return res.status(500).json({ error: 'Failed to list conversations' });
    }
  }

  async function getConversationHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const actor = resolveActor(req);
      if (!actor) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const conversationId = parseConversationId(req.params);
      const detail = await getConversationAdmin(conversationId);
      if (!detail) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      try {
        await emitAudit({
          action: 'conversation.viewed',
          actor,
          conversationId,
          title: detail.conversation.title,
          metadata: {
            ownerId: detail.conversation.user.id,
            messageCount: detail.messages.length,
          },
          req,
        });
      } catch (auditError) {
        logger.error(`[${SCOPE}] view audit failed (fail-closed); withholding content`, auditError);
        return res.status(500).json({ error: 'Failed to record audit entry' });
      }
      return res.status(200).json(detail);
    } catch (error) {
      const handled = badRequest(res, error);
      if (handled) {
        return handled;
      }
      logger.error(`[${SCOPE}] getConversation error:`, error);
      return res.status(500).json({ error: 'Failed to load conversation' });
    }
  }

  async function exportConversationHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const actor = resolveActor(req);
      if (!actor) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const conversationId = parseConversationId(req.params);
      const detail = await getConversationAdmin(conversationId);
      if (!detail) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      try {
        await emitAudit({
          action: 'conversation.exported',
          actor,
          conversationId,
          title: detail.conversation.title,
          metadata: {
            ownerId: detail.conversation.user.id,
            messageCount: detail.messages.length,
            format: 'jsonl',
          },
          req,
        });
      } catch (auditError) {
        logger.error(
          `[${SCOPE}] export audit failed (fail-closed); withholding content`,
          auditError,
        );
        return res.status(500).json({ error: 'Failed to record audit entry' });
      }
      return writeConversationJsonl(res, detail);
    } catch (error) {
      const handled = badRequest(res, error);
      if (handled) {
        return handled;
      }
      logger.error(`[${SCOPE}] exportConversation error:`, error);
      return res.status(500).json({ error: 'Failed to export conversation' });
    }
  }

  async function flagConversationHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const actor = resolveActor(req);
      if (!actor) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const conversationId = parseConversationId(req.params);
      const { reason, messageId } = parseFlagBody(req.body);
      const owner = await findConversationOwner(conversationId);
      if (!owner) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const flag = await createFlagAdmin({
        conversationId,
        messageId,
        user: owner.userId,
        reason,
        source: 'manual',
        createdBy: actor.userId,
        tenantId: actor.tenantId,
      });
      try {
        await emitAudit({
          action: 'conversation.flagged',
          actor,
          conversationId,
          title: owner.title,
          metadata: {
            flagId: flag.id,
            reason,
            messageId: messageId ?? null,
            ownerId: owner.userId,
          },
          req,
        });
      } catch (auditError) {
        /** Fail-closed: remove the flag so a 5xx never leaves an unaudited flag behind. */
        await deleteFlag(flag.id).catch((e) =>
          logger.error(`[${SCOPE}] compensating flag delete after audit failure failed`, e),
        );
        logger.error(`[${SCOPE}] flag audit failed (fail-closed) — rolled back flag`, auditError);
        return res.status(500).json({ error: 'Failed to record audit entry' });
      }
      return res.status(201).json(flag);
    } catch (error) {
      const handled = badRequest(res, error);
      if (handled) {
        return handled;
      }
      logger.error(`[${SCOPE}] flagConversation error:`, error);
      return res.status(500).json({ error: 'Failed to flag conversation' });
    }
  }

  return {
    listConversations: listConversationsHandler,
    getConversation: getConversationHandler,
    exportConversation: exportConversationHandler,
    flagConversation: flagConversationHandler,
  };
}
