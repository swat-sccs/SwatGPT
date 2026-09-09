import { Schema } from 'mongoose';
import type { IGeneration } from '~/types';

const generationSchema: Schema<IGeneration> = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, unique: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, required: true, default: 0 },
    completionTokens: { type: Number, required: true, default: 0 },
    ttftMs: { type: Number },
    durationMs: { type: Number },
    finishReason: { type: String },
    toolCalls: { type: [String], default: [] },
    ragChunks: { type: Number, default: 0 },
    ragMs: { type: Number },
    status: { type: String, enum: ['ok', 'error', 'aborted'], required: true, default: 'ok' },
    errorType: { type: String },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

generationSchema.index({ createdAt: 1 });
generationSchema.index({ user: 1, createdAt: -1 });

export default generationSchema;
