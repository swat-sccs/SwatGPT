import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  IUser,
  IBalance,
  AuditAction,
  AuditTarget,
  AuditContext,
  AuditMetadata,
  IBalanceUpdate,
  RecordAuditEntryInput,
  RecordAuditEntryOptions,
} from '@librechat/data-schemas';
import type {
  TAdminBalance,
  TAdminBanRequest,
  TAdminPauseState,
  TAdminUserControls,
  TAdminPauseRequest,
  TAdminBalanceRequest,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { PauseService } from './pause';
import type { BanService } from './bans';
import { buildAuditContext } from './context';

export interface AdminControlsDeps {
  banService: BanService;
  pauseService: PauseService;
  getUserById: (userId: string, fieldsToSelect?: string | string[] | null) => Promise<IUser | null>;
  findBalanceByUser: (userId: string) => Promise<IBalance | null>;
  upsertBalanceFields: (userId: string, fields: IBalanceUpdate) => Promise<IBalance | null>;
  /** Drops the OpenID JWT request-burst cache so a ban is not served from a stale `req.user`. */
  invalidateAuthUserCache?: (userId: string) => Promise<void>;
  /** Revokes refresh sessions so a banned user cannot mint a new access token. */
  deleteUserSessions?: (userId: string) => Promise<unknown>;
  recordAuditEntry?: (
    input: RecordAuditEntryInput,
    options?: RecordAuditEntryOptions,
  ) => Promise<unknown>;
  /** See `AdminGrantsDeps.auditFailClosed`: surface a failed audit write as a 5xx. */
  auditFailClosed?: boolean;
}

type Handler = (req: ServerRequest, res: Response) => Promise<Response>;

export interface AdminControlsHandlers {
  getPause: Handler;
  setPause: Handler;
  getUserControls: Handler;
  banUser: Handler;
  unbanUser: Handler;
  setUserBalance: Handler;
}

interface Caller {
  userId: string;
  actorName: string;
  tenantId?: string;
}

const PAUSE_TARGET: AuditTarget = { type: 'system', id: 'controls.pause', name: 'Pause switch' };
const MAX_REASON_LENGTH = 500;
const MAX_PAUSE_MESSAGE_LENGTH = 500;

function resolveCaller(req: ServerRequest): Caller | null {
  const user = req.user;
  if (!user) {
    return null;
  }
  const userId = user._id?.toString() ?? user.id;
  if (!userId) {
    return null;
  }
  const actorName = user.name || user.username || user.email || userId;
  return { userId, actorName, tenantId: user.tenantId };
}

function userTarget(user: IUser): AuditTarget {
  const id = user._id?.toString() ?? user.id;
  return { type: 'user', id, name: user.email || user.username || user.name || id };
}

function toAdminBalance(balance: IBalance | null): TAdminBalance | null {
  if (!balance) {
    return null;
  }
  return {
    tokenCredits: balance.tokenCredits ?? 0,
    autoRefillEnabled: balance.autoRefillEnabled ?? false,
    refillAmount: balance.refillAmount ?? null,
    refillIntervalValue: balance.refillIntervalValue ?? null,
    refillIntervalUnit: balance.refillIntervalUnit ?? null,
  };
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateBanBody(body: TAdminBanRequest | undefined): string | null {
  const { durationMs, reason } = body ?? {};
  if (durationMs !== undefined && !isNonNegativeNumber(durationMs)) {
    return 'durationMs must be a non-negative number of milliseconds';
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return 'reason must be a string';
  }
  if (reason !== undefined && reason.length > MAX_REASON_LENGTH) {
    return `reason must be at most ${MAX_REASON_LENGTH} characters`;
  }
  return null;
}

function validatePauseBody(body: TAdminPauseRequest | undefined): string | null {
  const { paused, message } = body ?? {};
  if (typeof paused !== 'boolean') {
    return 'paused must be a boolean';
  }
  if (message !== undefined && typeof message !== 'string') {
    return 'message must be a string';
  }
  if (message !== undefined && message.length > MAX_PAUSE_MESSAGE_LENGTH) {
    return `message must be at most ${MAX_PAUSE_MESSAGE_LENGTH} characters`;
  }
  return null;
}

/** Creates the handlers behind `/api/admin/controls` (bans, balances, global pause). */
export function createAdminControlsHandlers(deps: AdminControlsDeps): AdminControlsHandlers {
  const {
    banService,
    pauseService,
    getUserById,
    findBalanceByUser,
    upsertBalanceFields,
    invalidateAuthUserCache,
    deleteUserSessions,
    recordAuditEntry,
    auditFailClosed,
  } = deps;

  async function emitAudit(args: {
    action: AuditAction;
    caller: Caller;
    target: AuditTarget;
    metadata?: AuditMetadata;
    context?: AuditContext;
  }): Promise<void> {
    if (!recordAuditEntry) {
      return;
    }
    const input: RecordAuditEntryInput = {
      action: args.action,
      outcome: 'success',
      severity: 'warning',
      actor: { type: 'user', id: args.caller.userId, name: args.caller.actorName },
      target: args.target,
      metadata: args.metadata,
      context: args.context,
      tenantId: args.caller.tenantId,
    };
    if (auditFailClosed) {
      await recordAuditEntry(input, { failClosed: true });
      return;
    }
    try {
      await recordAuditEntry(input);
    } catch (err) {
      logger.error('[adminControls] audit write failed', err);
    }
  }

  async function loadUserControls(userId: string): Promise<TAdminUserControls> {
    const [ban, balance] = await Promise.all([
      banService.getBan(userId),
      findBalanceByUser(userId),
    ]);
    return {
      userId,
      banned: ban !== null,
      banExpiresAt: ban?.expiresAt ?? null,
      balance: toAdminBalance(balance),
    };
  }

  /** Resolves the caller and the addressed user, writing the error response on failure. */
  async function resolveTargetUser(
    req: ServerRequest,
    res: Response,
  ): Promise<{ caller: Caller; user: IUser; userId: string } | null> {
    const caller = resolveCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    const { id } = req.params as { id: string };
    if (!isValidObjectIdString(id)) {
      res.status(400).json({ error: 'Invalid user id' });
      return null;
    }
    const user = await getUserById(id, '_id name username email');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return null;
    }
    return { caller, user, userId: id };
  }

  async function forgetUser(userId: string): Promise<void> {
    await Promise.all([invalidateAuthUserCache?.(userId), deleteUserSessions?.(userId)]);
  }

  async function getPause(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const state = await pauseService.getState();
      return res.status(200).json(state);
    } catch (error) {
      logger.error('[adminControls] getPause error:', error);
      return res.status(500).json({ error: 'Failed to read pause state' });
    }
  }

  async function setPause(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const caller = resolveCaller(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const bodyError = validatePauseBody(req.body as TAdminPauseRequest | undefined);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }
      const { paused, message } = req.body as TAdminPauseRequest;
      const previous = await pauseService.getState();
      const state: TAdminPauseState = await pauseService.setState({
        paused,
        message,
        updatedBy: caller.userId,
      });
      const changed =
        previous.paused !== state.paused || (state.paused && previous.message !== state.message);
      if (changed) {
        await emitAudit({
          action: state.paused ? 'system.paused' : 'system.resumed',
          caller,
          target: PAUSE_TARGET,
          metadata: { message: state.message },
          context: buildAuditContext(req),
        });
      }
      return res.status(200).json(state);
    } catch (error) {
      logger.error('[adminControls] setPause error:', error);
      return res.status(500).json({ error: 'Failed to update pause state' });
    }
  }

  async function getUserControls(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      return res.status(200).json(await loadUserControls(resolved.userId));
    } catch (error) {
      logger.error('[adminControls] getUserControls error:', error);
      return res.status(500).json({ error: 'Failed to load user controls' });
    }
  }

  async function banUser(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const bodyError = validateBanBody(req.body as TAdminBanRequest | undefined);
      if (bodyError) {
        return res.status(400).json({ error: bodyError });
      }
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      const { caller, user, userId } = resolved;
      if (userId === caller.userId) {
        return res.status(400).json({ error: 'You cannot ban yourself' });
      }
      const { durationMs, reason } = (req.body ?? {}) as TAdminBanRequest;
      const trimmedReason = reason?.trim() || undefined;
      const record = await banService.ban(userId, { durationMs, reason: trimmedReason });
      await forgetUser(userId);
      await emitAudit({
        action: 'user.banned',
        caller,
        target: userTarget(user),
        metadata: {
          reason: record.reason,
          durationMs: durationMs ?? null,
          expiresAt: record.expiresAt,
        },
        context: buildAuditContext(req),
      });
      return res.status(200).json(await loadUserControls(userId));
    } catch (error) {
      logger.error('[adminControls] banUser error:', error);
      return res.status(500).json({ error: 'Failed to ban user' });
    }
  }

  async function unbanUser(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      const { caller, user, userId } = resolved;
      const existing = await banService.getBan(userId);
      await banService.unban(userId);
      await invalidateAuthUserCache?.(userId);
      if (existing) {
        await emitAudit({
          action: 'user.unbanned',
          caller,
          target: userTarget(user),
          metadata: { reason: existing.reason, expiresAt: existing.expiresAt },
          context: buildAuditContext(req),
        });
      }
      return res.status(200).json(await loadUserControls(userId));
    } catch (error) {
      logger.error('[adminControls] unbanUser error:', error);
      return res.status(500).json({ error: 'Failed to unban user' });
    }
  }

  async function setUserBalance(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { tokenCredits } = (req.body ?? {}) as Partial<TAdminBalanceRequest>;
      if (!isNonNegativeNumber(tokenCredits)) {
        return res.status(400).json({ error: 'tokenCredits must be a non-negative number' });
      }
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      const { caller, user, userId } = resolved;
      const previous = await findBalanceByUser(userId);
      await upsertBalanceFields(userId, { tokenCredits });
      await emitAudit({
        action: 'user.balance_set',
        caller,
        target: userTarget(user),
        metadata: { previousTokenCredits: previous?.tokenCredits ?? null, tokenCredits },
        context: buildAuditContext(req),
      });
      return res.status(200).json(await loadUserControls(userId));
    } catch (error) {
      logger.error('[adminControls] setUserBalance error:', error);
      return res.status(500).json({ error: 'Failed to set balance' });
    }
  }

  return { getPause, setPause, getUserControls, banUser, unbanUser, setUserBalance };
}
