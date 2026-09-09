import { Types } from 'mongoose';
import type { TAdminConversationDetail, TAdminFlag } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminConversationsDeps } from './conversations';
import { createAdminConversationsHandlers } from './conversations';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const adminId = new Types.ObjectId();
const ownerId = new Types.ObjectId().toString();

function detail(overrides: Partial<TAdminConversationDetail> = {}): TAdminConversationDetail {
  return {
    conversation: {
      conversationId: 'c1',
      title: 'Dining',
      user: { id: ownerId, name: 'Alice', email: 'alice@swarthmore.edu' },
      model: 'qwen',
      messageCount: 2,
      promptTokens: 100,
      completionTokens: 20,
      errors: 0,
      flagged: false,
      feedback: { up: 1, down: 0 },
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:30:00.000Z',
    },
    messages: [
      {
        messageId: 'm1',
        parentMessageId: null,
        sender: 'User',
        isCreatedByUser: true,
        text: 'Where is Sharples?',
        model: null,
        tokenCount: 5,
        error: false,
        createdAt: '2026-09-01T12:01:00.000Z',
      },
      {
        messageId: 'm2',
        parentMessageId: 'm1',
        sender: 'SwatGPT',
        isCreatedByUser: false,
        text: 'On campus.',
        model: 'qwen',
        tokenCount: 3,
        error: false,
        createdAt: '2026-09-01T12:02:00.000Z',
      },
    ],
    flags: [],
    ...overrides,
  };
}

function flag(overrides: Partial<TAdminFlag> = {}): TAdminFlag {
  return {
    id: new Types.ObjectId().toString(),
    conversationId: 'c1',
    messageId: null,
    userId: ownerId,
    reason: 'threat',
    source: 'manual',
    createdBy: adminId.toString(),
    createdAt: '2026-09-01T13:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: null | { _id: Types.ObjectId; name?: string; email?: string; tenantId?: string };
  } = {},
) {
  const user =
    overrides.user === null
      ? undefined
      : (overrides.user ?? { _id: adminId, name: 'Admin', email: 'admin@swarthmore.edu' });
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
    ip: '10.0.0.1',
    user,
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const write = jest.fn();
  const end = jest.fn();
  const res = { status, json, setHeader, write, end } as unknown as Response;
  return { req, res, status, json, setHeader, write, end };
}

