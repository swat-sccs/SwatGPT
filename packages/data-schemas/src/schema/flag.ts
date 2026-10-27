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
    expiredAt: { type: Date },
  },
  { timestamps: true },
);

flagSchema.index({ createdAt: -1, _id: -1 });
flagSchema.index({ resolvedAt: 1, createdAt: -1, _id: -1 });
flagSchema.index({ conversationId: 1, resolvedAt: 1 });
flagSchema.index({ user: 1, resolvedAt: 1, createdAt: -1 });
flagSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });

export default flagSchema;
