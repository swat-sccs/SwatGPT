import { Types } from 'mongoose';
import { MeiliSearch } from 'meilisearch';
import type {
  TAdminConversationDetail,
  TAdminConversationListItem,
  TAdminConversationMessage,
  TAdminConversationOwner,
  TAdminConversationsSort,
  TAdminFlag,
  TAdminGeneration,
  TFeedback,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { FilterQuery, Model, Types as MongooseTypes } from 'mongoose';
import type { IConversation, IFlag, IGeneration, IMessage, IUser } from '~/types';
import logger from '~/config/winston';

/**
 * Admin-scoped readers over conversations and messages that deliberately take
 * no `user` filter. The only callers are the `/api/admin/conversations`
 * handlers, which sit behind the `read:conversations` capability and write an
 * audit entry per read.
 */

export const DEFAULT_CONVERSATION_PAGE = 25;
export const MAX_CONVERSATION_PAGE = 100;
export const MAX_TEXT_SEARCH_MESSAGES = 200;

const MEILI_MESSAGES_INDEX = 'messages';

export interface ListConversationsAdminOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
  model?: string;
  /** Applied to the sort field: `updatedAt` (default) or `createdAt`. */
  from?: Date;
  to?: Date;
  /** `true` → only conversations with an open flag, `false` → only without one. */
  flagged?: boolean;
  /** `true` → only conversations with at least one errored message, `false` → none. */
  errors?: boolean;
  sort?: TAdminConversationsSort;
  /** Restricts the page to these ids (e.g. from a full-text search). */
  conversationIds?: string[];
}

export interface ConversationPage {
  items: TAdminConversationListItem[];
  nextCursor: string | null;
}

export interface ConversationOwnerRef {
  conversationId: string;
  title: string;
  userId: string;
}

export interface KeysetCursor {
  value: Date;
  id: MongooseTypes.ObjectId;
}

interface MessageStats {
  messageCount: number;
  errors: number;
  up: number;
  down: number;
}

interface TokenStats {
  promptTokens: number;
  completionTokens: number;
}

interface ConversationScope {
  include: Set<string> | null;
  exclude: string[];
}

const EMPTY_MESSAGE_STATS: MessageStats = { messageCount: 0, errors: 0, up: 0, down: 0 };
const EMPTY_TOKEN_STATS: TokenStats = { promptTokens: 0, completionTokens: 0 };
const UNKNOWN_OWNER: TAdminConversationOwner = { id: '', name: '', email: '' };

/** Opaque keyset cursor: base64url JSON of `[sortValueISO, _id]`. */
export function encodeKeysetCursor(value: Date, id: MongooseTypes.ObjectId | string): string {
  return Buffer.from(JSON.stringify([value.toISOString(), String(id)])).toString('base64url');
}

/** Returns `null` for anything that is not a well-formed cursor. */
export function decodeKeysetCursor(cursor: string): KeysetCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    return null;
  }
  const [rawValue, rawId] = parsed as [unknown, unknown];
  if (typeof rawValue !== 'string' || typeof rawId !== 'string') {
    return null;
  }
  const value = new Date(rawValue);
  if (Number.isNaN(value.getTime()) || !Types.ObjectId.isValid(rawId)) {
    return null;
  }
  return { value, id: new Types.ObjectId(rawId) };
}

/** Keyset predicate for a `{ [field]: -1, _id: -1 }` sort. */
export function keysetFilter<T>(field: string, cursor: KeysetCursor): FilterQuery<T> {
  return {
    $or: [{ [field]: { $lt: cursor.value } }, { [field]: cursor.value, _id: { $lt: cursor.id } }],
  } as FilterQuery<T>;
}

export function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

function toIso(value: Date | undefined): string {
  return value ? value.toISOString() : '';
}

function idString(value: MongooseTypes.ObjectId | string | undefined | null): string | null {
  return value == null ? null : String(value);
}

export function toAdminFlag(flag: IFlag): TAdminFlag {
  return {
    id: String(flag._id),
    conversationId: flag.conversationId,
    messageId: flag.messageId ?? null,
    userId: String(flag.user),
    reason: flag.reason,
    source: flag.source,
    createdBy: idString(flag.createdBy),
    createdAt: toIso(flag.createdAt),
    resolvedAt: flag.resolvedAt ? flag.resolvedAt.toISOString() : null,
    resolvedBy: idString(flag.resolvedBy),
  };
}

