import type { TAdminFlag } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type { IFlag, FlagSource, FlagPage, ListFlagsOptions, UnresolvedFlagRange } from '~/types';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  keysetFilter,
  clampLimit,
  toAdminFlag,
} from './oversight';

export const DEFAULT_FLAG_PAGE = 25;
export const MAX_FLAG_PAGE = 100;

export interface CreateFlagInput {
  conversationId: string;
  messageId?: string;
  user: string | Types.ObjectId;
  reason: string;
  source: FlagSource;
  createdBy?: string | Types.ObjectId;
  tenantId?: string;
}

/**
 * `createFlag` is also called from the generation write path (Layer B) when
 * keyword screening matches, so its signature stays stable.
 */
export interface FlagMethods {
  createFlag: (input: CreateFlagInput) => Promise<IFlag>;
  createFlagAdmin: (input: CreateFlagInput) => Promise<TAdminFlag>;
  listFlags: (options?: ListFlagsOptions) => Promise<FlagPage>;
  /** Marks the flag resolved; a second call is a no-op that returns the current record. `null` when missing. */
  resolveFlag: (id: string, resolvedBy: string | Types.ObjectId) => Promise<TAdminFlag | null>;
  deleteFlag: (id: string) => Promise<boolean>;
  getFlagsForConversation: (conversationId: string) => Promise<TAdminFlag[]>;
  /** Subset of `conversationIds` that carry at least one unresolved flag. */
  getFlaggedConversationIds: (conversationIds: string[]) => Promise<Set<string>>;
  /** Open flags per owner (`userId` → count), optionally bounded by `createdAt`. */
  countUnresolvedFlagsByUser: (range?: UnresolvedFlagRange) => Promise<Map<string, number>>;
}

function resolvedFilter(resolved: boolean | undefined): FilterQuery<IFlag> {
  if (resolved == null) {
    return {};
  }
  return resolved ? { resolvedAt: { $ne: null } } : { resolvedAt: null };
}

function rangeFilter(range: UnresolvedFlagRange): FilterQuery<IFlag> {
  if (!range.from && !range.to) {
    return {};
  }
  return {
    createdAt: {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    },
  };
}

export function createFlagMethods(mongoose: typeof import('mongoose')): FlagMethods {
  function model(): Model<IFlag> {
    return mongoose.models.Flag as Model<IFlag>;
  }

  async function createFlag(input: CreateFlagInput): Promise<IFlag> {
    return model().create(input);
  }

  async function createFlagAdmin(input: CreateFlagInput): Promise<TAdminFlag> {
    return toAdminFlag(await createFlag(input));
  }

  async function listFlags(options: ListFlagsOptions = {}): Promise<FlagPage> {
    const limit = clampLimit(options.limit, DEFAULT_FLAG_PAGE, MAX_FLAG_PAGE);
    const cursor = options.cursor ? decodeKeysetCursor(options.cursor) : null;
    if (options.cursor && !cursor) {
      throw new Error('Invalid cursor');
    }
    const conditions: FilterQuery<IFlag>[] = [resolvedFilter(options.resolved)];
    if (cursor) {
      conditions.push(keysetFilter<IFlag>('createdAt', cursor));
    }
    const docs = await model()
      .find({ $and: conditions })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<IFlag[]>();
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last?.createdAt
        ? encodeKeysetCursor(last.createdAt, last._id as Types.ObjectId)
        : null;
    return { flags: page.map(toAdminFlag), nextCursor };
  }

  async function resolveFlag(
    id: string,
    resolvedBy: string | Types.ObjectId,
  ): Promise<TAdminFlag | null> {
    const updated = await model()
      .findOneAndUpdate(
        { _id: id, resolvedAt: null },
        { $set: { resolvedAt: new Date(), resolvedBy } },
        { new: true },
      )
      .lean<IFlag | null>();
    const doc = updated ?? (await model().findById(id).lean<IFlag | null>());
    return doc ? toAdminFlag(doc) : null;
  }

  async function deleteFlag(id: string): Promise<boolean> {
    const result = await model().deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  async function getFlagsForConversation(conversationId: string): Promise<TAdminFlag[]> {
    const docs = await model()
      .find({ conversationId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<IFlag[]>();
    return docs.map(toAdminFlag);
  }

  async function getFlaggedConversationIds(conversationIds: string[]): Promise<Set<string>> {
    if (!conversationIds.length) {
      return new Set();
    }
    const ids = await model().distinct('conversationId', {
      conversationId: { $in: conversationIds },
      resolvedAt: null,
    });
    return new Set(ids);
  }

  async function countUnresolvedFlagsByUser(
    range: UnresolvedFlagRange = {},
  ): Promise<Map<string, number>> {
    const rows = await model().aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { resolvedAt: null, ...rangeFilter(range) } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  return {
    createFlag,
    createFlagAdmin,
    listFlags,
    resolveFlag,
    deleteFlag,
    getFlagsForConversation,
    getFlaggedConversationIds,
    countUnresolvedFlagsByUser,
  };
}
