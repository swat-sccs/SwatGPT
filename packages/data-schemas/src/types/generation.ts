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

export type UsageBucket = 'hour' | 'day';

export type UsageUserSort = 'tokens' | 'requests' | 'lastActive' | 'errors';

export interface UsageRange {
  from: Date;
  to: Date;
  /** Restricts every figure to a single user. */
  userId?: string;
}

export interface UsagePercentiles {
  p50: number | null;
  p95: number | null;
}

export interface UsageSummary {
  requests: number;
  errors: number;
  aborted: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  conversations: number;
  ttftMs: UsagePercentiles;
  durationMs: UsagePercentiles;
  /** Completion tokens over wall time, across generations with a measured duration. */
  outputTokensPerSec: number | null;
  ragHitRate: number | null;
  toolCallRate: number | null;
  lastActiveAt: Date | null;
}

export interface UsageTimeseriesPoint {
  t: Date;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  ttftP50Ms: number | null;
  durationP95Ms: number | null;
}

export interface UsageByUserParams {
  from: Date;
  to: Date;
  sort: UsageUserSort;
  limit: number;
  offset: number;
  search?: string;
}

export interface UsageUserRow {
  userId: string;
  name: string;
  username: string;
  email: string;
  role: string;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  conversations: number;
  lastActiveAt: Date | null;
}

export interface UsageByUserResult {
  users: UsageUserRow[];
  total: number;
}

export interface UsageModelRow {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  ttftMs: UsagePercentiles;
  durationMs: UsagePercentiles;
}

export interface ConversationUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  errors: number;
}
