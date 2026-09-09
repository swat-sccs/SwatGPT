import { logger, SystemCapabilities } from '@librechat/data-schemas';
import type { SystemCapability } from '@librechat/data-schemas';
import type { TAdminCapabilitiesResponse } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type { Response } from 'express';
import type { ResolvedPrincipal } from '~/types/principal';
import type { ServerRequest } from '~/types/http';

export interface AdminCapabilitiesDeps {
  getUserPrincipals: (params: {
    userId: string | Types.ObjectId;
    role?: string | null;
    idOnTheSource?: string | null;
  }) => Promise<ResolvedPrincipal[]>;
  /** Resolves the held subset of `capabilities`, including implied and parent grants. */
  getHeldCapabilities: (params: {
    principals: ResolvedPrincipal[];
    capabilities: SystemCapability[];
    tenantId?: string;
  }) => Promise<Set<SystemCapability>>;
}

export interface AdminCapabilitiesHandlers {
  getCapabilities: (req: ServerRequest, res: Response) => Promise<Response>;
}

/** Lists the base system capabilities the caller holds; `[]` for users with none. */
export function createAdminCapabilitiesHandlers(
  deps: AdminCapabilitiesDeps,
): AdminCapabilitiesHandlers {
  async function getCapabilities(req: ServerRequest, res: Response): Promise<Response> {
    const user = req.user;
    const userId = user?.id ?? user?._id?.toString();
    if (!user || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const principals = await deps.getUserPrincipals({
        userId,
        role: user.role,
        idOnTheSource: user.idOnTheSource ?? null,
      });
      const held = await deps.getHeldCapabilities({
        principals,
        capabilities: Object.values(SystemCapabilities),
        tenantId: user.tenantId,
      });
      const response: TAdminCapabilitiesResponse = { capabilities: [...held].sort() };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[adminCapabilities] getCapabilities error:', error);
      return res.status(500).json({ error: 'Failed to load capabilities' });
    }
  }

  return { getCapabilities };
}
