const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');

jest.mock('../connect', () => jest.fn());

const { deleteUserData } = require('../delete-user');

const DELETED_USER_ID = '000000000000000000000000';

let mongoServer;
let models;

const ledgerRow = (user, messageId) => ({
  user,
  conversationId: 'convo-1',
  messageId,
  model: 'qwen3',
  promptTokens: 100,
  completionTokens: 20,
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
}, 70000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('deleteUserData', () => {
  it('deletes flags about the user and anonymizes their ledger rows', async () => {
    const { User, Flag, Generation, Conversation } = models;
    const [target, other, admin] = await User.create([
      { email: 'target@swarthmore.edu', provider: 'local' },
      { email: 'other@swarthmore.edu', provider: 'local' },
      { email: 'admin@swarthmore.edu', provider: 'local' },
    ]);
    await Conversation.create({
      conversationId: 'convo-1',
      user: target._id.toString(),
      endpoint: 'agents',
    });
    await Flag.create([
      { conversationId: 'convo-1', user: target._id, reason: 'r1', source: 'keyword' },
      {
        conversationId: 'convo-1',
        user: target._id,
        reason: 'r2',
        source: 'manual',
        createdBy: admin._id,
      },
      {
        conversationId: 'convo-2',
        user: other._id,
        reason: 'r3',
        source: 'manual',
        createdBy: target._id,
        resolvedBy: target._id,
        resolvedAt: new Date(),
      },
    ]);
    await Generation.create([
      ledgerRow(target._id, 'msg-1'),
      ledgerRow(target._id, 'msg-2'),
      ledgerRow(other._id, 'msg-3'),
    ]);

    await deleteUserData(target);

    expect(await User.countDocuments({ _id: target._id })).toBe(0);
    expect(await Conversation.countDocuments({ user: target._id.toString() })).toBe(0);
    expect(await Flag.countDocuments({ user: target._id })).toBe(0);

    const remaining = await Flag.findOne({ user: other._id }).lean();
    expect(remaining.createdBy).toBeUndefined();
    expect(remaining.resolvedBy).toBeUndefined();
    expect(remaining.resolvedAt).toBeInstanceOf(Date);

    expect(await Generation.countDocuments({ user: target._id })).toBe(0);
    const anonymized = await Generation.find({ user: DELETED_USER_ID }).lean();
    expect(anonymized.map((row) => row.messageId).sort()).toEqual(['msg-1', 'msg-2']);
    expect(anonymized.every((row) => row.promptTokens === 100)).toBe(true);
    expect(await Generation.countDocuments({ user: other._id })).toBe(1);
  });
});
