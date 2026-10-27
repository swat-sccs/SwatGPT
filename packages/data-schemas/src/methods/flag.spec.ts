import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FlagMethods } from './flag';
import { createFlagMethods, DELETED_CONVERSATION_SUFFIX } from './flag';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: FlagMethods;
let models: ReturnType<typeof createModels>;

const alice = new Types.ObjectId();
const bob = new Types.ObjectId();
const admin = new Types.ObjectId();
const t = (offsetMin: number) => new Date(Date.UTC(2026, 8, 2, 9, offsetMin));

async function seed(): Promise<void> {
  await models.Flag.collection.insertMany([
    { conversationId: 'c1', user: alice, reason: 'r1', source: 'keyword', createdAt: t(1) },
    { conversationId: 'c1', user: alice, reason: 'r2', source: 'manual', createdAt: t(2) },
    {
      conversationId: 'c2',
      user: bob,
      reason: 'r3',
      source: 'keyword',
      createdAt: t(3),
      resolvedAt: t(4),
      resolvedBy: admin,
    },
    { conversationId: 'c3', user: bob, reason: 'r4', source: 'keyword', createdAt: t(5) },
  ]);
}

/** The shared CI box can be I/O-bound; give mongod longer than the 10 s default to open WiredTiger. */
const MONGO_LAUNCH_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: MONGO_LAUNCH_TIMEOUT_MS },
  });
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
  methods = createFlagMethods(mongoose);
}, MONGO_LAUNCH_TIMEOUT_MS + 10_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await models.Flag.collection.deleteMany({});
  await seed();
});

describe('createFlag / createFlagAdmin', () => {
  it('persists a flag and maps ids to strings for the admin shape', async () => {
    const doc = await methods.createFlag({
      conversationId: 'c9',
      messageId: 'm9',
      user: alice,
      reason: 'threat',
      source: 'manual',
      createdBy: admin,
    });
    expect(doc.conversationId).toBe('c9');
    expect(doc.createdAt).toBeInstanceOf(Date);

    const mapped = await methods.createFlagAdmin({
      conversationId: 'c9',
      user: String(alice),
      reason: 'again',
      source: 'keyword',
    });
    expect(mapped).toMatchObject({
      conversationId: 'c9',
      messageId: null,
      userId: String(alice),
      reason: 'again',
      source: 'keyword',
      createdBy: null,
      resolvedAt: null,
      resolvedBy: null,
    });
    expect(typeof mapped.id).toBe('string');
    expect(new Date(mapped.createdAt).getTime()).not.toBeNaN();
  });

  it('stores a temporary conversation expiry under the TTL index', async () => {
    const expiredAt = new Date(Date.UTC(2026, 10, 1));
    const doc = await methods.createFlag({
      conversationId: 'c-temp',
      user: alice,
      reason: 'threat',
      source: 'keyword',
      expiredAt,
    });
    const stored = await models.Flag.findById(doc._id).lean();
    expect(stored?.expiredAt?.toISOString()).toBe(expiredAt.toISOString());

    await models.Flag.syncIndexes();
    const indexes = await models.Flag.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { expiredAt: 1 }, expireAfterSeconds: 0 }),
      ]),
    );
  });
});

describe('createKeywordFlag', () => {
  it('keeps one open flag per conversation and reason across repeated matches', async () => {
    const expiredAt = new Date(Date.now() + 86_400_000);
    for (let turn = 0; turn < 10; turn++) {
      await methods.createFlag({
        conversationId: 'c9',
        messageId: `m${turn}`,
        user: alice,
        reason: 'self-harm',
        source: 'keyword',
        expiredAt: turn === 0 ? expiredAt : undefined,
      });
    }
    await methods.createFlag({
      conversationId: 'c9',
      user: alice,
      reason: 'violence',
      source: 'keyword',
    });

    const flags = await methods.getFlagsForConversation('c9');
    expect(flags.map((flag) => [flag.reason, flag.messageId])).toEqual([
      ['self-harm', 'm0'],
      ['violence', null],
    ]);
    const stored = await models.Flag.findOne({ conversationId: 'c9', reason: 'self-harm' }).lean();
    expect(stored?.expiredAt).toEqual(expiredAt);
    expect(stored?.createdAt).toBeInstanceOf(Date);
  });

  it('opens a new flag once the earlier one is resolved, and never folds manual flags', async () => {
    const first = await methods.createKeywordFlag({
      conversationId: 'c9',
      user: alice,
      reason: 'self-harm',
      source: 'keyword',
    });
    await methods.resolveFlag(String(first._id), admin);
    const second = await methods.createKeywordFlag({
      conversationId: 'c9',
      user: alice,
      reason: 'self-harm',
      source: 'keyword',
    });
    expect(String(second._id)).not.toBe(String(first._id));

    await methods.createFlag({ conversationId: 'c9', user: alice, reason: 'x', source: 'manual' });
    await methods.createFlag({ conversationId: 'c9', user: alice, reason: 'x', source: 'manual' });
    expect(await models.Flag.countDocuments({ conversationId: 'c9', source: 'manual' })).toBe(2);
  });
});

