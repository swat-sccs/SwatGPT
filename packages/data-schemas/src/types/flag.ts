import type { TAdminFlag } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export type FlagSource = 'keyword' | 'manual';

/** A conversation (or message) marked for admin review. */
export interface IFlag extends Document {
  conversationId: string;
  messageId?: string;
  user: Types.ObjectId;
  reason: string;
  source: FlagSource;
  createdBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  tenantId?: string;
  /** Mirrors a temporary conversation's `expiredAt`; MongoDB's TTL monitor removes the row then. */
  expiredAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ListFlagsOptions {
  /** Keyset cursor from a previous page (`nextCursor`). */
  cursor?: string;
  limit?: number;
  /** `true` → resolved only, `false` → open only, omitted → all. */
  resolved?: boolean;
}

export interface FlagPage {
  flags: TAdminFlag[];
  nextCursor: string | null;
}

/** Half-open `[from, to)` window on `createdAt`. */
export interface UnresolvedFlagRange {
  from?: Date;
  to?: Date;
}
