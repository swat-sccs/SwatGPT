import { Keyv } from 'keyv';
import { Types } from 'mongoose';
import type { IUser, IBalance } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminControlsDeps } from './controls';
import { createAdminControlsHandlers } from './controls';
import { DEFAULT_PAUSE_MESSAGE, createPauseService } from './pause';
import { createBanService } from './bans';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const HOUR = 60 * 60 * 1000;
const adminId = new Types.ObjectId();
const targetId = new Types.ObjectId();

function mockUser(id: Types.ObjectId, email: string): IUser {
  return { _id: id, id: id.toString(), email, name: 'Someone' } as IUser;
}

function mockBalance(overrides: Partial<IBalance> = {}): IBalance {
  return {
    user: targetId,
    tokenCredits: 1000,
    autoRefillEnabled: true,
    refillAmount: 500,
    refillIntervalValue: 1,
    refillIntervalUnit: 'days',
    ...overrides,
  } as IBalance;
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    body?: unknown;
    user?: IUser | null;
    ip?: string;
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    body: overrides.body ?? {},
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
    ip: overrides.ip ?? '10.0.0.1',
    user: overrides.user === null ? undefined : (overrides.user ?? mockUser(adminId, 'admin@x')),
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminControlsDeps> = {}) {
  const users = new Map<string, IUser>([[targetId.toString(), mockUser(targetId, 'target@x')]]);
  const deps: AdminControlsDeps = {
    banService: createBanService(new Keyv({ ttl: 2 * HOUR }), { defaultDurationMs: 2 * HOUR }),
    pauseService: createPauseService(new Keyv()),
    getUserById: jest.fn(async (id: string) => users.get(id) ?? null),
    findBalanceByUser: jest.fn().mockResolvedValue(null),
    upsertBalanceFields: jest.fn().mockResolvedValue(mockBalance()),
    invalidateAuthUserCache: jest.fn().mockResolvedValue(undefined),
    deleteUserSessions: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    recordAuditEntry: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return deps;
}

describe('createAdminControlsHandlers', () => {
  describe('pause', () => {
    it('returns the running state by default', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status, json } = createReqRes();

      await handlers.getPause(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        paused: false,
        message: DEFAULT_PAUSE_MESSAGE,
        updatedAt: null,
        updatedBy: null,
      });
    });

    it('rejects a non-boolean paused flag', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status } = createReqRes({ body: { paused: 'yes' } });

      await handlers.setPause(req, res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('requires an authenticated caller', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status } = createReqRes({ body: { paused: true }, user: null });

      await handlers.setPause(req, res);

      expect(status).toHaveBeenCalledWith(401);
    });

    it('pauses, persists the message, and audits system.paused with request context', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { paused: true, message: 'Maintenance until 5pm' },
      });

      await handlers.setPause(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          paused: true,
          message: 'Maintenance until 5pm',
          updatedBy: adminId.toString(),
        }),
      );
      await expect(deps.pauseService.getState()).resolves.toMatchObject({ paused: true });
      expect(deps.recordAuditEntry).toHaveBeenCalledTimes(1);
      expect(deps.recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'system.paused',
          outcome: 'success',
          severity: 'warning',
          actor: { type: 'user', id: adminId.toString(), name: 'Someone' },
          target: expect.objectContaining({ type: 'system' }),
          metadata: { message: 'Maintenance until 5pm' },
          context: { ip: '10.0.0.1', userAgent: 'jest', requestId: 'req-1' },
        }),
      );
    });

    it('audits system.resumed and skips no-op updates', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      await deps.pauseService.setState({ paused: true, updatedBy: 'someone' });

      const first = createReqRes({ body: { paused: false } });
      await handlers.setPause(first.req, first.res);
      expect(deps.recordAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'system.resumed' }),
      );

      const second = createReqRes({ body: { paused: false } });
      await handlers.setPause(second.req, second.res);
      expect(deps.recordAuditEntry).toHaveBeenCalledTimes(1);
      expect(second.status).toHaveBeenCalledWith(200);
    });

    it('surfaces a failed audit write when fail-closed', async () => {
      const recordAuditEntry = jest.fn().mockRejectedValue(new Error('audit down'));
      const handlers = createAdminControlsHandlers(
        createDeps({ recordAuditEntry, auditFailClosed: true }),
      );
      const { req, res, status } = createReqRes({ body: { paused: true } });

      await handlers.setPause(req, res);

      expect(recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'system.paused' }),
        { failClosed: true },
      );
      expect(status).toHaveBeenCalledWith(500);
    });

    it('swallows a failed audit write when fail-open', async () => {
      const recordAuditEntry = jest.fn().mockRejectedValue(new Error('audit down'));
      const handlers = createAdminControlsHandlers(createDeps({ recordAuditEntry }));
      const { req, res, status } = createReqRes({ body: { paused: true } });

      await handlers.setPause(req, res);

      expect(status).toHaveBeenCalledWith(200);
    });
  });

  describe('getUserControls', () => {
    it('rejects a malformed id', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status, json } = createReqRes({ params: { id: 'nope' } });

      await handlers.getUserControls(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user id' });
    });

    it('returns 404 for an unknown user', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status } = createReqRes({
        params: { id: new Types.ObjectId().toString() },
      });

      await handlers.getUserControls(req, res);

      expect(status).toHaveBeenCalledWith(404);
    });

    it('reports an unbanned user with no balance record', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status, json } = createReqRes({ params: { id: targetId.toString() } });

      await handlers.getUserControls(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        userId: targetId.toString(),
        banned: false,
        banExpiresAt: null,
        balance: null,
      });
    });

    it('reports ban state and balance fields', async () => {
      const deps = createDeps({ findBalanceByUser: jest.fn().mockResolvedValue(mockBalance()) });
      const handlers = createAdminControlsHandlers(deps);
      const ban = await deps.banService.ban(targetId.toString(), { durationMs: HOUR });
      const { req, res, json } = createReqRes({ params: { id: targetId.toString() } });

      await handlers.getUserControls(req, res);

      expect(json).toHaveBeenCalledWith({
        userId: targetId.toString(),
        banned: true,
        banExpiresAt: ban.expiresAt,
        balance: {
          tokenCredits: 1000,
          autoRefillEnabled: true,
          refillAmount: 500,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
        },
      });
    });
  });

  describe('banUser', () => {
    it('rejects a negative duration', async () => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status } = createReqRes({
        params: { id: targetId.toString() },
        body: { durationMs: -1 },
      });

      await handlers.banUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('refuses to let an admin ban themselves', async () => {
      const deps = createDeps({
        getUserById: jest.fn().mockResolvedValue(mockUser(adminId, 'admin@x')),
      });
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: adminId.toString() } });

      await handlers.banUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'You cannot ban yourself' });
      await expect(deps.banService.isBanned(adminId.toString())).resolves.toBe(false);
    });

    it('bans, invalidates the auth cache and sessions, audits, and returns controls', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: targetId.toString() },
        body: { durationMs: HOUR, reason: '  spam  ' },
      });

      await handlers.banUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const ban = await deps.banService.getBan(targetId.toString());
      expect(ban).toEqual({
        userId: targetId.toString(),
        reason: 'spam',
        expiresAt: expect.any(String),
      });
      expect(json).toHaveBeenCalledWith({
        userId: targetId.toString(),
        banned: true,
        banExpiresAt: ban?.expiresAt,
        balance: null,
      });
      expect(deps.invalidateAuthUserCache).toHaveBeenCalledWith(targetId.toString());
      expect(deps.deleteUserSessions).toHaveBeenCalledWith(targetId.toString());
      expect(deps.recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.banned',
          actor: expect.objectContaining({ id: adminId.toString() }),
          target: { type: 'user', id: targetId.toString(), name: 'target@x' },
          metadata: { reason: 'spam', durationMs: HOUR, expiresAt: ban?.expiresAt },
        }),
      );
    });

    it('uses the default duration when the body is empty', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId.toString() } });

      await handlers.banUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const ban = await deps.banService.getBan(targetId.toString());
      expect(ban?.reason).toBeNull();
      expect(ban?.expiresAt).toEqual(expect.any(String));
    });
  });

  describe('unbanUser', () => {
    it('lifts the ban, invalidates the auth cache and audits', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      await deps.banService.ban(targetId.toString(), { durationMs: HOUR, reason: 'spam' });
      const { req, res, status, json } = createReqRes({ params: { id: targetId.toString() } });

      await handlers.unbanUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ banned: false }));
      await expect(deps.banService.isBanned(targetId.toString())).resolves.toBe(false);
      expect(deps.invalidateAuthUserCache).toHaveBeenCalledWith(targetId.toString());
      expect(deps.recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.unbanned',
          metadata: expect.objectContaining({ reason: 'spam' }),
        }),
      );
    });

    it('does not audit when the user was not banned', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId.toString() } });

      await handlers.unbanUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.recordAuditEntry).not.toHaveBeenCalled();
    });
  });

  describe('setUserBalance', () => {
    it.each([undefined, -5, 'lots', Number.NaN])('rejects tokenCredits %p', async (value) => {
      const handlers = createAdminControlsHandlers(createDeps());
      const { req, res, status } = createReqRes({
        params: { id: targetId.toString() },
        body: { tokenCredits: value },
      });

      await handlers.setUserBalance(req, res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('upserts the balance and audits the previous and new values', async () => {
      const findBalanceByUser = jest
        .fn()
        .mockResolvedValueOnce(mockBalance({ tokenCredits: 200 }))
        .mockResolvedValueOnce(mockBalance({ tokenCredits: 5000 }));
      const deps = createDeps({ findBalanceByUser });
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: targetId.toString() },
        body: { tokenCredits: 5000 },
      });

      await handlers.setUserBalance(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.upsertBalanceFields).toHaveBeenCalledWith(targetId.toString(), {
        tokenCredits: 5000,
      });
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ balance: expect.objectContaining({ tokenCredits: 5000 }) }),
      );
      expect(deps.recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.balance_set',
          target: expect.objectContaining({ id: targetId.toString() }),
          metadata: { previousTokenCredits: 200, tokenCredits: 5000 },
        }),
      );
    });

    it('creates a balance record when none exists yet', async () => {
      const deps = createDeps();
      const handlers = createAdminControlsHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { id: targetId.toString() },
        body: { tokenCredits: 0 },
      });

      await handlers.setUserBalance(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.upsertBalanceFields).toHaveBeenCalledWith(targetId.toString(), {
        tokenCredits: 0,
      });
      expect(deps.recordAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { previousTokenCredits: null, tokenCredits: 0 } }),
      );
    });
  });
});
