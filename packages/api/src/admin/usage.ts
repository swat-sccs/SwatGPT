import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  IUser,
  IFlag,
  IMessage,
  UsageRange,
  UsageBucket,
  UsageSummary,
  UsageUserRow,
  IConversation,
  UsageUserSort,
  GenerationMethods,
  UsageTimeseriesPoint,
} from '@librechat/data-schemas';
import type {
  TAdminUsageUser,
  TAdminUsagePoint,
  TAdminUsageSummary,
  TAdminUsageUserDetail,
  TAdminUsageTimeseries,
  TAdminUsageUsersResponse,
  TAdminUsageModelsResponse,
  TAdminConversationListItem,
} from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_RANGE_MS = DAY_MS;
const MAX_HOUR_BUCKET_RANGE_MS = 90 * DAY_MS;
const MAX_SEARCH_LENGTH = 200;
const RECENT_CONVERSATIONS_LIMIT = 20;
const BUCKETS = new Set<UsageBucket>(['hour', 'day']);
const USER_SORTS = new Set<UsageUserSort>(['tokens', 'requests', 'lastActive', 'errors']);
const BUCKET_MS: Record<UsageBucket, number> = { hour: HOUR_MS, day: DAY_MS };
export const USAGE_USER_FIELDS = '_id name username email role';
const CONVERSATION_FIELDS = 'conversationId title model createdAt updatedAt';

export interface ConversationStats {
  messageCount: number;
  up: number;
  down: number;
}

export interface AdminUsageDeps {
  getUsageSummary: GenerationMethods['getUsageSummary'];
  getUsageTimeseries: GenerationMethods['getUsageTimeseries'];
  getUsageByUser: GenerationMethods['getUsageByUser'];
  getUsageByModel: GenerationMethods['getUsageByModel'];
  getConversationUsage: GenerationMethods['getConversationUsage'];
  findUser: (userId: string) => Promise<IUser | null>;
  findRecentConversations: (userId: string, limit: number) => Promise<IConversation[]>;
  getConversationStats: (conversationIds: string[]) => Promise<Map<string, ConversationStats>>;
  countFlags: (range: UsageRange) => Promise<number>;
  countFlagsByUser: (range: UsageRange, userIds: string[]) => Promise<Map<string, number>>;
  countFlagsByConversation: (conversationIds: string[]) => Promise<Map<string, number>>;
  isUserBanned: (userId: string) => Promise<boolean>;
}

type Handler = (req: ServerRequest, res: Response) => Promise<Response>;

export interface AdminUsageHandlers {
  summary: Handler;
  timeseries: Handler;
  users: Handler;
  user: Handler;
  models: Handler;
}

type Query = ServerRequest['query'];

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

function queryString(query: Query, key: string): string | undefined {
  const raw = query[key];
  return typeof raw === 'string' ? raw : undefined;
}

function parseDate(raw: string | undefined, fallback: Date, key: string): Parsed<Date> {
  if (raw === undefined) {
    return { value: fallback };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { error: `Invalid "${key}": expected an ISO-8601 date` };
  }
  return { value: date };
}

function parseRange(query: Query): Parsed<{ from: Date; to: Date }> {
  const to = parseDate(queryString(query, 'to'), new Date(), 'to');
  if (to.error !== undefined) {
    return { error: to.error };
  }
  const from = parseDate(
    queryString(query, 'from'),
    new Date(to.value.getTime() - DEFAULT_RANGE_MS),
    'from',
  );
  if (from.error !== undefined) {
    return { error: from.error };
  }
  if (from.value >= to.value) {
    return { error: '"from" must be earlier than "to"' };
  }
  return { value: { from: from.value, to: to.value } };
}

