import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IndexDescriptionInfo } from 'mongodb';
import type { CreateGenerationInput } from './generation';
import type { RetentionMethods } from './retention';
import { createRetentionMethods, DELETED_USER_ID } from './retention';
import { createGenerationMethods } from './generation';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const MONGO_LAUNCH_TIMEOUT_MS = 60_000;

let mongoServer: MongoMemoryServer;
let methods: RetentionMethods;
let models: ReturnType<typeof createModels>;

const alice = new Types.ObjectId();
const bob = new Types.ObjectId();
const admin = new Types.ObjectId();
const tombstone = new Types.ObjectId(DELETED_USER_ID);
const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO = new Date('2026-10-01T00:00:00.000Z');
const at = new Date('2026-09-15T12:00:00.000Z');

function ledgerRow(
  user: Types.ObjectId,
  conversationId: string,
  messageId: string,
  tokens: number,
): CreateGenerationInput {
  return {
    user,
    conversationId,
    messageId,
    model: 'qwen',
    promptTokens: tokens,
    completionTokens: tokens / 10,
    createdAt: at,
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: MONGO_LAUNCH_TIMEOUT_MS },
  });
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
  await Promise.all([models.Flag.init(), models.Generation.init()]);
  methods = createRetentionMethods(mongoose);
}, MONGO_LAUNCH_TIMEOUT_MS + 10_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([models.Flag.deleteMany({}), models.Generation.deleteMany({})]);
  await models.Flag.insertMany([
    { conversationId: 'a1', user: alice, reason: 'self-harm', source: 'keyword' },
    { conversationId: 'a2', user: alice, reason: 'review', source: 'manual', createdBy: admin },
    {
      conversationId: 'b1',
      user: bob,
      reason: 'abuse',
      source: 'manual',
      createdBy: alice,
      resolvedBy: alice,
      resolvedAt: at,
    },
    { conversationId: 'b2', user: bob, reason: 'spam', source: 'keyword' },
  ]);
  await models.Generation.insertMany([
    ledgerRow(alice, 'a1', 'm1', 100),
    ledgerRow(alice, 'a2', 'm2', 200),
    ledgerRow(bob, 'b1', 'm3', 50),
  ]);
});

describe('purgeUserOversight', () => {
  it('deletes every flag raised about the user and leaves other users untouched', async () => {
    const result = await methods.purgeUserOversight(alice.toString());

    expect(result.flagsDeleted).toBe(2);
    expect(await models.Flag.countDocuments({ user: alice })).toBe(0);
    const remaining = await models.Flag.find({}).sort({ conversationId: 1 }).lean();
    expect(remaining.map((flag) => flag.conversationId)).toEqual(['b1', 'b2']);
  });

  it('strips the user as filer or resolver from flags on others', async () => {
    await methods.purgeUserOversight(alice);

    const flag = await models.Flag.findOne({ conversationId: 'b1' }).lean();
    expect(flag?.createdBy).toBeUndefined();
    expect(flag?.resolvedBy).toBeUndefined();
    expect(flag?.resolvedAt).toEqual(at);
    expect(
      await models.Flag.countDocuments({ $or: [{ createdBy: alice }, { resolvedBy: alice }] }),
    ).toBe(0);
  });

  it('re-owns ledger rows so totals survive without the user link', async () => {
    const usage = createGenerationMethods(mongoose);
    const before = await usage.getUsageSummary({ from: FROM, to: TO });

    const result = await methods.purgeUserOversight(alice);

    expect(result.generationsAnonymized).toBe(2);
    expect(await models.Generation.countDocuments({ user: alice })).toBe(0);
    expect(await models.Generation.countDocuments({ user: tombstone })).toBe(2);
    const after = await usage.getUsageSummary({ from: FROM, to: TO });
    expect(after.requests).toBe(before.requests);
    expect(after.promptTokens).toBe(before.promptTokens);
    expect(after.completionTokens).toBe(before.completionTokens);
    expect(
      await usage.getUsageSummary({ from: FROM, to: TO, userId: alice.toString() }),
    ).toMatchObject({
      requests: 0,
    });
  });

  it('is a no-op for a user with no oversight rows', async () => {
    const result = await methods.purgeUserOversight(new Types.ObjectId());

    expect(result).toEqual({ flagsDeleted: 0, generationsAnonymized: 0 });
    expect(await models.Flag.countDocuments()).toBe(4);
    expect(await models.Generation.countDocuments({ user: alice })).toBe(2);
  });
});

describe('temporary-chat expiry', () => {
  const ttlIndex = (indexes: IndexDescriptionInfo[]) =>
    indexes.find((index) => index.key.expiredAt === 1);

  it('gives flags and generations a TTL index on expiredAt', async () => {
    const [flagIndexes, generationIndexes] = await Promise.all([
      models.Flag.collection.indexes(),
      models.Generation.collection.indexes(),
    ]);

    expect(ttlIndex(flagIndexes)?.expireAfterSeconds).toBe(0);
    expect(ttlIndex(generationIndexes)?.expireAfterSeconds).toBe(0);
  });

  it('persists expiredAt passed through createGeneration', async () => {
    const usage = createGenerationMethods(mongoose);
    const expiredAt = new Date('2026-11-01T00:00:00.000Z');

    const { generation } = await usage.createGeneration({
      user: bob,
      conversationId: 'tmp',
      messageId: 'm-tmp',
      model: 'qwen',
      promptTokens: 1,
      completionTokens: 1,
      expiredAt,
    });

    expect(generation.expiredAt).toEqual(expiredAt);
  });
});
