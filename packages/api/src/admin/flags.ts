import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

/** Owned by the oversight work (Layer C). Replace this stub with the real handlers and deps. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminFlagsDeps {}

export function createAdminFlagsHandlers(
  _deps: AdminFlagsDeps,
): Record<string, (req: ServerRequest, res: Response) => Promise<Response>> {
  return {};
}
