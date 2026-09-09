import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IUser, IGeneration } from '~/types';
import type { CreateGenerationInput } from './generation';
import { createGenerationMethods } from './generation';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let methods: ReturnType<typeof createGenerationMethods>;
let User: mongoose.Model<IUser>;
let Generation: mongoose.Model<IGeneration>;

const alice = new mongoose.Types.ObjectId();
const bob = new mongoose.Types.ObjectId();
const carol = new mongoose.Types.ObjectId();

const DAY = new Date('2026-09-08T00:00:00.000Z');
const at = (hoursFromDay: number): Date => new Date(DAY.getTime() + hoursFromDay * 3_600_000);

const FROM = at(0);
const TO = at(24);

type Seed = Partial<CreateGenerationInput> & { createdAt: Date; user: mongoose.Types.ObjectId };

let seq = 0;
function generation(seed: Seed): CreateGenerationInput {
  seq += 1;
  return {
    conversationId: 'c1',
    messageId: `m${seq}`,
    model: 'qwen',
    promptTokens: 100,
    completionTokens: 10,
    ...seed,
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  User = models.User;
  Generation = models.Generation;
  await Generation.init();
  methods = createGenerationMethods(mongoose);

  await User.insertMany([
    { _id: alice, name: 'Alice Adams', username: 'alice', email: 'alice@swarthmore.edu' },
    { _id: bob, name: 'Bob Brown', username: 'bob', email: 'bob@swarthmore.edu', role: 'ADMIN' },
    { _id: carol, name: 'Carol', username: 'carol', email: 'carol@swarthmore.edu' },
  ]);

  await Generation.insertMany([
    generation({
      user: alice,
      createdAt: at(1),
      ttftMs: 100,
      durationMs: 1000,
      completionTokens: 20,
      ragChunks: 3,
      ragMs: 200,
      toolCalls: ['dash_menu'],
    }),
    generation({
      user: alice,
      createdAt: at(1.5),
      ttftMs: 300,
      durationMs: 3000,
      completionTokens: 30,
      conversationId: 'c2',
    }),
    generation({
      user: bob,
      createdAt: at(5),
      ttftMs: 500,
      durationMs: 5000,
      completionTokens: 50,
      model: 'other',
      conversationId: 'c3',
      status: 'error',
      errorType: 'TimeoutError',
    }),
    generation({
      user: bob,
      createdAt: at(5.2),
      completionTokens: 0,
      conversationId: 'c3',
      status: 'aborted',
    }),
    generation({ user: carol, createdAt: at(-1), conversationId: 'c4' }),
    generation({ user: carol, createdAt: at(24), conversationId: 'c4' }),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('createGeneration', () => {
  it('inserts a document with defaults and rejects a duplicate messageId', async () => {
    const input = generation({
      user: carol,
      createdAt: at(60),
      messageId: 'unique-1',
      conversationId: 'c-create',
    });
    const created = await methods.createGeneration(input);
    expect(created.status).toBe('ok');
    expect(created.toolCalls).toEqual([]);
    await expect(methods.createGeneration(input)).rejects.toMatchObject({ code: 11000 });
  });
});

describe('getUsageSummary', () => {
  it('aggregates the window and computes percentiles and rates', async () => {
    const summary = await methods.getUsageSummary({ from: FROM, to: TO });
    expect(summary).toMatchObject({
      requests: 4,
      errors: 1,
      aborted: 1,
      promptTokens: 400,
      completionTokens: 100,
      uniqueUsers: 2,
      conversations: 3,
      ragHitRate: 0.25,
      toolCallRate: 0.25,
    });
    expect(summary.ttftMs.p50).toBeGreaterThanOrEqual(100);
    expect(summary.ttftMs.p50).toBeLessThanOrEqual(300);
    expect(summary.ttftMs.p95).toBe(500);
    expect(summary.durationMs.p95).toBe(5000);
    expect(summary.outputTokensPerSec).toBeCloseTo((100 * 1000) / 9000, 5);
    expect(summary.lastActiveAt).toEqual(at(5.2));
  });

  it('scopes to a user', async () => {
    const summary = await methods.getUsageSummary({ from: FROM, to: TO, userId: alice.toString() });
    expect(summary).toMatchObject({ requests: 2, errors: 0, completionTokens: 50, uniqueUsers: 1 });
  });

  it('returns an empty summary with null percentiles when nothing matches', async () => {
    const summary = await methods.getUsageSummary({ from: at(100), to: at(101) });
    expect(summary).toMatchObject({
      requests: 0,
      ttftMs: { p50: null, p95: null },
      outputTokensPerSec: null,
      ragHitRate: null,
      lastActiveAt: null,
    });
  });
});

describe('getUsageTimeseries', () => {
  it('buckets by hour in ascending order', async () => {
    const points = await methods.getUsageTimeseries({ from: FROM, to: TO, bucket: 'hour' });
    expect(points.map((p) => p.t)).toEqual([at(1), at(5)]);
    expect(points[0]).toMatchObject({
      requests: 2,
      errors: 0,
      uniqueUsers: 1,
      completionTokens: 50,
    });
    expect(points[1]).toMatchObject({ requests: 2, errors: 1, uniqueUsers: 1 });
    expect(points[1].ttftP50Ms).toBe(500);
    expect(points[1].durationP95Ms).toBe(5000);
  });

  it('buckets by day', async () => {
    const points = await methods.getUsageTimeseries({ from: at(-24), to: at(48), bucket: 'day' });
    expect(points.map((p) => [p.t, p.requests])).toEqual([
      [at(-24), 1],
      [at(0), 4],
      [at(24), 1],
    ]);
  });
});

describe('getUsageByUser', () => {
  it('joins user fields and sorts by tokens', async () => {
    const result = await methods.getUsageByUser({
      from: FROM,
      to: TO,
      sort: 'tokens',
      limit: 10,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.users.map((u) => u.username)).toEqual(['alice', 'bob']);
    expect(result.users[0]).toMatchObject({
      userId: alice.toString(),
      name: 'Alice Adams',
      email: 'alice@swarthmore.edu',
      role: 'USER',
      requests: 2,
      errors: 0,
      promptTokens: 200,
      completionTokens: 50,
      conversations: 2,
      lastActiveAt: at(1.5),
    });
    expect(result.users[1]).toMatchObject({ role: 'ADMIN', errors: 1, conversations: 1 });
  });

  it('sorts by errors and paginates', async () => {
    const result = await methods.getUsageByUser({
      from: FROM,
      to: TO,
      sort: 'errors',
      limit: 1,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('bob');
  });

  it('searches name, email and username case-insensitively', async () => {
    const byEmail = await methods.getUsageByUser({
      from: FROM,
      to: TO,
      sort: 'requests',
      limit: 10,
      offset: 0,
      search: 'BOB@',
    });
    expect(byEmail.total).toBe(1);
    expect(byEmail.users[0].username).toBe('bob');
    const byName = await methods.getUsageByUser({
      from: FROM,
      to: TO,
      sort: 'lastActive',
      limit: 10,
      offset: 0,
      search: 'adams',
    });
    expect(byName.users.map((u) => u.username)).toEqual(['alice']);
  });
});

describe('getUsageByModel', () => {
  it('groups by model with percentiles', async () => {
    const models = await methods.getUsageByModel({ from: FROM, to: TO });
    expect(models.map((m) => [m.model, m.requests])).toEqual([
      ['qwen', 3],
      ['other', 1],
    ]);
    expect(models[1]).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      ttftMs: { p50: 500, p95: 500 },
      durationMs: { p50: 5000, p95: 5000 },
    });
  });
});

describe('getConversationUsage', () => {
  it('sums tokens and errors per conversation', async () => {
    const usage = await methods.getConversationUsage(['c1', 'c3', 'missing']);
    expect(usage.get('c1')).toEqual({
      requests: 1,
      promptTokens: 100,
      completionTokens: 20,
      errors: 0,
    });
    expect(usage.get('c3')).toEqual({
      requests: 2,
      promptTokens: 200,
      completionTokens: 50,
      errors: 1,
    });
    expect(usage.has('missing')).toBe(false);
    expect((await methods.getConversationUsage([])).size).toBe(0);
  });
});
