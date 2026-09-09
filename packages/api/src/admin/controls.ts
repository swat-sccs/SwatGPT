import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

/** Owned by the controls work (Layer E). Replace this stub with the real handlers and deps. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminControlsDeps {}

export function createAdminControlsHandlers(
  _deps: AdminControlsDeps,
): Record<string, (req: ServerRequest, res: Response) => Promise<Response>> {
  return {};
}
