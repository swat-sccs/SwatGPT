import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { flagSchema, convoSchema, messageSchema, createMethods } from '@librechat/data-schemas';
import type { IFlag, IMessage, IConversation } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import { createUsageFlagReaders, createUsageConversationReaders } from './usage';

const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO = new Date('2026-09-02T00:00:00.000Z');
const INSIDE = new Date('2026-09-01T12:00:00.000Z');
const BEFORE = new Date('2026-08-31T23:59:59.000Z');

const alice = new Types.ObjectId();
const bob = new Types.ObjectId();
const carol = new Types.ObjectId();

let mongoServer: MongoMemoryServer;
let Flag: Model<IFlag>;
let Message: Model<IMessage>;
let readers: ReturnType<typeof createUsageFlagReaders>;
let conversationReaders: ReturnType<typeof createUsageConversationReaders>;

function flag(user: Types.ObjectId, conversationId: string, createdAt: Date) {
  return { user, conversationId, createdAt, reason: 'test', source: 'keyword' as const };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Flag = mongoose.model<IFlag>('Flag', flagSchema);
  Message = mongoose.model<IMessage>('Message', messageSchema);
  readers = createUsageFlagReaders(Flag);
  conversationReaders = createUsageConversationReaders({
    Conversation: mongoose.model<IConversation>('Conversation', convoSchema),
    Message,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Flag.deleteMany({});
  await Flag.insertMany([
    flag(alice, 'c1', INSIDE),
    flag(alice, 'c2', INSIDE),
    flag(alice, 'c1', BEFORE),
    flag(bob, 'c3', INSIDE),
    flag(carol, 'c4', TO),
    { ...flag(bob, 'c3', INSIDE), resolvedAt: INSIDE },
  ]);
});

describe('createUsageFlagReaders', () => {
  describe('countFlags', () => {
    it('counts open flags created within [from, to)', async () => {
      await expect(readers.countFlags({ from: FROM, to: TO })).resolves.toBe(3);
    });

    it('ignores resolved flags, like the flagged state of conversation rows', async () => {
      await expect(
        readers.countFlags({ from: FROM, to: TO, userId: bob.toString() }),
      ).resolves.toBe(1);
      await Flag.updateMany({ user: bob }, { $set: { resolvedAt: INSIDE } });
      await expect(readers.countFlags({ from: FROM, to: TO })).resolves.toBe(2);
      const counts = await readers.countFlagsByUser({ from: FROM, to: TO }, [bob.toString()]);
      expect(counts.size).toBe(0);
    });

    it('scopes the count to a user when userId is given', async () => {
      await expect(
        readers.countFlags({ from: FROM, to: TO, userId: alice.toString() }),
      ).resolves.toBe(2);
    });
  });

  describe('countFlagsByUser', () => {
    it('matches ObjectId users from string ids and keys the result by string id', async () => {
      const counts = await readers.countFlagsByUser({ from: FROM, to: TO }, [
        alice.toString(),
        bob.toString(),
        carol.toString(),
      ]);
      expect(counts.get(alice.toString())).toBe(2);
      expect(counts.get(bob.toString())).toBe(1);
      expect(counts.has(carol.toString())).toBe(false);
      expect(counts.size).toBe(2);
    });

    it('ignores ids that are not valid ObjectId strings', async () => {
      const counts = await readers.countFlagsByUser({ from: FROM, to: TO }, [
        'not-an-object-id',
        bob.toString(),
      ]);
      expect(counts.get(bob.toString())).toBe(1);
      expect(counts.size).toBe(1);
    });

    it('returns an empty map without querying when no valid ids are given', async () => {
      const aggregate = jest.spyOn(Flag, 'aggregate');
      await expect(readers.countFlagsByUser({ from: FROM, to: TO }, [])).resolves.toEqual(
        new Map(),
      );
      await expect(readers.countFlagsByUser({ from: FROM, to: TO }, ['nope'])).resolves.toEqual(
        new Map(),
      );
      expect(aggregate).not.toHaveBeenCalled();
    });
  });

  it('no longer exposes a resolution-blind per-conversation counter', () => {
    expect(Object.keys(readers).sort()).toEqual(['countFlags', 'countFlagsByUser']);
  });
});

describe('recent conversations flagged state', () => {
  it('matches the oversight list: a resolved-only conversation is not flagged', async () => {
    await Flag.collection.insertOne({
      ...flag(bob, 'c5', INSIDE),
      resolvedAt: new Date(),
    });
    const { getFlaggedConversationIds } = createMethods(mongoose);
    const flagged = await getFlaggedConversationIds(['c1', 'c3', 'c5']);
    expect(Array.from(flagged).sort()).toEqual(['c1', 'c3']);
  });
});

describe('createUsageConversationReaders', () => {
  it('counts errored messages per conversation like the oversight list', async () => {
    await Message.collection.insertMany([
      { messageId: 'm1', conversationId: 'c1', user: String(alice), error: false },
      { messageId: 'm2', conversationId: 'c1', user: String(alice), error: true },
      { messageId: 'm3', conversationId: 'c1', user: String(alice), error: true },
      {
        messageId: 'm4',
        conversationId: 'c2',
        user: String(alice),
        feedback: { rating: 'thumbsUp' },
      },
    ]);
    const stats = await conversationReaders.getConversationStats(['c1', 'c2']);
    expect(stats.get('c1')).toEqual({ messageCount: 3, errors: 2, up: 0, down: 0 });
    expect(stats.get('c2')).toEqual({ messageCount: 1, errors: 0, up: 1, down: 0 });
  });
});
