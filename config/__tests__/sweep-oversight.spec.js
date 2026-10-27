const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { sweepOversight, parseDays } = require('../sweep-oversight');

let mongoServer;
let Generation;
let Flag;

const user = new mongoose.Types.ObjectId();
const DAY_MS = 24 * 60 * 60 * 1000;
const createdAt = new Date('2026-09-01T00:00:00Z');
const temporaryExpiry = new Date('2026-09-03T00:00:00Z');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  ({ Generation, Flag } = createModels(mongoose));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Generation.deleteMany({});
  await Flag.deleteMany({});
  await Generation.collection.insertMany([
    { user, conversationId: 'c1', messageId: 'm1', model: 'qwen', createdAt },
    { user, conversationId: 'c2', messageId: 'm2', model: 'qwen', createdAt, expiredAt: null },
    {
      user,
      conversationId: 'c3',
      messageId: 'm3',
      model: 'qwen',
      createdAt,
      expiredAt: temporaryExpiry,
    },
  ]);
  await Flag.collection.insertMany([
    { user, conversationId: 'c1', reason: 'r', source: 'keyword', createdAt },
    {
      user,
      conversationId: 'c3',
      reason: 'r',
      source: 'keyword',
      createdAt,
      expiredAt: temporaryExpiry,
    },
  ]);
});

describe('sweepOversight', () => {
  it('stamps createdAt + days onto rows without an expiry and keeps existing ones', async () => {
    const totals = await sweepOversight({ Generation, Flag, days: 30 });
    expect(totals).toEqual({ generations: 2, flags: 1 });

    const expected = new Date(createdAt.getTime() + 30 * DAY_MS);
    const generations = await Generation.find({}).sort({ messageId: 1 }).lean();
    expect(generations.map((row) => row.expiredAt)).toEqual([expected, expected, temporaryExpiry]);
    const flags = await Flag.find({}).sort({ conversationId: 1 }).lean();
    expect(flags.map((row) => row.expiredAt)).toEqual([expected, temporaryExpiry]);

    await expect(sweepOversight({ Generation, Flag, days: 30 })).resolves.toEqual({
      generations: 0,
      flags: 0,
    });
  });

  it('only counts in a dry run', async () => {
    const totals = await sweepOversight({ Generation, Flag, days: 30, dryRun: true });
    expect(totals).toEqual({ generations: 2, flags: 1 });
    expect(await Generation.countDocuments({ expiredAt: null })).toBe(2);
  });
});

describe('parseDays', () => {
  it('prefers --days over the environment and rejects non-positive values', () => {
    expect(parseDays(['--days', '14'], '30')).toBe(14);
    expect(parseDays([], '30')).toBe(30);
    expect(parseDays([], undefined)).toBeNull();
    expect(parseDays(['--days', '0'], '30')).toBeNull();
    expect(parseDays(['--days', '1.5'], undefined)).toBeNull();
  });
});
