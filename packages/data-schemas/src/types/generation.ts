import type { Document, Types } from 'mongoose';

export type GenerationStatus = 'ok' | 'error' | 'aborted';

/** One record per assistant response: token counts, timing, tools, retrieval and outcome. */
export interface IGeneration extends Document {
  user: Types.ObjectId;
  conversationId: string;
  messageId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ttftMs?: number;
  durationMs?: number;
  finishReason?: string;
  toolCalls: string[];
  ragChunks: number;
  ragMs?: number;
  status: GenerationStatus;
  errorType?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
