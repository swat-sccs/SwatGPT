import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { TAdminFlagsResponse } from 'librechat-data-provider';
import type { AuditLogMethods, FlagMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { OversightAuditDeps } from '~/oversight/audit';
import type { ServerRequest } from '~/types/http';
import { QueryError, parseBoolean, parseCursor, parseLimit } from '~/oversight/params';
import { createOversightAudit, resolveActor } from '~/oversight/audit';

const SCOPE = 'adminFlags';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface AdminFlagsDeps extends OversightAuditDeps {
  listFlags: FlagMethods['listFlags'];
  resolveFlag: FlagMethods['resolveFlag'];
  recordAuditEntry: AuditLogMethods['recordAuditEntry'];
}

type Handler = (req: ServerRequest, res: Response) => Promise<Response>;

/** Creates the `/api/admin/flags` handlers; resolving a flag is audited. */
export function createAdminFlagsHandlers(deps: AdminFlagsDeps): {
  listFlags: Handler;
  resolveFlag: Handler;
} {
  const { listFlags, resolveFlag } = deps;
  const emitAudit = createOversightAudit(deps, SCOPE);

  async function listFlagsHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const query = req.query as Record<string, unknown>;
      const page = await listFlags({
        cursor: parseCursor(query.cursor),
        limit: parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT),
        resolved: parseBoolean(query.resolved, 'resolved'),
      });
      const body: TAdminFlagsResponse = { flags: page.flags, nextCursor: page.nextCursor };
      return res.status(200).json(body);
    } catch (error) {
      if (error instanceof QueryError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error(`[${SCOPE}] listFlags error:`, error);
      return res.status(500).json({ error: 'Failed to list flags' });
    }
  }

  async function resolveFlagHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const actor = resolveActor(req);
      if (!actor) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { id } = req.params as { id?: string };
      if (!id || !isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid flag ID format' });
      }
      const flag = await resolveFlag(id, actor.userId);
      if (!flag) {
        return res.status(404).json({ error: 'Flag not found' });
      }
      try {
        await emitAudit({
          action: 'conversation.flag_resolved',
          actor,
          conversationId: flag.conversationId,
          title: flag.conversationId,
          metadata: { flagId: flag.id, reason: flag.reason, ownerId: flag.userId },
          req,
        });
      } catch (auditError) {
        /** Fail-closed: the resolution is persisted and a retry re-audits, so no rollback. */
        logger.error(`[${SCOPE}] resolve audit failed (fail-closed)`, auditError);
        return res.status(500).json({ error: 'Failed to record audit entry' });
      }
      return res.status(200).json(flag);
    } catch (error) {
      logger.error(`[${SCOPE}] resolveFlag error:`, error);
      return res.status(500).json({ error: 'Failed to resolve flag' });
    }
  }

  return { listFlags: listFlagsHandler, resolveFlag: resolveFlagHandler };
}