function parseBucket(query: Query, range: { from: Date; to: Date }): Parsed<UsageBucket> {
  const raw = queryString(query, 'bucket') ?? 'hour';
  if (!BUCKETS.has(raw as UsageBucket)) {
    return { error: 'Invalid "bucket": expected "hour" or "day"' };
  }
  const bucket = raw as UsageBucket;
  if (bucket === 'hour' && range.to.getTime() - range.from.getTime() > MAX_HOUR_BUCKET_RANGE_MS) {
    return { error: 'Hour buckets are limited to a 90 day range; use bucket=day' };
  }
  return { value: bucket };
}

function parseSort(query: Query): Parsed<UsageUserSort> {
  const raw = queryString(query, 'sort') ?? 'tokens';
  if (!USER_SORTS.has(raw as UsageUserSort)) {
    return { error: 'Invalid "sort": expected tokens, requests, lastActive, or errors' };
  }
  return { value: raw as UsageUserSort };
}

function parseSearch(query: Query): Parsed<string | undefined> {
  const trimmed = queryString(query, 'search')?.trim();
  if (!trimmed) {
    return { value: undefined };
  }
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    return { error: `"search" must not exceed ${MAX_SEARCH_LENGTH} characters` };
  }
  return { value: trimmed };
}

function toSummary(
  range: { from: Date; to: Date },
  summary: UsageSummary,
  flagged: number,
): TAdminUsageSummary {
  const { lastActiveAt: _lastActiveAt, ...rest } = summary;
  return { from: range.from.toISOString(), to: range.to.toISOString(), ...rest, flagged };
}

function emptyPoint(t: number): TAdminUsagePoint {
  return {
    t: new Date(t).toISOString(),
    requests: 0,
    errors: 0,
    promptTokens: 0,
    completionTokens: 0,
    uniqueUsers: 0,
    ttftP50Ms: null,
    durationP95Ms: null,
  };
}

/** Emits one point per bucket across the range, zero-filled where nothing was recorded. */
function fillBuckets(
  points: UsageTimeseriesPoint[],
  range: { from: Date; to: Date },
  bucket: UsageBucket,
): TAdminUsagePoint[] {
  const step = BUCKET_MS[bucket];
  const byTime = new Map(points.map((point) => [point.t.getTime(), point]));
  const filled: TAdminUsagePoint[] = [];
  const end = range.to.getTime();
  for (let t = Math.floor(range.from.getTime() / step) * step; t < end; t += step) {
    const point = byTime.get(t);
    filled.push(point ? { ...point, t: new Date(t).toISOString() } : emptyPoint(t));
  }
  return filled;
}

function toTimeseries(
  range: { from: Date; to: Date },
  bucket: UsageBucket,
  points: UsageTimeseriesPoint[],
): TAdminUsageTimeseries {
  return {
    bucket,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    points: fillBuckets(points, range, bucket),
  };
}

function toUsageUser(row: UsageUserRow, flagged: number, banned: boolean): TAdminUsageUser {
  const { userId, lastActiveAt, ...rest } = row;
  return {
    id: userId,
    ...rest,
    flagged,
    lastActiveAt: lastActiveAt?.toISOString() ?? null,
    banned,
  };
}

function userRow(user: IUser, summary: UsageSummary): UsageUserRow {
  return {
    userId: user._id?.toString() ?? '',
    name: user.name ?? '',
    username: user.username ?? '',
    email: user.email ?? '',
    role: user.role ?? 'USER',
    requests: summary.requests,
    errors: summary.errors,
    promptTokens: summary.promptTokens,
    completionTokens: summary.completionTokens,
    conversations: summary.conversations,
    lastActiveAt: summary.lastActiveAt,
  };
}

function toIso(date: Date | undefined): string {
  return date?.toISOString() ?? '';
}

function fail(res: Response, scope: string, error: unknown): Response {
  logger.error(`[adminUsage] ${scope} error:`, error);
  return res.status(500).json({ error: `Failed to load usage ${scope}` });
}

