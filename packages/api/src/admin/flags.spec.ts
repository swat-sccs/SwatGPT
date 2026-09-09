import { Types } from 'mongoose';
import type { TAdminFlag } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminFlagsDeps } from './flags';
import { createAdminFlagsHandlers } from './flags';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const adminId = new Types.ObjectId();
const flagId = new Types.ObjectId().toString();
const ownerId = new Types.ObjectId().toString();

function flag(overrides: Partial<TAdminFlag> = {}): TAdminFlag {
  return {
    id: flagId,
    conversationId: 'c1',
    messageId: null,
    userId: ownerId,
    reason: 'self-harm',
    source: 'keyword',
    createdBy: null,
    createdAt: '2026-09-01T13:00:00.000Z',
    resolvedAt: '2026-09-01T14:00:00.000Z',
    resolvedBy: adminId.toString(),
    ...overrides,
  };
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    user?: null | { _id: Types.ObjectId; name?: string };
  } = {},
) {
  const user =
    overrides.user === null ? undefined : (overrides.user ?? { _id: adminId, name: 'Admin' });
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: {},
    headers: {},
    user,
  } as unknown as ServerRequest;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminFlagsDeps> = {}): AdminFlagsDeps {
  return {
    listFlags: jest.fn().mockResolvedValue({ flags: [flag()], nextCursor: null }),
    resolveFlag: jest.fn().mockResolvedValue(flag()),
    recordAuditEntry: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createAdminFlagsHandlers', () => {
  describe('listFlags', () => {
    it('returns the page with parsed filters and does not audit', async () => {
      const deps = createDeps();
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        query: { limit: '50', resolved: 'false' },
      });

      await handlers.listFlags(req, res);

      expect(deps.listFlags).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 50,
        resolved: false,
      });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ flags: [flag()], nextCursor: null });
      expect(deps.recordAuditEntry).not.toHaveBeenCalled();
    });

    it.each([[{ limit: '500' }], [{ resolved: 'maybe' }], [{ cursor: '!!' }]])(
      'rejects %p with 400',
      async (query) => {
        const deps = createDeps();
        const handlers = createAdminFlagsHandlers(deps);
        const { req, res, status } = createReqRes({ query });

        await handlers.listFlags(req, res);

        expect(status).toHaveBeenCalledWith(400);
        expect(deps.listFlags).not.toHaveBeenCalled();
      },
    );

    it('returns 500 when the data layer throws', async () => {
      const deps = createDeps({ listFlags: jest.fn().mockRejectedValue(new Error('boom')) });
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status } = createReqRes();

      await handlers.listFlags(req, res);

      expect(status).toHaveBeenCalledWith(500);
    });
  });

  describe('resolveFlag', () => {
    it('resolves the flag as the caller and audits conversation.flag_resolved', async () => {
      const deps = createDeps();
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: flagId } });

      await handlers.resolveFlag(req, res);

      expect(deps.resolveFlag).toHaveBeenCalledWith(flagId, adminId.toString());
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(flag());
      expect((deps.recordAuditEntry as jest.Mock).mock.calls[0][0]).toMatchObject({
        action: 'conversation.flag_resolved',
        actor: { type: 'user', id: adminId.toString(), name: 'Admin' },
        target: { type: 'conversation', id: 'c1' },
        metadata: { flagId, reason: 'self-harm' },
      });
    });

    it('rejects a malformed id with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: 'nope' } });

      await handlers.resolveFlag(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(deps.resolveFlag).not.toHaveBeenCalled();
    });

    it('returns 404 without auditing when the flag is missing', async () => {
      const deps = createDeps({ resolveFlag: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: flagId } });

      await handlers.resolveFlag(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(deps.recordAuditEntry).not.toHaveBeenCalled();
    });

    it('returns 401 without a user', async () => {
      const deps = createDeps();
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: flagId }, user: null });

      await handlers.resolveFlag(req, res);

      expect(status).toHaveBeenCalledWith(401);
    });

    it('fail-closed: returns 500 when the audit write fails', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
        auditFailClosed: true,
      });
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: flagId } });

      await handlers.resolveFlag(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to record audit entry' });
    });

    it('fail-open: still returns the flag when the audit write fails', async () => {
      const deps = createDeps({
        recordAuditEntry: jest.fn().mockRejectedValue(new Error('audit down')),
      });
      const handlers = createAdminFlagsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: flagId } });

      await handlers.resolveFlag(req, res);

      expect(status).toHaveBeenCalledWith(200);
    });
  });
});
