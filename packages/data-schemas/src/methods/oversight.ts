/**
 * Owned by the oversight work (Layer C): admin-scoped readers over
 * conversations and messages that deliberately take no `user` filter. The only
 * callers are the `/api/admin/conversations` handlers, which sit behind the
 * `read:conversations` capability and write an audit entry per read.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OversightMethods {}

export function createOversightMethods(_mongoose: typeof import('mongoose')): OversightMethods {
  return {};
}
