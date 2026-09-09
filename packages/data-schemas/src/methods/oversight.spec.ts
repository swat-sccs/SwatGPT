import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { OversightMethods } from './oversight';
import { createOversightMethods, decodeKeysetCursor, encodeKeysetCursor } from './oversight';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: OversightMethods;
let models: ReturnType<typeof createModels>;

const alice = { _id: new Types.ObjectId(), name: 'Alice', email: 'alice@swarthmore.edu' };
const bob = { _id: new Types.ObjectId(), username: 'bob', email: 'bob@swarthmore.edu' };
const t = (offsetMin: number) => new Date(Date.UTC(2026, 8, 1, 12, offsetMin));

type ConvoSeed = {
  conversationId: string;
  user: string;
  model: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  isTemporary?: boolean;
  expiredAt?: Date;
};

const convos: ConvoSeed[] = [
  {
    conversationId: 'c1',
    user: String(alice._id),
    model: 'qwen',
    title: 'Dining',
    createdAt: t(0),
    updatedAt: t(30),
  },
  {
    conversationId: 'c2',
    user: String(bob._id),
    model: 'qwen',
    title: 'Registrar',
    createdAt: t(5),
    updatedAt: t(20),
  },
  {
    conversationId: 'c3',
    user: String(alice._id),
    model: 'other',
    title: 'Temp',
    createdAt: t(10),
    updatedAt: t(10),
    isTemporary: true,
    expiredAt: new Date(Date.now() + 86_400_000),
  },
  {
    conversationId: 'c4',
    user: String(alice._id),
    model: 'qwen',
    title: 'Tie',
    createdAt: t(15),
    updatedAt: t(30),
  },
];

async function seed(): Promise<void> {
  await models.User.collection.insertMany([
    { ...alice, provider: 'local', emailVerified: true },
    { ...bob, provider: 'local', emailVerified: true },
  ]);
  await models.Conversation.collection.insertMany(convos.map((c) => ({ ...c })));
  await models.Message.collection.insertMany([
    msg('m1', 'c1', alice, true, t(1), { text: 'Where is Sharples dining hall?' }),
    msg('m2', 'c1', alice, false, t(2), {
      parentMessageId: 'm1',
      feedback: { rating: 'thumbsUp' },
      model: 'qwen',
    }),
    msg('m3', 'c1', alice, true, t(3), { text: 'and the hours?' }),
    msg('m4', 'c1', alice, false, t(4), { error: true, feedback: { rating: 'thumbsDown' } }),
    msg('m5', 'c2', bob, true, t(6), { text: 'REGISTRAR deadlines (fall)' }),
    msg('m6', 'c2', bob, false, t(7), { feedback: { rating: 'thumbsDown' } }),
    msg('m7', 'c3', alice, true, t(11), { text: 'temporary question' }),
  ]);
  await models.Generation.collection.insertMany([
    gen('m2', 'c1', alice, 100, 20, t(2)),
    gen('m4', 'c1', alice, 50, 0, t(4), 'error'),
    gen('m6', 'c2', bob, 70, 30, t(7)),
  ]);
  await models.Flag.collection.insertMany([
    flag('c1', alice, 'manual', t(5)),
    flag('c2', bob, 'keyword', t(8), t(9)),
  ]);
}

function msg(
  messageId: string,
  conversationId: string,
  owner: { _id: Types.ObjectId },
  isCreatedByUser: boolean,
  createdAt: Date,
  extra: Record<string, unknown> = {},
) {
  return {
    messageId,
    conversationId,
    user: String(owner._id),
    isCreatedByUser,
    sender: isCreatedByUser ? 'User' : 'SwatGPT',
    text: '',
    error: false,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

function gen(
  messageId: string,
  conversationId: string,
  owner: { _id: Types.ObjectId },
  promptTokens: number,
  completionTokens: number,
  createdAt: Date,
  status = 'ok',
) {
  return {
    messageId,
    conversationId,
    user: owner._id,
    model: 'qwen',
    promptTokens,
    completionTokens,
    ttftMs: 120,
    durationMs: 900,
    toolCalls: ['dash_menu'],
    ragChunks: 3,
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function flag(
  conversationId: string,
  owner: { _id: Types.ObjectId },
  source: string,
  createdAt: Date,
  resolvedAt?: Date,
) {
  return {
    conversationId,
    user: owner._id,
    reason: `${source} reason`,
    source,
    createdAt,
    updatedAt: createdAt,
    ...(resolvedAt ? { resolvedAt, resolvedBy: alice._id } : {}),
  };
}

/** The shared CI box can be I/O-bound; give mongod longer than the 10 s default to open WiredTiger. */
const MONGO_LAUNCH_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: { launchTimeout: MONGO_LAUNCH_TIMEOUT_MS },
  });
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
  methods = createOversightMethods(mongoose);
}, MONGO_LAUNCH_TIMEOUT_MS + 10_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    [models.User, models.Conversation, models.Message, models.Generation, models.Flag].map((m) =>
      m.collection.deleteMany({}),
    ),
  );
  await seed();
});

