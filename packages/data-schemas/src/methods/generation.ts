import { Types } from 'mongoose';
import type { Model, PipelineStage, FilterQuery, AccumulatorOperator } from 'mongoose';
import type {
  IGeneration,
  UsageRange,
  GenerationStatus,
  UsageBucket,
  UsageSummary,
  UsageModelRow,
  UsageUserRow,
  UsageUserSort,
  UsagePercentiles,
  UsageByUserParams,
  UsageByUserResult,
  ConversationUsage,
  UsageTimeseriesPoint,
} from '~/types';

/** Insert payload for one assistant response; mongoose casts `user` and applies schema defaults. */
export interface CreateGenerationInput {
  user: string | Types.ObjectId;
  conversationId: string;
  messageId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ttftMs?: number;
  durationMs?: number;
  finishReason?: string;
  toolCalls?: string[];
  ragChunks?: number;
  ragMs?: number;
  status?: GenerationStatus;
  errorType?: string;
  tenantId?: string;
  createdAt?: Date;
}

export interface GenerationMethods {
  createGeneration: (input: CreateGenerationInput) => Promise<IGeneration>;
  getUsageSummary: (range: UsageRange) => Promise<UsageSummary>;
  getUsageTimeseries: (
    params: UsageRange & { bucket: UsageBucket },
  ) => Promise<UsageTimeseriesPoint[]>;
  getUsageByUser: (params: UsageByUserParams) => Promise<UsageByUserResult>;
  getUsageByModel: (range: UsageRange) => Promise<UsageModelRow[]>;
  getConversationUsage: (conversationIds: string[]) => Promise<Map<string, ConversationUsage>>;
}

const MAX_SEARCH_LENGTH = 200;
const USERS_COLLECTION = 'users';

const EMPTY_PERCENTILES: UsagePercentiles = { p50: null, p95: null };

const EMPTY_SUMMARY: UsageSummary = {
  requests: 0,
  errors: 0,
  aborted: 0,
  promptTokens: 0,
  completionTokens: 0,
  uniqueUsers: 0,
  conversations: 0,
  ttftMs: EMPTY_PERCENTILES,
  durationMs: EMPTY_PERCENTILES,
  outputTokensPerSec: null,
  ragHitRate: null,
  toolCallRate: null,
  lastActiveAt: null,
};

const USER_SORTS: Record<UsageUserSort, Record<string, 1 | -1>> = {
  tokens: { totalTokens: -1, userId: 1 },
  requests: { requests: -1, userId: 1 },
  lastActive: { lastActiveAt: -1, userId: 1 },
  errors: { errors: -1, userId: 1 },
};

type PercentileArray = Array<number | null> | null | undefined;

interface SummaryRow {
  requests: number;
  errors: number;
  aborted: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  conversations: number;
  ttft: PercentileArray;
  duration: PercentileArray;
  timedCompletionTokens: number;
  timedDurationMs: number;
  ragHits: number;
  toolHits: number;
  lastActiveAt: Date | null;
}

interface TimeseriesRow {
  _id: Date;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  uniqueUsers: number;
  ttft: PercentileArray;
  duration: PercentileArray;
}

interface UserFacetRow {
  total: Array<{ count: number }>;
  users: Array<UsageUserRow & { totalTokens: number }>;
}

interface ModelRow {
  _id: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  ttft: PercentileArray;
  duration: PercentileArray;
}

interface ConversationRow extends ConversationUsage {
  _id: string;
}

function countWhere(condition: Record<string, unknown>): AccumulatorOperator {
  return { $sum: { $cond: [condition, 1, 0] } };
}

interface PercentileAccumulator {
  $percentile: { input: string; p: number[]; method: 'approximate' };
}

/**
 * `$percentile` (MongoDB 7.0+) is missing from mongoose's `AccumulatorOperator`
 * union, so the literal is widened through the documented shape.
 */
