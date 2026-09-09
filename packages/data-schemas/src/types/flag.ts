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
