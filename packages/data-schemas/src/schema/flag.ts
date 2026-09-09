import { Schema } from 'mongoose';
import type { IFlag } from '~/types';

const flagSchema: Schema<IFlag> = new Schema(
  {
    conversationId: { type: String, required: true, index: true },
    messageId: { type: String },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true },
    source: { type: String, enum: ['keyword', 'manual'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

flagSchema.index({ resolvedAt: 1, createdAt: -1 });

export default flagSchema;