export function toAdminGeneration(generation: IGeneration): TAdminGeneration {
  return {
    messageId: generation.messageId,
    model: generation.model,
    promptTokens: generation.promptTokens,
    completionTokens: generation.completionTokens,
    ttftMs: generation.ttftMs ?? null,
    durationMs: generation.durationMs ?? null,
    finishReason: generation.finishReason ?? null,
    toolCalls: generation.toolCalls ?? [],
    ragChunks: generation.ragChunks ?? 0,
    ragMs: generation.ragMs ?? null,
    status: generation.status,
    errorType: generation.errorType ?? null,
    createdAt: toIso(generation.createdAt),
  };
}

function toAdminMessage(
  message: IMessage,
  generation: IGeneration | undefined,
): TAdminConversationMessage {
  const item: TAdminConversationMessage = {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId ?? null,
    sender: message.sender ?? '',
    isCreatedByUser: message.isCreatedByUser === true,
    text: message.text ?? '',
    model: message.model ?? null,
    tokenCount: message.tokenCount ?? null,
    error: message.error === true,
    createdAt: toIso(message.createdAt),
  };
  if (Array.isArray(message.content)) {
    item.content = message.content as TMessageContentParts[];
  }
  if (message.feedback) {
    item.feedback = message.feedback as TFeedback;
  }
  if (generation) {
    item.generation = toAdminGeneration(generation);
  }
  return item;
}

function toOwner(userId: string | undefined, user: IUser | undefined): TAdminConversationOwner {
  if (!user) {
    return userId ? { ...UNKNOWN_OWNER, id: userId } : UNKNOWN_OWNER;
  }
  return {
    id: String(user._id),
    name: user.name || user.username || '',
    email: user.email ?? '',
  };
}

function toListItem(
  convo: IConversation,
  owner: TAdminConversationOwner,
  stats: MessageStats,
  tokens: TokenStats,
  flagged: boolean,
): TAdminConversationListItem {
  return {
    conversationId: convo.conversationId,
    title: convo.title ?? '',
    user: owner,
    model: convo.model ?? '',
    messageCount: stats.messageCount,
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    errors: stats.errors,
    flagged,
    feedback: { up: stats.up, down: stats.down },
    createdAt: toIso(convo.createdAt),
    updatedAt: toIso(convo.updatedAt),
  };
}

