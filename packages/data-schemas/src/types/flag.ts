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

export interface UnresolvedFlagRange {
  from?: Date;
  to?: Date;
}
