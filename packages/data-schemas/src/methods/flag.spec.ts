import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FlagMethods } from './flag';
import { createFlagMethods } from './flag';
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

  it('deletes a flag by id', async () => {
    const [target] = (await methods.listFlags({ limit: 1 })).flags;
    expect(await methods.deleteFlag(target.id)).toBe(true);
    expect(await methods.deleteFlag(target.id)).toBe(false);
  });
});
