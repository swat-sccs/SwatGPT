import { ContentTypes } from 'librechat-data-provider';
import type {
  TAdminFlag,
  TAdminPauseState,
  TAdminUsageUser,
  TAdminUsageModel,
  TAdminUsagePoint,
  TAdminUserControls,
  TAdminUsageSummary,
  TAdminUsageUserDetail,
  TAdminUsageTimeseries,
  TAdminConversationDetail,
  TAdminConversationListItem,
} from 'librechat-data-provider';

export const summary: TAdminUsageSummary = {
  from: '2026-09-08T00:00:00.000Z',
  to: '2026-09-09T00:00:00.000Z',
  requests: 1284,
  errors: 12,
  aborted: 3,
  promptTokens: 9_500_000,
  completionTokens: 120_000,
  uniqueUsers: 57,
  conversations: 300,
  ttftMs: { p50: 812, p95: 2400 },
  durationMs: { p50: 4000, p95: 12_300 },
  outputTokensPerSec: 41.2,
  ragHitRate: 0.83,
  toolCallRate: 0.12,
  flagged: 4,
};

export const points: TAdminUsagePoint[] = [
  {
    t: '2026-09-08T10:00:00.000Z',
    requests: 40,
    errors: 1,
    promptTokens: 300_000,
    completionTokens: 4000,
    uniqueUsers: 12,
    ttftP50Ms: 800,
    durationP95Ms: 9000,
  },
  {
    t: '2026-09-08T11:00:00.000Z',
    requests: 55,
    errors: 0,
    promptTokens: 410_000,
    completionTokens: 5200,
    uniqueUsers: 15,
    ttftP50Ms: 780,
    durationP95Ms: 8800,
  },
];

export const timeseries: TAdminUsageTimeseries = {
  bucket: 'hour',
  from: summary.from,
  to: summary.to,
  points,
};

export const models: TAdminUsageModel[] = [
  {
    model: 'qwen3.6-35b',
    requests: 1284,
    promptTokens: 9_500_000,
    completionTokens: 120_000,
    ttftMs: { p50: 812, p95: 2400 },
    durationMs: { p50: 4000, p95: 12_300 },
  },
];

export const user: TAdminUsageUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@swarthmore.edu',
  role: 'USER',
  requests: 42,
  errors: 2,
  promptTokens: 300_000,
  completionTokens: 5000,
  conversations: 9,
  flagged: 1,
  lastActiveAt: '2026-09-08T12:00:00.000Z',
  banned: false,
};

export const conversation: TAdminConversationListItem = {
  conversationId: 'convo-1',
  title: 'Dining hall hours',
  user: { id: user.id, name: user.name, email: user.email },
  model: 'qwen3.6-35b',
  messageCount: 4,
  promptTokens: 12_000,
  completionTokens: 600,
  errors: 0,
  flagged: true,
  feedback: { up: 1, down: 0 },
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:05:00.000Z',
};

export const userDetail: TAdminUsageUserDetail = {
  user,
  summary,
  timeseries,
  recentConversations: [conversation],
};

export const flag: TAdminFlag = {
  id: 'flag-1',
  conversationId: conversation.conversationId,
  messageId: null,
  userId: user.id,
  reason: 'Contains a phone number',
  source: 'keyword',
  createdBy: null,
  createdAt: '2026-09-08T10:06:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
};

export const conversationDetail: TAdminConversationDetail = {
  conversation,
  messages: [
    {
      messageId: 'm-1',
      parentMessageId: null,
      sender: 'User',
      isCreatedByUser: true,
      text: 'When does Sharples open?',
      model: null,
      tokenCount: 8,
      error: false,
      createdAt: '2026-09-08T10:00:00.000Z',
    },
    {
      messageId: 'm-2',
      parentMessageId: 'm-1',
      sender: 'SwatGPT',
      isCreatedByUser: false,
      text: '',
      content: [{ type: ContentTypes.TEXT, text: 'Sharples opens at 7:30 AM on weekdays.' }],
      model: 'qwen3.6-35b',
      tokenCount: 20,
      feedback: { rating: 'thumbsUp', tag: undefined },
      error: false,
      createdAt: '2026-09-08T10:00:05.000Z',
      generation: {
        messageId: 'm-2',
        model: 'qwen3.6-35b',
        promptTokens: 7000,
        completionTokens: 40,
        ttftMs: 640,
        durationMs: 2100,
        finishReason: 'stop',
        toolCalls: ['dash_hours'],
        ragChunks: 3,
        ragMs: 120,
        status: 'ok',
        errorType: null,
        createdAt: '2026-09-08T10:00:05.000Z',
      },
    },
  ],
  flags: [flag],
};

export const pause: TAdminPauseState = {
  paused: false,
  message: 'SwatGPT is taking a short break.',
  updatedAt: '2026-09-08T09:00:00.000Z',
  updatedBy: 'sccs-admin',
};

export const controls: TAdminUserControls = {
  userId: user.id,
  banned: false,
  banExpiresAt: null,
  balance: {
    tokenCredits: 50_000,
    autoRefillEnabled: true,
    refillAmount: 10_000,
    refillIntervalValue: 1,
    refillIntervalUnit: 'days',
  },
};
