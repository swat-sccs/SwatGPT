import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

/** Owned by the usage-ledger work (Layer B). Replace this stub with the real handlers and deps. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminCapabilitiesDeps {}

export function createAdminCapabilitiesHandlers(
  _deps: AdminCapabilitiesDeps,
): Record<string, (req: ServerRequest, res: Response) => Promise<Response>> {
  return {};
}