describe('keyset cursor', () => {
  it('round-trips and rejects malformed input', () => {
    const id = new Types.ObjectId();
    const decoded = decodeKeysetCursor(encodeKeysetCursor(t(3), id));
    expect(decoded?.value.toISOString()).toBe(t(3).toISOString());
    expect(String(decoded?.id)).toBe(String(id));
    expect(decodeKeysetCursor('not-base64-json')).toBeNull();
    expect(decodeKeysetCursor(Buffer.from('["x","y"]').toString('base64url'))).toBeNull();
    expect(decodeKeysetCursor(Buffer.from('{"a":1}').toString('base64url'))).toBeNull();
  });
});

describe('listConversationsAdmin', () => {
  it('aggregates owner, counts, tokens, feedback and flags without user scoping', async () => {
    const { items, nextCursor } = await methods.listConversationsAdmin();
    expect(nextCursor).toBeNull();
    expect(items.map((i) => i.conversationId)).toEqual(['c4', 'c1', 'c2', 'c3']);

    const c1 = items[1];
    expect(c1.user).toEqual({ id: String(alice._id), name: 'Alice', email: alice.email });
    expect(c1.title).toBe('Dining');
    expect(c1.model).toBe('qwen');
    expect(c1.messageCount).toBe(4);
    expect(c1.errors).toBe(1);
    expect(c1.promptTokens).toBe(150);
    expect(c1.completionTokens).toBe(20);
    expect(c1.feedback).toEqual({ up: 1, down: 1 });
    expect(c1.flagged).toBe(true);
    expect(c1.createdAt).toBe(t(0).toISOString());
    expect(c1.updatedAt).toBe(t(30).toISOString());

    const c2 = items[2];
    expect(c2.user.name).toBe('bob');
    expect(c2.flagged).toBe(false);
    expect(c2.feedback).toEqual({ up: 0, down: 1 });
    expect(c2.promptTokens).toBe(70);

    const c3 = items[3];
    expect(c3.messageCount).toBe(1);
    expect(c3.promptTokens).toBe(0);
    expect(c3.flagged).toBe(false);
  });

  it('pages with a keyset cursor and breaks updatedAt ties on _id', async () => {
    const first = await methods.listConversationsAdmin({ limit: 1 });
    expect(first.items.map((i) => i.conversationId)).toEqual(['c4']);
    expect(first.nextCursor).not.toBeNull();

    const second = await methods.listConversationsAdmin({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((i) => i.conversationId)).toEqual(['c1', 'c2']);

    const third = await methods.listConversationsAdmin({ limit: 2, cursor: second.nextCursor! });
    expect(third.items.map((i) => i.conversationId)).toEqual(['c3']);
    expect(third.nextCursor).toBeNull();
  });

  it('rejects an invalid cursor', async () => {
    await expect(methods.listConversationsAdmin({ cursor: '???' })).rejects.toThrow(
      'Invalid cursor',
    );
  });

  it('filters by userId, model, flagged, errors and conversationIds', async () => {
    const ids = async (options: Parameters<OversightMethods['listConversationsAdmin']>[0]) =>
      (await methods.listConversationsAdmin(options)).items.map((i) => i.conversationId);

    expect(await ids({ userId: String(bob._id) })).toEqual(['c2']);
    expect(await ids({ model: 'other' })).toEqual(['c3']);
    expect(await ids({ flagged: true })).toEqual(['c1']);
    expect(await ids({ flagged: false })).toEqual(['c4', 'c2', 'c3']);
    expect(await ids({ errors: true })).toEqual(['c1']);
    expect(await ids({ errors: false })).toEqual(['c4', 'c2', 'c3']);
    expect(await ids({ conversationIds: ['c3', 'c2'] })).toEqual(['c2', 'c3']);
    expect(await ids({ conversationIds: ['c2'], flagged: true })).toEqual([]);
    expect(await ids({ conversationIds: [] })).toEqual([]);
  });

  it('applies from/to to the sort field and supports createdAt sort', async () => {
    const byUpdated = await methods.listConversationsAdmin({ from: t(15), to: t(25) });
    expect(byUpdated.items.map((i) => i.conversationId)).toEqual(['c2']);

    const byCreated = await methods.listConversationsAdmin({
      sort: 'createdAt',
      from: t(5),
      to: t(15),
    });
    expect(byCreated.items.map((i) => i.conversationId)).toEqual(['c4', 'c3', 'c2']);
  });
});

describe('getConversationAdmin', () => {
  it('returns ordered messages joined with generations plus flags', async () => {
    const detail = await methods.getConversationAdmin('c1');
    expect(detail).not.toBeNull();
    expect(detail!.conversation.messageCount).toBe(4);
    expect(detail!.conversation.errors).toBe(1);
    expect(detail!.conversation.promptTokens).toBe(150);
    expect(detail!.conversation.feedback).toEqual({ up: 1, down: 1 });
    expect(detail!.conversation.flagged).toBe(true);
    expect(detail!.conversation.user.email).toBe(alice.email);

    expect(detail!.messages.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3', 'm4']);
    const m2 = detail!.messages[1];
    expect(m2.parentMessageId).toBe('m1');
    expect(m2.isCreatedByUser).toBe(false);
    expect(m2.feedback?.rating).toBe('thumbsUp');
    expect(m2.generation).toMatchObject({
      messageId: 'm2',
      promptTokens: 100,
      completionTokens: 20,
      ttftMs: 120,
      toolCalls: ['dash_menu'],
      status: 'ok',
      errorType: null,
    });
    expect(detail!.messages[0].generation).toBeUndefined();
    expect(detail!.messages[3].error).toBe(true);
    expect(detail!.messages[3].generation?.status).toBe('error');

    expect(detail!.flags).toHaveLength(1);
    expect(detail!.flags[0]).toMatchObject({
      conversationId: 'c1',
      userId: String(alice._id),
      source: 'manual',
      resolvedAt: null,
      resolvedBy: null,
      createdBy: null,
    });
  });

  it('returns null for an unknown conversation', async () => {
    expect(await methods.getConversationAdmin('nope')).toBeNull();
  });
});

describe('findConversationOwner', () => {
  it('returns the owner reference or null', async () => {
    expect(await methods.findConversationOwner('c2')).toEqual({
      conversationId: 'c2',
      title: 'Registrar',
      userId: String(bob._id),
    });
    expect(await methods.findConversationOwner('missing')).toBeNull();
  });
});

describe('search', () => {
  it('searchMessagesAdmin returns null when Meilisearch is not configured', async () => {
    const previous = process.env.MEILI_HOST;
    delete process.env.MEILI_HOST;
    expect(await methods.searchMessagesAdmin('dining', 10)).toBeNull();
    if (previous) {
      process.env.MEILI_HOST = previous;
    }
  });

  it('searchMessageTextAdmin matches case-insensitively, escapes regex and de-duplicates', async () => {
    expect(await methods.searchMessageTextAdmin('sharples', 10)).toEqual(['c1']);
    expect(await methods.searchMessageTextAdmin('registrar deadlines (fall)', 10)).toEqual(['c2']);
    expect(await methods.searchMessageTextAdmin('.*', 10)).toEqual([]);
    expect(await methods.searchMessageTextAdmin('hours', 10)).toEqual(['c1']);
    const all = await methods.searchMessageTextAdmin('e', 10);
    expect(new Set(all).size).toBe(all.length);
  });
});
