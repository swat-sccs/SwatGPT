import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

/** Owned by the usage-ledger work (Layer B). Replace this stub with the real handlers and deps. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminUsageDeps {}

export function createAdminUsageHandlers(
  _deps: AdminUsageDeps,
): Record<string, (req: ServerRequest, res: Response) => Promise<Response>> {
  return {};
}