export function createAdminUsageHandlers(deps: AdminUsageDeps): AdminUsageHandlers {
  async function summary(req: ServerRequest, res: Response): Promise<Response> {
    const range = parseRange(req.query);
    if (range.error !== undefined) {
      return res.status(400).json({ error: range.error });
    }
    try {
      const [usage, flagged] = await Promise.all([
        deps.getUsageSummary(range.value),
        deps.countFlags(range.value),
      ]);
      return res.status(200).json(toSummary(range.value, usage, flagged));
    } catch (error) {
      return fail(res, 'summary', error);
    }
  }

  async function timeseries(req: ServerRequest, res: Response): Promise<Response> {
    const range = parseRange(req.query);
    if (range.error !== undefined) {
      return res.status(400).json({ error: range.error });
    }
    const bucket = parseBucket(req.query, range.value);
    if (bucket.error !== undefined) {
      return res.status(400).json({ error: bucket.error });
    }
    try {
      const points = await deps.getUsageTimeseries({ ...range.value, bucket: bucket.value });
      return res.status(200).json(toTimeseries(range.value, bucket.value, points));
    } catch (error) {
      return fail(res, 'timeseries', error);
    }
  }

  async function users(req: ServerRequest, res: Response): Promise<Response> {
    const range = parseRange(req.query);
    if (range.error !== undefined) {
      return res.status(400).json({ error: range.error });
    }
    const sort = parseSort(req.query);
    if (sort.error !== undefined) {
      return res.status(400).json({ error: sort.error });
    }
    const search = parseSearch(req.query);
    if (search.error !== undefined) {
      return res.status(400).json({ error: search.error });
    }
    const { limit, offset } = parsePagination(req.query);
    try {
      const result = await deps.getUsageByUser({
        ...range.value,
        sort: sort.value,
        limit,
        offset,
        search: search.value,
      });
      const userIds = result.users.map((row) => row.userId);
      const [flags, banned] = await Promise.all([
        deps.countFlagsByUser(range.value, userIds),
        Promise.all(userIds.map((id) => deps.isUserBanned(id))),
      ]);
      const response: TAdminUsageUsersResponse = {
        users: result.users.map((row, index) =>
          toUsageUser(row, flags.get(row.userId) ?? 0, banned[index]),
        ),
        total: result.total,
        limit,
        offset,
      };
      return res.status(200).json(response);
    } catch (error) {
      return fail(res, 'users', error);
    }
  }

  async function recentConversations(
    userId: string,
  ): Promise<Array<Omit<TAdminConversationListItem, 'user'>>> {
    const conversations = await deps.findRecentConversations(userId, RECENT_CONVERSATIONS_LIMIT);
    const ids = conversations.map((conversation) => conversation.conversationId);
    const [usage, stats, flags] = await Promise.all([
      deps.getConversationUsage(ids),
      deps.getConversationStats(ids),
      deps.countFlagsByConversation(ids),
    ]);
    return conversations.map((conversation) => {
      const id = conversation.conversationId;
      const tokens = usage.get(id);
      const stat = stats.get(id);
      return {
        conversationId: id,
        title: conversation.title ?? '',
        model: conversation.model ?? '',
        messageCount: stat?.messageCount ?? 0,
        promptTokens: tokens?.promptTokens ?? 0,
        completionTokens: tokens?.completionTokens ?? 0,
        errors: tokens?.errors ?? 0,
        flagged: (flags.get(id) ?? 0) > 0,
        feedback: { up: stat?.up ?? 0, down: stat?.down ?? 0 },
        createdAt: toIso(conversation.createdAt),
        updatedAt: toIso(conversation.updatedAt),
      };
    });
  }

  async function user(req: ServerRequest, res: Response): Promise<Response> {
    const { id } = req.params as { id: string };
    if (!isValidObjectIdString(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    const range = parseRange(req.query);
    if (range.error !== undefined) {
      return res.status(400).json({ error: range.error });
    }
    const bucket = parseBucket(req.query, range.value);
    if (bucket.error !== undefined) {
      return res.status(400).json({ error: bucket.error });
    }
    const scoped: UsageRange = { ...range.value, userId: id };
    try {
      const [found, usage, points, flagged, banned, conversations] = await Promise.all([
        deps.findUser(id),
        deps.getUsageSummary(scoped),
        deps.getUsageTimeseries({ ...scoped, bucket: bucket.value }),
        deps.countFlags(scoped),
        deps.isUserBanned(id),
        recentConversations(id),
      ]);
      if (!found) {
        return res.status(404).json({ error: 'User not found' });
      }
      const owner = { id, name: found.name ?? '', email: found.email ?? '' };
      const detail: TAdminUsageUserDetail = {
        user: toUsageUser(userRow(found, usage), flagged, banned),
        summary: toSummary(range.value, usage, flagged),
        timeseries: toTimeseries(range.value, bucket.value, points),
        recentConversations: conversations.map((conversation) => ({
          ...conversation,
          user: owner,
        })),
      };
      return res.status(200).json(detail);
    } catch (error) {
      return fail(res, 'user', error);
    }
  }

  async function models(req: ServerRequest, res: Response): Promise<Response> {
    const range = parseRange(req.query);
    if (range.error !== undefined) {
      return res.status(400).json({ error: range.error });
    }
    try {
      const rows = await deps.getUsageByModel(range.value);
      const response: TAdminUsageModelsResponse = { models: rows };
      return res.status(200).json(response);
    } catch (error) {
      return fail(res, 'models', error);
    }
  }

  return { summary, timeseries, users, user, models };
}

interface ConversationStatsRow {
  _id: string;
  messageCount: number;
  up: number;
  down: number;
}

interface CountRow {
  _id: string;
  count: number;
}

/** Model-backed readers for the user detail view, so the route stays a thin wrapper. */
export function createUsageConversationReaders(models: {
  Conversation: Model<IConversation>;
  Message: Model<IMessage>;
}): Pick<AdminUsageDeps, 'findRecentConversations' | 'getConversationStats'> {
  return {
    findRecentConversations: (userId, limit) =>
      models.Conversation.find({ user: userId }, CONVERSATION_FIELDS)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean<IConversation[]>(),
    getConversationStats: async (conversationIds) => {
      if (conversationIds.length === 0) {
        return new Map();
      }
      const rows = await models.Message.aggregate<ConversationStatsRow>([
        { $match: { conversationId: { $in: conversationIds } } },
        {
          $group: {
            _id: '$conversationId',
            messageCount: { $sum: 1 },
            up: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsUp'] }, 1, 0] } },
            down: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsDown'] }, 1, 0] } },
          },
        },
      ]);
      return new Map(rows.map(({ _id, ...stats }) => [_id, stats]));
    },
  };
}

/** Flag counters over the `flags` collection written by keyword screening and manual review. */
export function createUsageFlagReaders(
  Flag: Model<IFlag>,
): Pick<AdminUsageDeps, 'countFlags' | 'countFlagsByUser' | 'countFlagsByConversation'> {
  async function countGrouped(
    match: Record<string, unknown>,
    groupBy: string,
  ): Promise<Map<string, number>> {
    const rows = await Flag.aggregate<CountRow>([
      { $match: match },
      { $group: { _id: { $toString: `$${groupBy}` }, count: { $sum: 1 } } },
    ]);
    return new Map(rows.map(({ _id, count }) => [_id, count]));
  }

  return {
    countFlags: ({ from, to, userId }) =>
      Flag.countDocuments({
        createdAt: { $gte: from, $lt: to },
        ...(userId ? { user: userId } : {}),
      }),
    countFlagsByUser: ({ from, to }, userIds) =>
      userIds.length === 0
        ? Promise.resolve(new Map())
        : countGrouped({ createdAt: { $gte: from, $lt: to }, user: { $in: userIds } }, 'user'),
    countFlagsByConversation: (conversationIds) =>
      conversationIds.length === 0
        ? Promise.resolve(new Map())
        : countGrouped({ conversationId: { $in: conversationIds } }, 'conversationId'),
  };
}