function feedbackDelta(message: IMessage): { up: number; down: number } {
  const rating = message.feedback?.rating;
  return { up: rating === 'thumbsUp' ? 1 : 0, down: rating === 'thumbsDown' ? 1 : 0 };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueInOrder(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function intersect(current: Set<string> | null, ids: string[]): Set<string> {
  if (current == null) {
    return new Set(ids);
  }
  return new Set(ids.filter((id) => current.has(id)));
}

/** `keep === true` restricts the scope to `ids`; `keep === false` excludes them. */
function narrow(
  scope: ConversationScope,
  ids: string[] | null,
  keep: boolean | undefined,
): ConversationScope {
  if (!ids || keep == null) {
    return scope;
  }
  if (keep) {
    return { include: intersect(scope.include, ids), exclude: scope.exclude };
  }
  return { include: scope.include, exclude: scope.exclude.concat(ids) };
}

export interface OversightMethods {
  listConversationsAdmin: (options?: ListConversationsAdminOptions) => Promise<ConversationPage>;
  getConversationAdmin: (conversationId: string) => Promise<TAdminConversationDetail | null>;
  findConversationOwner: (conversationId: string) => Promise<ConversationOwnerRef | null>;
  /** Meilisearch over the `messages` index without the `user` filter; `null` when Meilisearch is unavailable. */
  searchMessagesAdmin: (query: string, limit: number) => Promise<string[] | null>;
  /** Mongo regex fallback over `messages.text`, capped at `MAX_TEXT_SEARCH_MESSAGES` messages. */
  searchMessageTextAdmin: (query: string, limit: number) => Promise<string[]>;
}

export function createOversightMethods(mongoose: typeof import('mongoose')): OversightMethods {
  let meiliClient: MeiliSearch | null = null;

  function Conversation(): Model<IConversation> {
    return mongoose.models.Conversation as Model<IConversation>;
  }
  function Message(): Model<IMessage> {
    return mongoose.models.Message as Model<IMessage>;
  }
  function User(): Model<IUser> {
    return mongoose.models.User as Model<IUser>;
  }
  function Flag(): Model<IFlag> {
    return mongoose.models.Flag as Model<IFlag>;
  }
  function Generation(): Model<IGeneration> | undefined {
    return mongoose.models.Generation as Model<IGeneration> | undefined;
  }

  async function loadUsers(userIds: Array<string | undefined>): Promise<Map<string, IUser>> {
    const ids = uniqueInOrder(userIds).filter((id) => Types.ObjectId.isValid(id));
    if (!ids.length) {
      return new Map();
    }
    const users = await User()
      .find({ _id: { $in: ids } }, '_id name username email')
      .lean<IUser[]>();
    return new Map(users.map((user) => [String(user._id), user]));
  }

  async function loadMessageStats(conversationIds: string[]): Promise<Map<string, MessageStats>> {
    const rows = await Message().aggregate<MessageStats & { _id: string }>([
      { $match: { conversationId: { $in: conversationIds } } },
      {
        $group: {
          _id: '$conversationId',
          messageCount: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ['$error', true] }, 1, 0] } },
          up: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsUp'] }, 1, 0] } },
          down: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsDown'] }, 1, 0] } },
        },
      },
    ]);
    return new Map(rows.map(({ _id, ...stats }) => [_id, stats]));
  }

  async function loadTokenStats(conversationIds: string[]): Promise<Map<string, TokenStats>> {
    const model = Generation();
    if (!model) {
      return new Map();
    }
    const rows = await model.aggregate<TokenStats & { _id: string }>([
      { $match: { conversationId: { $in: conversationIds } } },
      {
        $group: {
          _id: '$conversationId',
          promptTokens: { $sum: '$promptTokens' },
          completionTokens: { $sum: '$completionTokens' },
        },
      },
    ]);
    return new Map(rows.map(({ _id, ...tokens }) => [_id, tokens]));
  }

  async function loadOpenFlagIds(conversationIds?: string[]): Promise<string[]> {
    const filter: FilterQuery<IFlag> = { resolvedAt: null };
    if (conversationIds) {
      filter.conversationId = { $in: conversationIds };
    }
    return Flag().distinct('conversationId', filter);
  }

  async function loadErroredIds(): Promise<string[]> {
    return Message().distinct('conversationId', { error: true });
  }

  async function resolveScope(options: ListConversationsAdminOptions): Promise<ConversationScope> {
    const [flaggedIds, erroredIds] = await Promise.all([
      options.flagged == null ? null : loadOpenFlagIds(),
      options.errors == null ? null : loadErroredIds(),
    ]);
    const base: ConversationScope = {
      include: options.conversationIds ? new Set(options.conversationIds) : null,
      exclude: [],
    };
    return narrow(narrow(base, flaggedIds, options.flagged), erroredIds, options.errors);
  }

  function buildFilter(
    options: ListConversationsAdminOptions,
    sortField: TAdminConversationsSort,
    scope: ConversationScope,
    cursor: KeysetCursor | null,
  ): FilterQuery<IConversation> {
    const conditions: FilterQuery<IConversation>[] = [];
    if (options.userId) {
      conditions.push({ user: options.userId });
    }
    if (options.model) {
      conditions.push({ model: options.model });
    }
    if (options.from) {
      conditions.push({ [sortField]: { $gte: options.from } });
    }
    if (options.to) {
      conditions.push({ [sortField]: { $lte: options.to } });
    }
    if (scope.include) {
      conditions.push({ conversationId: { $in: Array.from(scope.include) } });
    }
    if (scope.exclude.length) {
      conditions.push({ conversationId: { $nin: scope.exclude } });
    }
    if (cursor) {
      conditions.push(keysetFilter<IConversation>(sortField, cursor));
    }
    return conditions.length ? { $and: conditions } : {};
  }

  async function buildListItems(convos: IConversation[]): Promise<TAdminConversationListItem[]> {
    if (!convos.length) {
      return [];
    }
    const conversationIds = convos.map((convo) => convo.conversationId);
    const [users, messageStats, tokenStats, openFlagIds] = await Promise.all([
      loadUsers(convos.map((convo) => convo.user)),
      loadMessageStats(conversationIds),
      loadTokenStats(conversationIds),
      loadOpenFlagIds(conversationIds),
    ]);
    const flagged = new Set(openFlagIds);
    return convos.map((convo) =>
      toListItem(
        convo,
        toOwner(convo.user, convo.user ? users.get(convo.user) : undefined),
        messageStats.get(convo.conversationId) ?? EMPTY_MESSAGE_STATS,
        tokenStats.get(convo.conversationId) ?? EMPTY_TOKEN_STATS,
        flagged.has(convo.conversationId),
      ),
    );
  }

  async function listConversationsAdmin(
    options: ListConversationsAdminOptions = {},
  ): Promise<ConversationPage> {
    const sortField: TAdminConversationsSort = options.sort ?? 'updatedAt';
    const limit = clampLimit(options.limit, DEFAULT_CONVERSATION_PAGE, MAX_CONVERSATION_PAGE);
    const cursor = options.cursor ? decodeKeysetCursor(options.cursor) : null;
    if (options.cursor && !cursor) {
      throw new Error('Invalid cursor');
    }
    const scope = await resolveScope(options);
    if (scope.include && scope.include.size === 0) {
      return { items: [], nextCursor: null };
    }
    const convos = await Conversation()
      .find(buildFilter(options, sortField, scope, cursor))
      .sort({ [sortField]: -1, _id: -1 })
      .limit(limit + 1)
      .lean<IConversation[]>();
    const hasMore = convos.length > limit;
    const page = hasMore ? convos.slice(0, limit) : convos;
    const last = page[page.length - 1];
    const lastSortValue = last?.[sortField];
    const nextCursor =
      hasMore && last && lastSortValue ? encodeKeysetCursor(lastSortValue, last._id) : null;
    return { items: await buildListItems(page), nextCursor };
  }

  async function getConversationAdmin(
    conversationId: string,
  ): Promise<TAdminConversationDetail | null> {
    const convo = await Conversation().findOne({ conversationId }).lean<IConversation | null>();
    if (!convo) {
      return null;
    }
    const generationModel = Generation();
    const [users, messages, generations, flagDocs] = await Promise.all([
      loadUsers([convo.user]),
      Message().find({ conversationId }).sort({ createdAt: 1, _id: 1 }).lean<IMessage[]>(),
      generationModel
        ? generationModel.find({ conversationId }).lean<IGeneration[]>()
        : Promise.resolve([] as IGeneration[]),
      Flag().find({ conversationId }).sort({ createdAt: 1, _id: 1 }).lean<IFlag[]>(),
    ]);

    const generationByMessage = new Map<string, IGeneration>();
    const tokens: TokenStats = { promptTokens: 0, completionTokens: 0 };
    for (const generation of generations) {
      generationByMessage.set(generation.messageId, generation);
      tokens.promptTokens += generation.promptTokens ?? 0;
      tokens.completionTokens += generation.completionTokens ?? 0;
    }

    const stats: MessageStats = { messageCount: messages.length, errors: 0, up: 0, down: 0 };
    const adminMessages = messages.map((message) => {
      const { up, down } = feedbackDelta(message);
      stats.up += up;
      stats.down += down;
      stats.errors += message.error === true ? 1 : 0;
      return toAdminMessage(message, generationByMessage.get(message.messageId));
    });

    const flags = flagDocs.map(toAdminFlag);
    const flagged = flags.some((flag) => flag.resolvedAt == null);
    const owner = toOwner(convo.user, convo.user ? users.get(convo.user) : undefined);
    return {
      conversation: toListItem(convo, owner, stats, tokens, flagged),
      messages: adminMessages,
      flags,
    };
  }

  async function findConversationOwner(
    conversationId: string,
  ): Promise<ConversationOwnerRef | null> {
    const convo = await Conversation()
      .findOne({ conversationId }, 'conversationId title user')
      .lean<IConversation | null>();
    if (!convo?.user) {
      return null;
    }
    return { conversationId: convo.conversationId, title: convo.title ?? '', userId: convo.user };
  }

  function meiliIndex() {
    const host = process.env.MEILI_HOST;
    const apiKey = process.env.MEILI_MASTER_KEY;
    if (!host || !apiKey) {
      return null;
    }
    meiliClient ??= new MeiliSearch({ host, apiKey });
    return meiliClient.index<{ conversationId?: string }>(MEILI_MESSAGES_INDEX);
  }

  async function searchMessagesAdmin(query: string, limit: number): Promise<string[] | null> {
    const index = meiliIndex();
    if (!index) {
      return null;
    }
    try {
      const result = await index.search(query, { limit, attributesToRetrieve: ['conversationId'] });
      return uniqueInOrder(result.hits.map((hit) => hit.conversationId));
    } catch (error) {
      logger.error('[oversight] Meilisearch query failed; falling back to Mongo', error);
      return null;
    }
  }

  async function searchMessageTextAdmin(query: string, limit: number): Promise<string[]> {
    const capped = clampLimit(limit, MAX_TEXT_SEARCH_MESSAGES, MAX_TEXT_SEARCH_MESSAGES);
    const messages = await Message()
      .find({ text: { $regex: escapeRegex(query), $options: 'i' } }, 'conversationId')
      .sort({ createdAt: -1 })
      .limit(capped)
      .lean<Pick<IMessage, 'conversationId'>[]>();
    return uniqueInOrder(messages.map((message) => message.conversationId));
  }

  return {
    listConversationsAdmin,
    getConversationAdmin,
    findConversationOwner,
    searchMessagesAdmin,
    searchMessageTextAdmin,
  };
}
