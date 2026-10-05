import mongoose, { Types } from 'mongoose';
import { flagSchema } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IFlag } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import { createUsageFlagReaders } from './usage';

const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO = new Date('2026-09-02T00:00:00.000Z');
const INSIDE = new Date('2026-09-01T12:00:00.000Z');
const BEFORE = new Date('2026-08-31T23:59:59.000Z');

const alice = new Types.ObjectId();
const bob = new Types.ObjectId();
const carol = new Types.ObjectId();

let mongoServer: MongoMemoryServer;
let Flag: Model<IFlag>;
let readers: ReturnType<typeof createUsageFlagReaders>;

function flag(user: Types.ObjectId, conversationId: string, createdAt: Date) {
  return { user, conversationId, createdAt, reason: 'test', source: 'keyword' as const };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Flag = mongoose.model<IFlag>('Flag', flagSchema);
  readers = createUsageFlagReaders(Flag);
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
  ]);
});

describe('createUsageFlagReaders', () => {
  describe('countFlags', () => {
    it('counts flags created within [from, to)', async () => {
      await expect(readers.countFlags({ from: FROM, to: TO })).resolves.toBe(3);
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

  describe('countFlagsByConversation', () => {
    it('counts every flag per conversation regardless of date', async () => {
      const counts = await readers.countFlagsByConversation(['c1', 'c2', 'c4', 'missing']);
      expect(counts.get('c1')).toBe(2);
      expect(counts.get('c2')).toBe(1);
      expect(counts.get('c4')).toBe(1);
      expect(counts.has('missing')).toBe(false);
      expect(counts.size).toBe(3);
    });

    it('returns an empty map for no conversation ids', async () => {
      await expect(readers.countFlagsByConversation([])).resolves.toEqual(new Map());
    });
  });
});
