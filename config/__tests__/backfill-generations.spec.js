const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { backfillGenerations } = require('../backfill-generations');

let mongoServer;
let Transaction;
let Generation;

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();
const before = new Date('2026-09-01T00:00:00Z');
const DUPLICATE_KEY = 11000;
const at = (minute) => new Date(Date.UTC(2026, 7, 1, 12, minute));

const tx = (overrides) => ({
  user: userA,
  conversationId: 'convo-1',
  messageId: 'msg-1',
  model: 'qwen3',
  context: 'message',
  createdAt: at(0),
  ...overrides,
});

const seed = (docs) => Transaction.collection.insertMany(docs);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  ({ Transaction, Generation } = createModels(mongoose));
  await Generation.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Transaction.deleteMany({});
  await Generation.deleteMany({});
});

describe('backfillGenerations', () => {
  it('excludes title tokens and picks user and model deterministically', async () => {
    await seed([
      tx({
        tokenType: 'prompt',
        rawAmount: -50,
        context: 'title',
        model: 'title-model',
        user: userB,
        createdAt: at(5),
      }),
      tx({
        tokenType: 'completion',
        rawAmount: -8,
        context: 'title',
        model: 'title-model',
        user: userB,
        createdAt: at(5),
      }),
      tx({ tokenType: 'prompt', rawAmount: -6000, model: 'prompt-only', createdAt: at(1) }),
      tx({ tokenType: 'completion', rawAmount: -80, createdAt: at(1) }),
      tx({ tokenType: 'prompt', rawAmount: -6200, createdAt: at(2) }),
      tx({ tokenType: 'completion', rawAmount: -300, createdAt: at(2) }),
      tx({ tokenType: 'credits', rawAmount: -999, createdAt: at(3) }),
    ]);

    const totals = await backfillGenerations({ Transaction, Generation, before });

    expect(totals).toEqual({ inserted: 1, skipped: 0 });
    const row = await Generation.findOne({ messageId: 'msg-1' }).lean();
    expect(row).toMatchObject({
      conversationId: 'convo-1',
      model: 'qwen3',
      promptTokens: 12200,
      completionTokens: 380,
      status: 'ok',
    });
    expect(row.user.toString()).toBe(userA.toString());
    expect(row.createdAt).toEqual(at(1));
  });

  it('leaves existing rows untouched and is safe to re-run', async () => {
    await seed([
      tx({ tokenType: 'prompt', rawAmount: -100 }),
      tx({ tokenType: 'completion', rawAmount: -10 }),
      tx({ messageId: 'msg-2', tokenType: 'prompt', rawAmount: -200 }),
      tx({ messageId: 'msg-2', tokenType: 'completion', rawAmount: -20 }),
    ]);
    await Generation.create({
      user: userA,
      conversationId: 'convo-1',
      messageId: 'msg-1',
      model: 'live',
      promptTokens: 1,
      completionTokens: 1,
    });

    expect(await backfillGenerations({ Transaction, Generation, before })).toEqual({
      inserted: 1,
      skipped: 1,
    });
    expect(await backfillGenerations({ Transaction, Generation, before })).toEqual({
      inserted: 0,
      skipped: 2,
    });
    const live = await Generation.findOne({ messageId: 'msg-1' }).lean();
    expect(live).toMatchObject({ model: 'live', promptTokens: 1, completionTokens: 1 });
    expect(await Generation.countDocuments()).toBe(2);
  });

  it('leaves messages with recent transactions to the live ledger', async () => {
    await seed([
      tx({ tokenType: 'prompt', rawAmount: -100, createdAt: at(1) }),
      tx({ tokenType: 'completion', rawAmount: -10, createdAt: new Date('2026-09-02T00:00:00Z') }),
    ]);

    expect(await backfillGenerations({ Transaction, Generation, before })).toEqual({
      inserted: 0,
      skipped: 0,
    });
    expect(await Generation.countDocuments()).toBe(0);
  });

  it('survives two runs racing over the same messages', async () => {
    await seed(
      Array.from({ length: 40 }, (_, i) => [
        tx({ messageId: `msg-${i}`, tokenType: 'prompt', rawAmount: -100 }),
        tx({ messageId: `msg-${i}`, tokenType: 'completion', rawAmount: -10 }),
      ]).flat(),
    );

    const [first, second] = await Promise.all([
      backfillGenerations({ Transaction, Generation, before }),
      backfillGenerations({ Transaction, Generation, before }),
    ]);

    expect(first.inserted + second.inserted).toBe(40);
    expect(first.inserted + first.skipped).toBe(40);
    expect(await Generation.countDocuments()).toBe(40);
  });

  it('counts a duplicate-key failure as skipped instead of aborting', async () => {
    await seed([
      tx({ tokenType: 'prompt', rawAmount: -100 }),
      tx({ tokenType: 'completion', rawAmount: -10 }),
    ]);
    const doc = {
      user: userA,
      conversationId: 'convo-1',
      messageId: 'dup',
      model: 'm',
      promptTokens: 0,
      completionTokens: 0,
    };
    const duplicate = await Generation.insertMany([doc, doc], { ordered: false }).catch(
      (error) => error,
    );
    expect(duplicate.writeErrors?.[0]?.code ?? duplicate.code).toBe(11000);
    const bulkWrite = jest.spyOn(Generation, 'bulkWrite').mockRejectedValueOnce(duplicate);

    await expect(backfillGenerations({ Transaction, Generation, before })).resolves.toEqual({
      inserted: 0,
      skipped: 1,
    });
    expect(bulkWrite).toHaveBeenCalledTimes(1);

    const mixed = Object.assign(new Error('mixed'), {
      code: DUPLICATE_KEY,
      writeErrors: [{ code: DUPLICATE_KEY }, { code: 121 }],
    });
    bulkWrite.mockRejectedValueOnce(mixed);
    await expect(backfillGenerations({ Transaction, Generation, before })).rejects.toBe(mixed);

    bulkWrite.mockRejectedValueOnce(new Error('connection lost'));
    await expect(backfillGenerations({ Transaction, Generation, before })).rejects.toThrow(
      'connection lost',
    );
  });
});