function createDeps(overrides: Partial<AdminConversationsDeps> = {}): AdminConversationsDeps {
  return {
    listConversationsAdmin: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getConversationAdmin: jest.fn().mockResolvedValue(detail()),
    findConversationOwner: jest
      .fn()
      .mockResolvedValue({ conversationId: 'c1', title: 'Dining', userId: ownerId }),
    searchMessagesAdmin: jest.fn().mockResolvedValue(null),
    searchMessageTextAdmin: jest.fn().mockResolvedValue([]),
    createFlagAdmin: jest.fn().mockImplementation(async (input) => flag(input)),
    deleteFlag: jest.fn().mockResolvedValue(true),
    recordAuditEntry: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const validCursor = Buffer.from(
  JSON.stringify(['2026-09-01T12:30:00.000Z', new Types.ObjectId().toString()]),
).toString('base64url');

describe('createAdminConversationsHandlers', () => {
  describe('listConversations', () => {
    it('passes parsed filters to the data layer and never audits', async () => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        query: {
          cursor: validCursor,
          limit: '10',
          userId: ownerId,
          model: 'qwen',
          from: '2026-09-01T00:00:00Z',
          to: '2026-09-02T00:00:00Z',
          flagged: 'true',
          errors: 'false',
          sort: 'createdAt',
        },
      });

      await handlers.listConversations(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ conversations: [], nextCursor: null });
      expect(deps.listConversationsAdmin).toHaveBeenCalledWith({
        cursor: validCursor,
        limit: 10,
        userId: ownerId,
        model: 'qwen',
        from: new Date('2026-09-01T00:00:00Z'),
        to: new Date('2026-09-02T00:00:00Z'),
        flagged: true,
        errors: false,
        sort: 'createdAt',
        conversationIds: undefined,
      });
      expect(deps.recordAuditEntry).not.toHaveBeenCalled();
    });

    it.each([
      [{ limit: '0' }, 'limit'],
      [{ limit: '101' }, 'limit'],
      [{ limit: 'ten' }, 'limit'],
      [{ from: 'yesterday' }, 'from'],
      [{ from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' }, 'from must not be after to'],
      [{ flagged: 'yes' }, 'flagged'],
      [{ errors: '1' }, 'errors'],
      [{ sort: 'title' }, 'sort'],
      [{ userId: 'not-an-id' }, 'userId'],
      [{ cursor: 'garbage' }, 'cursor'],
      [{ search: 'a' }, 'search'],
      [{ limit: ['1', '2'] }, 'single strings'],
    ])('rejects %p with 400', async (query, fragment) => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({ query });

      await handlers.listConversations(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toContain(fragment);
      expect(deps.listConversationsAdmin).not.toHaveBeenCalled();
    });

    it('scopes the list to Meilisearch hits when search is set', async () => {
      const deps = createDeps({
        searchMessagesAdmin: jest.fn().mockResolvedValue(['c2', 'c1']),
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res } = createReqRes({ query: { search: 'sharples' } });

      await handlers.listConversations(req, res);

      expect(deps.searchMessagesAdmin).toHaveBeenCalledWith('sharples', 200);
      expect(deps.searchMessageTextAdmin).not.toHaveBeenCalled();
      expect(deps.listConversationsAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ conversationIds: ['c2', 'c1'] }),
      );
    });

    it('falls back to the Mongo text search when Meilisearch is unavailable', async () => {
      const deps = createDeps({
        searchMessagesAdmin: jest.fn().mockResolvedValue(null),
        searchMessageTextAdmin: jest.fn().mockResolvedValue(['c3']),
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res } = createReqRes({ query: { search: 'registrar' } });

      await handlers.listConversations(req, res);

      expect(deps.searchMessageTextAdmin).toHaveBeenCalledWith('registrar', 200);
      expect(deps.listConversationsAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ conversationIds: ['c3'] }),
      );
    });

    it('short-circuits with an empty page when the search matches nothing', async () => {
      const deps = createDeps({ searchMessagesAdmin: jest.fn().mockResolvedValue([]) });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { search: 'nothing' } });

      await handlers.listConversations(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ conversations: [], nextCursor: null });
      expect(deps.listConversationsAdmin).not.toHaveBeenCalled();
    });

    it('returns 500 when the data layer throws', async () => {
      const deps = createDeps({
        listConversationsAdmin: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes();

      await handlers.listConversations(req, res);

      expect(status).toHaveBeenCalledWith(500);
    });
  });

  describe('getConversation', () => {
    it('returns the detail and writes a conversation.viewed audit entry', async () => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { conversationId: 'c1' } });

      await handlers.getConversation(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(detail());
      expect(deps.recordAuditEntry).toHaveBeenCalledTimes(1);
      const [input, options] = (deps.recordAuditEntry as jest.Mock).mock.calls[0];
      expect(options).toBeUndefined();
      expect(input).toMatchObject({
        action: 'conversation.viewed',
        outcome: 'success',
        actor: { type: 'user', id: adminId.toString(), name: 'Admin' },
        target: { type: 'conversation', id: 'c1', name: 'Dining' },
        metadata: { ownerId, messageCount: 2 },
        context: { ip: '10.0.0.1', userAgent: 'jest', requestId: 'req-1' },
      });
    });

    it('returns 404 without auditing when the conversation is missing', async () => {
      const deps = createDeps({ getConversationAdmin: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { conversationId: 'nope' } });

      await handlers.getConversation(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(deps.recordAuditEntry).not.toHaveBeenCalled();
    });

    it('returns 401 without a user', async () => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { conversationId: 'c1' }, user: null });

      await handlers.getConversation(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(deps.getConversationAdmin).not.toHaveBeenCalled();
    });

    it('fail-open: logs an audit failure and still returns the content', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { conversationId: 'c1' } });

      await handlers.getConversation(req, res);

      expect(status).toHaveBeenCalledWith(200);
    });

    it('fail-closed: withholds the content with a 500 when the audit write fails', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
        auditFailClosed: true,
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { conversationId: 'c1' } });

      await handlers.getConversation(req, res);

      expect(deps.recordAuditEntry).toHaveBeenCalledWith(expect.anything(), { failClosed: true });
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to record audit entry' });
      expect(json).not.toHaveBeenCalledWith(
        expect.objectContaining({ messages: expect.anything() }),
      );
    });
  });

  describe('exportConversation', () => {
    it('streams JSONL with an attachment header and audits conversation.exported', async () => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, setHeader, write, end, status } = createReqRes({
        params: { conversationId: 'c1' },
      });

      await handlers.exportConversation(req, res);

      expect(status).not.toHaveBeenCalled();
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="c1.jsonl"',
      );
      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson; charset=utf-8');
      const lines = write.mock.calls.map(([chunk]) => JSON.parse(String(chunk).trimEnd()));
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({ type: 'conversation', conversationId: 'c1', flags: [] });
      expect(lines[1]).toMatchObject({ type: 'message', messageId: 'm1' });
      expect(lines[2]).toMatchObject({ type: 'message', messageId: 'm2' });
      expect(write.mock.calls.every(([chunk]) => String(chunk).endsWith('\n'))).toBe(true);
      expect(end).toHaveBeenCalledTimes(1);

      expect(deps.recordAuditEntry).toHaveBeenCalledTimes(1);
      expect((deps.recordAuditEntry as jest.Mock).mock.calls[0][0]).toMatchObject({
        action: 'conversation.exported',
        target: { type: 'conversation', id: 'c1' },
        metadata: { format: 'jsonl', messageCount: 2, ownerId },
      });
    });

    it('sanitizes the download filename', async () => {
      const deps = createDeps({
        getConversationAdmin: jest.fn().mockResolvedValue(
          detail({
            conversation: { ...detail().conversation, conversationId: 'a/b"c|d' },
          }),
        ),
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, setHeader } = createReqRes({ params: { conversationId: 'a/b"c|d' } });

      await handlers.exportConversation(req, res);

      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="a_b_c_d.jsonl"',
      );
    });

    it('fail-closed: writes nothing when the audit write fails', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
        auditFailClosed: true,
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, write, end } = createReqRes({ params: { conversationId: 'c1' } });

      await handlers.exportConversation(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(write).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing conversation', async () => {
      const deps = createDeps({ getConversationAdmin: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, write } = createReqRes({ params: { conversationId: 'x' } });

      await handlers.exportConversation(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('flagConversation', () => {
    it('creates a manual flag attributed to the caller and audits it', async () => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { conversationId: 'c1' },
        body: { reason: '  threatening language  ', messageId: 'm2' },
      });

      await handlers.flagConversation(req, res);

      expect(deps.createFlagAdmin).toHaveBeenCalledWith({
        conversationId: 'c1',
        messageId: 'm2',
        user: ownerId,
        reason: 'threatening language',
        source: 'manual',
        createdBy: adminId.toString(),
        tenantId: undefined,
      });
      expect(status).toHaveBeenCalledWith(201);
      const body = json.mock.calls[0][0] as TAdminFlag;
      expect(body).toMatchObject({ conversationId: 'c1', source: 'manual', messageId: 'm2' });
      expect((deps.recordAuditEntry as jest.Mock).mock.calls[0][0]).toMatchObject({
        action: 'conversation.flagged',
        target: { type: 'conversation', id: 'c1', name: 'Dining' },
        metadata: { flagId: body.id, reason: 'threatening language', messageId: 'm2', ownerId },
      });
    });

    it.each([
      [{}, 'reason'],
      [{ reason: '   ' }, 'reason'],
      [{ reason: 'x'.repeat(501) }, 'reason'],
      [{ reason: 'ok', messageId: 42 }, 'single strings'],
    ])('rejects body %p with 400', async (body, fragment) => {
      const deps = createDeps();
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { conversationId: 'c1' }, body });

      await handlers.flagConversation(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toContain(fragment);
      expect(deps.createFlagAdmin).not.toHaveBeenCalled();
    });

    it('returns 404 when the conversation does not exist', async () => {
      const deps = createDeps({ findConversationOwner: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { conversationId: 'zzz' },
        body: { reason: 'spam' },
      });

      await handlers.flagConversation(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(deps.createFlagAdmin).not.toHaveBeenCalled();
    });

    it('fail-closed: rolls the flag back when the audit write fails', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
        auditFailClosed: true,
      });
      const handlers = createAdminConversationsHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { conversationId: 'c1' },
        body: { reason: 'spam' },
      });

      await handlers.flagConversation(req, res);

      expect(status).toHaveBeenCalledWith(500);
      const created = await (deps.createFlagAdmin as jest.Mock).mock.results[0].value;
      expect(deps.deleteFlag).toHaveBeenCalledWith(created.id);
    });
  });
});
