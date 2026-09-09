import type { TMessageContentParts } from './assistants';
import type { TFeedback } from '../feedback';

/* ── Shared ─────────────────────────────────────────────────────────── */

export type TAdminCapabilitiesResponse = { capabilities: string[] };

/** ISO-8601 bounds; both optional, defaults to the trailing 24 h. */
export type TAdminUsageRange = { from?: string; to?: string };

export type TAdminUsageBucket = 'hour' | 'day';

export type TAdminPercentiles = { p50: number | null; p95: number | null };

/* ── Usage ──────────────────────────────────────────────────────────── */

export type TAdminUsageSummary = {
  from: string;
  to: string;
  requests: number;
  errors: number;
  aborted: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  conversations: number;
  ttftMs: TAdminPercentiles;
  durationMs: TAdminPercentiles;
  outputTokensPerSec: number | null;
  /** Share of generations that received at least one KB chunk. */
  ragHitRate: number | null;
  /** Share of generations that invoked at least one tool. */
  toolCallRate: number | null;
  flagged: number;
};

export type TAdminUsagePoint = {
  t: string;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  ttftP50Ms: number | null;
  durationP95Ms: number | null;
};

export type TAdminUsageTimeseries = {
  bucket: TAdminUsageBucket;
  from: string;
  to: string;
  points: TAdminUsagePoint[];
};

export type TAdminUsageTimeseriesQuery = TAdminUsageRange & { bucket?: TAdminUsageBucket };

export type TAdminUsageUserSort = 'tokens' | 'requests' | 'lastActive' | 'errors';

export type TAdminUsageUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  conversations: number;
  flagged: number;
  lastActiveAt: string | null;
  banned: boolean;
};

export type TAdminUsageUsersQuery = TAdminUsageRange & {
  sort?: TAdminUsageUserSort;
  limit?: number;
  offset?: number;
  search?: string;
};

export type TAdminUsageUsersResponse = {
  users: TAdminUsageUser[];
  total: number;
  limit: number;
  offset: number;
};

export type TAdminUsageUserDetail = {
  user: TAdminUsageUser;
  summary: TAdminUsageSummary;
  timeseries: TAdminUsageTimeseries;
  recentConversations: TAdminConversationListItem[];
};

export type TAdminUsageModel = {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  ttftMs: TAdminPercentiles;
  durationMs: TAdminPercentiles;
};

export type TAdminUsageModelsResponse = { models: TAdminUsageModel[] };

/* ── Generations (one record per assistant response) ────────────────── */

export type TAdminGenerationStatus = 'ok' | 'error' | 'aborted';

export type TAdminGeneration = {
  messageId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ttftMs: number | null;
  durationMs: number | null;
  finishReason: string | null;
  toolCalls: string[];
  ragChunks: number;
  ragMs: number | null;
  status: TAdminGenerationStatus;
  errorType: string | null;
  createdAt: string;
};

/* ── Conversations ──────────────────────────────────────────────────── */

export type TAdminConversationOwner = { id: string; name: string; email: string };

export type TAdminConversationListItem = {
  conversationId: string;
  title: string;
  user: TAdminConversationOwner;
  model: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  errors: number;
  flagged: boolean;
  feedback: { up: number; down: number };
  createdAt: string;
  updatedAt: string;
};

export type TAdminConversationsSort = 'updatedAt' | 'createdAt';

export type TAdminConversationsQuery = TAdminUsageRange & {
  cursor?: string;
  limit?: number;
  userId?: string;
  model?: string;
  flagged?: boolean;
  errors?: boolean;
  /** Full-text search over message bodies (Meilisearch), unscoped by user. */
  search?: string;
  sort?: TAdminConversationsSort;
};

export type TAdminConversationsResponse = {
  conversations: TAdminConversationListItem[];
  nextCursor: string | null;
};

export type TAdminConversationMessage = {
  messageId: string;
  parentMessageId: string | null;
  sender: string;
  isCreatedByUser: boolean;
  text: string;
  content?: TMessageContentParts[];
  model: string | null;
  tokenCount: number | null;
  feedback?: TFeedback;
  error: boolean;
  createdAt: string;
  generation?: TAdminGeneration;
};

export type TAdminFlagSource = 'keyword' | 'manual';

export type TAdminFlag = {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  reason: string;
  source: TAdminFlagSource;
  createdBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type TAdminConversationDetail = {
  conversation: TAdminConversationListItem;
  messages: TAdminConversationMessage[];
  flags: TAdminFlag[];
};

export type TAdminFlagRequest = { reason: string; messageId?: string };

export type TAdminFlagsQuery = { cursor?: string; limit?: number; resolved?: boolean };

export type TAdminFlagsResponse = { flags: TAdminFlag[]; nextCursor: string | null };

/* ── Controls ───────────────────────────────────────────────────────── */

export type TAdminBalance = {
  tokenCredits: number;
  autoRefillEnabled: boolean;
  refillAmount: number | null;
  refillIntervalValue: number | null;
  refillIntervalUnit: string | null;
};

export type TAdminUserControls = {
  userId: string;
  banned: boolean;
  banExpiresAt: string | null;
  balance: TAdminBalance | null;
};

export type TAdminBanRequest = { durationMs?: number; reason?: string };

export type TAdminBalanceRequest = { tokenCredits: number };

export type TAdminPauseState = {
  paused: boolean;
  message: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type TAdminPauseRequest = { paused: boolean; message?: string };