function percentileOf(field: string, p: number[]): AccumulatorOperator {
  const accumulator: PercentileAccumulator = {
    $percentile: { input: `$${field}`, p, method: 'approximate' },
  };
  return accumulator as unknown as AccumulatorOperator;
}

function readPercentile(values: PercentileArray, index: number): number | null {
  const value = values?.[index];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function toPercentiles(values: PercentileArray): UsagePercentiles {
  return { p50: readPercentile(values, 0), p95: readPercentile(values, 1) };
}

function rate(hits: number, total: number): number | null {
  return total > 0 ? hits / total : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rangeFilter({ from, to, userId }: UsageRange): FilterQuery<IGeneration> {
  const filter: FilterQuery<IGeneration> = { createdAt: { $gte: from, $lt: to } };
  if (userId != null && Types.ObjectId.isValid(userId)) {
    filter.user = new Types.ObjectId(userId);
  }
  return filter;
}

const TOKEN_SUMS = {
  requests: { $sum: 1 },
  errors: countWhere({ $eq: ['$status', 'error'] }),
  promptTokens: { $sum: '$promptTokens' },
  completionTokens: { $sum: '$completionTokens' },
};

const BOTH_PERCENTILES = [0.5, 0.95];

export function createGenerationMethods(mongoose: typeof import('mongoose')): GenerationMethods {
  function model(): Model<IGeneration> {
    return mongoose.models.Generation as Model<IGeneration>;
  }

  async function createGeneration(input: CreateGenerationInput): Promise<IGeneration> {
    return model().create(input);
  }

  async function getUsageSummary(range: UsageRange): Promise<UsageSummary> {
    const pipeline: PipelineStage[] = [
      { $match: rangeFilter(range) },
      {
        $group: {
          _id: null,
          ...TOKEN_SUMS,
          aborted: countWhere({ $eq: ['$status', 'aborted'] }),
          users: { $addToSet: '$user' },
          conversationIds: { $addToSet: '$conversationId' },
          ttft: percentileOf('ttftMs', BOTH_PERCENTILES),
          duration: percentileOf('durationMs', BOTH_PERCENTILES),
          timedCompletionTokens: {
            $sum: { $cond: [{ $gt: ['$durationMs', 0] }, '$completionTokens', 0] },
          },
          timedDurationMs: { $sum: { $cond: [{ $gt: ['$durationMs', 0] }, '$durationMs', 0] } },
          ragHits: countWhere({ $gt: ['$ragChunks', 0] }),
          toolHits: countWhere({ $gt: [{ $size: { $ifNull: ['$toolCalls', []] } }, 0] }),
          lastActiveAt: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          requests: 1,
          errors: 1,
          aborted: 1,
          promptTokens: 1,
          completionTokens: 1,
          uniqueUsers: { $size: '$users' },
          conversations: { $size: '$conversationIds' },
          ttft: 1,
          duration: 1,
          timedCompletionTokens: 1,
          timedDurationMs: 1,
          ragHits: 1,
          toolHits: 1,
          lastActiveAt: 1,
        },
      },
    ];
    const [row] = await model().aggregate<SummaryRow>(pipeline);
    if (!row) {
      return EMPTY_SUMMARY;
    }
    return {
      requests: row.requests,
      errors: row.errors,
      aborted: row.aborted,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      uniqueUsers: row.uniqueUsers,
      conversations: row.conversations,
      ttftMs: toPercentiles(row.ttft),
      durationMs: toPercentiles(row.duration),
      outputTokensPerSec:
        row.timedDurationMs > 0 ? (row.timedCompletionTokens * 1000) / row.timedDurationMs : null,
      ragHitRate: rate(row.ragHits, row.requests),
      toolCallRate: rate(row.toolHits, row.requests),
      lastActiveAt: row.lastActiveAt ?? null,
    };
  }

  async function getUsageTimeseries(
    params: UsageRange & { bucket: UsageBucket },
  ): Promise<UsageTimeseriesPoint[]> {
    const pipeline: PipelineStage[] = [
      { $match: rangeFilter(params) },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: params.bucket } },
          ...TOKEN_SUMS,
          users: { $addToSet: '$user' },
          ttft: percentileOf('ttftMs', [0.5]),
          duration: percentileOf('durationMs', [0.95]),
        },
      },
      { $set: { uniqueUsers: { $size: '$users' } } },
      { $unset: 'users' },
      { $sort: { _id: 1 } },
    ];
    const rows = await model().aggregate<TimeseriesRow>(pipeline);
    return rows.map((row) => ({
      t: row._id,
      requests: row.requests,
      errors: row.errors,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      uniqueUsers: row.uniqueUsers,
      ttftP50Ms: readPercentile(row.ttft, 0),
      durationP95Ms: readPercentile(row.duration, 0),
    }));
  }

  async function getUsageByUser(params: UsageByUserParams): Promise<UsageByUserResult> {
    const search = params.search?.trim().slice(0, MAX_SEARCH_LENGTH);
    const searchStage: PipelineStage[] = search
      ? [
          {
            $match: {
              $or: ['name', 'email', 'username'].map((field) => ({
                [field]: { $regex: escapeRegex(search), $options: 'i' },
              })),
            },
          },
        ]
      : [];
    const pipeline: PipelineStage[] = [
      { $match: rangeFilter(params) },
      {
        $group: {
          _id: '$user',
          ...TOKEN_SUMS,
          conversationIds: { $addToSet: '$conversationId' },
          lastActiveAt: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc',
          pipeline: [{ $project: { name: 1, username: 1, email: 1, role: 1 } }],
        },
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          name: { $ifNull: ['$userDoc.name', ''] },
          username: { $ifNull: ['$userDoc.username', ''] },
          email: { $ifNull: ['$userDoc.email', ''] },
          role: { $ifNull: ['$userDoc.role', 'USER'] },
          requests: 1,
          errors: 1,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: { $add: ['$promptTokens', '$completionTokens'] },
          conversations: { $size: '$conversationIds' },
          lastActiveAt: 1,
        },
      },
      ...searchStage,
      {
        $facet: {
          total: [{ $count: 'count' }],
          users: [
            { $sort: USER_SORTS[params.sort] },
            { $skip: params.offset },
            { $limit: params.limit },
          ],
        },
      },
    ];
    const [facet] = await model().aggregate<UserFacetRow>(pipeline);
    return {
      total: facet?.total[0]?.count ?? 0,
      users: (facet?.users ?? []).map(({ totalTokens: _totalTokens, ...row }) => row),
    };
  }

  async function getUsageByModel(range: UsageRange): Promise<UsageModelRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: rangeFilter(range) },
      {
        $group: {
          _id: '$model',
          ...TOKEN_SUMS,
          ttft: percentileOf('ttftMs', BOTH_PERCENTILES),
          duration: percentileOf('durationMs', BOTH_PERCENTILES),
        },
      },
      { $sort: { requests: -1, _id: 1 } },
    ];
    const rows = await model().aggregate<ModelRow>(pipeline);
    return rows.map((row) => ({
      model: row._id,
      requests: row.requests,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      ttftMs: toPercentiles(row.ttft),
      durationMs: toPercentiles(row.duration),
    }));
  }

  async function getConversationUsage(
    conversationIds: string[],
  ): Promise<Map<string, ConversationUsage>> {
    if (conversationIds.length === 0) {
      return new Map();
    }
    const rows = await model().aggregate<ConversationRow>([
      { $match: { conversationId: { $in: conversationIds } } },
      { $group: { _id: '$conversationId', ...TOKEN_SUMS } },
    ]);
    return new Map(
      rows.map(({ _id, requests, promptTokens, completionTokens, errors }) => [
        _id,
        { requests, promptTokens, completionTokens, errors },
      ]),
    );
  }

  return {
    createGeneration,
    getUsageSummary,
    getUsageTimeseries,
    getUsageByUser,
    getUsageByModel,
    getConversationUsage,
  };
}