describe('listFlags', () => {
  it('lists newest first and filters by resolution state', async () => {
    const all = await methods.listFlags();
    expect(all.flags.map((f) => f.reason)).toEqual(['r4', 'r3', 'r2', 'r1']);
    expect(all.nextCursor).toBeNull();

    const open = await methods.listFlags({ resolved: false });
    expect(open.flags.map((f) => f.reason)).toEqual(['r4', 'r2', 'r1']);

    const resolved = await methods.listFlags({ resolved: true });
    expect(resolved.flags.map((f) => f.reason)).toEqual(['r3']);
    expect(resolved.flags[0].resolvedAt).toBe(t(4).toISOString());
    expect(resolved.flags[0].resolvedBy).toBe(String(admin));
  });

  it('pages with a keyset cursor', async () => {
    const first = await methods.listFlags({ limit: 3 });
    expect(first.flags.map((f) => f.reason)).toEqual(['r4', 'r3', 'r2']);
    expect(first.nextCursor).not.toBeNull();

    const second = await methods.listFlags({ limit: 3, cursor: first.nextCursor! });
    expect(second.flags.map((f) => f.reason)).toEqual(['r1']);
    expect(second.nextCursor).toBeNull();

    await expect(methods.listFlags({ cursor: 'bogus' })).rejects.toThrow('Invalid cursor');
  });
});

describe('resolveFlag', () => {
  it('resolves once and is a no-op afterwards', async () => {
    const open = await methods.listFlags({ resolved: false });
    const target = open.flags.find((f) => f.reason === 'r1')!;

    const resolved = await methods.resolveFlag(target.id, admin);
    expect(resolved?.resolvedBy).toBe(String(admin));
    expect(resolved?.resolvedAt).not.toBeNull();

    const again = await methods.resolveFlag(target.id, bob);
    expect(again?.resolvedAt).toBe(resolved?.resolvedAt);
    expect(again?.resolvedBy).toBe(String(admin));

    expect(await methods.resolveFlag(String(new Types.ObjectId()), admin)).toBeNull();
  });
});

describe('conversation lookups', () => {
  it('returns flags for a conversation in creation order', async () => {
    const flags = await methods.getFlagsForConversation('c1');
    expect(flags.map((f) => f.reason)).toEqual(['r1', 'r2']);
    expect(await methods.getFlagsForConversation('none')).toEqual([]);
  });

  it('returns only conversations with unresolved flags', async () => {
    const flagged = await methods.getFlaggedConversationIds(['c1', 'c2', 'c3', 'c4']);
    expect(Array.from(flagged).sort()).toEqual(['c1', 'c3']);
    expect((await methods.getFlaggedConversationIds([])).size).toBe(0);
  });

  it('counts unresolved flags per user, bounded by createdAt', async () => {
    const counts = await methods.countUnresolvedFlagsByUser();
    expect(counts.get(String(alice))).toBe(2);
    expect(counts.get(String(bob))).toBe(1);

    const bounded = await methods.countUnresolvedFlagsByUser({ from: t(2), to: t(4) });
    expect(bounded.get(String(alice))).toBe(1);
    expect(bounded.has(String(bob))).toBe(false);
  });

  it('closes every open flag of deleted conversations with a reason suffix', async () => {
    await expect(methods.resolveFlagsForConversations(['c1', 'c2', 'missing'])).resolves.toBe(2);

    const c1 = await methods.getFlagsForConversation('c1');
    expect(c1.map((flag) => flag.reason)).toEqual([
      `r1 (${DELETED_CONVERSATION_SUFFIX})`,
      `r2 (${DELETED_CONVERSATION_SUFFIX})`,
    ]);
    expect(c1.every((flag) => flag.resolvedAt != null && flag.resolvedBy == null)).toBe(true);
    const [c2] = await methods.getFlagsForConversation('c2');
    expect(c2.reason).toBe('r3');
    expect(c2.resolvedAt).toBe(t(4).toISOString());
    expect(await methods.getFlaggedConversationIds(['c1', 'c3'])).toEqual(new Set(['c3']));
    await expect(methods.resolveFlagsForConversations([])).resolves.toBe(0);
  });

  it('deletes a flag by id', async () => {
    const [target] = (await methods.listFlags({ limit: 1 })).flags;
    expect(await methods.deleteFlag(target.id)).toBe(true);
    expect(await methods.deleteFlag(target.id)).toBe(false);
  });
});
