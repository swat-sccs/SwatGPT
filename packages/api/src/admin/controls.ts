import { REFILL_INTERVAL_UNITS } from 'librechat-data-provider';
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
  RefillIntervalUnit,
  TAdminPauseState,
  TAdminUserControls,
  TAdminPauseRequest,
  TAdminBalanceRequest,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { BanService, BanSnapshot } from './bans';
import type { PauseService } from './pause';
import { MAX_BAN_DURATION_MS, isValidBanDuration, toBanRecord } from './bans';
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
  /**
   * Whether `checkBan` enforces bans at all (it skips every check unless
   * `BAN_VIOLATIONS` is on). Defaults to `true`; reported to the admin UI so a
   * ban that will not be enforced is not shown as effective.
   */
  banEnforced?: boolean;
  /**
   * Whether balance enforcement (`getBalanceConfig(appConfig).enabled`) applies to
   * this user. Defaults to `true`; when `false`, setting token credits is refused.
   */
  isBalanceEnabled?: (user: IUser) => Promise<boolean>;
}

export type AdminUserControls = TAdminUserControls;

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
export const MAX_PAUSE_RESUME_MS = 7 * 24 * 60 * 60 * 1000;
const TARGET_USER_FIELDS = '_id name username email role tenantId';
export const BALANCE_DISABLED_ERROR =
  'Balance is not enabled on this server, so token credits are not enforced';

/** A step after the state change failed; `undone` says whether the change was rolled back. */
class RolledBackError extends Error {
  constructor(readonly undone: boolean) {
    super(undone ? 'change rolled back' : 'rollback failed');
  }
}

function failureResponse(res: Response, error: unknown, failure: string): Response {
  if (!(error instanceof RolledBackError)) {
    return res.status(500).json({ error: failure });
  }
  const suffix = error.undone
    ? 'the change was rolled back'
    : 'the change could not be rolled back and may still be in effect';
  return res.status(500).json({ error: `${failure}; ${suffix}` });
}

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

function isTokenCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRefillUnit(value: unknown): value is RefillIntervalUnit {
  return typeof value === 'string' && (REFILL_INTERVAL_UNITS as readonly string[]).includes(value);
}

type BalanceBody = { fields: IBalanceUpdate; error?: undefined } | { error: string };

const REFILL_FIELDS = ['refillAmount', 'refillIntervalValue', 'refillIntervalUnit'] as const;

/** Validates the credits and, when any refill setting is sent, the whole refill schedule. */
function parseBalanceBody(body: Partial<TAdminBalanceRequest> | undefined): BalanceBody {
  const { tokenCredits, autoRefillEnabled, refillAmount, refillIntervalValue, refillIntervalUnit } =
    body ?? {};
  if (!isTokenCredits(tokenCredits)) {
    return { error: 'tokenCredits must be a non-negative safe integer' };
  }
  const touchesRefill = REFILL_FIELDS.some((field) => body?.[field] !== undefined);
  if (autoRefillEnabled === undefined && !touchesRefill) {
    return { fields: { tokenCredits } };
  }
  if (typeof autoRefillEnabled !== 'boolean') {
    return { error: 'autoRefillEnabled must be a boolean when refill settings are sent' };
  }
  if (!autoRefillEnabled) {
    return { fields: { tokenCredits, autoRefillEnabled: false } };
  }
  if (!isPositiveInteger(refillAmount)) {
    return { error: 'refillAmount must be a positive safe integer' };
  }
  if (!isPositiveInteger(refillIntervalValue)) {
    return { error: 'refillIntervalValue must be a positive safe integer' };
  }
  if (!isRefillUnit(refillIntervalUnit)) {
    return { error: `refillIntervalUnit must be one of: ${REFILL_INTERVAL_UNITS.join(', ')}` };
  }
  return {
    fields: {
      tokenCredits,
      autoRefillEnabled: true,
      refillAmount,
      refillIntervalValue,
      refillIntervalUnit,
    },
  };
}

/** The same keys the request wrote, taken from the earlier record, so a rollback is exact. */
function previousBalanceFields(previous: IBalance, written: IBalanceUpdate): IBalanceUpdate {
  const restored: IBalanceUpdate = { tokenCredits: previous.tokenCredits ?? 0 };
  if (written.autoRefillEnabled === undefined) {
    return restored;
  }
  restored.autoRefillEnabled = previous.autoRefillEnabled ?? false;
  for (const field of REFILL_FIELDS) {
    if (written[field] !== undefined && previous[field] != null) {
      Object.assign(restored, { [field]: previous[field] });
    }
  }
  return restored;
}

function balanceAuditMetadata(previous: IBalance | null, written: IBalanceUpdate): AuditMetadata {
  const metadata: AuditMetadata = {
    previousTokenCredits: previous?.tokenCredits ?? null,
    tokenCredits: written.tokenCredits ?? null,
  };
  if (written.autoRefillEnabled === undefined) {
    return metadata;
  }
  metadata.previousAutoRefillEnabled = previous?.autoRefillEnabled ?? null;
  metadata.autoRefillEnabled = written.autoRefillEnabled;
  for (const field of REFILL_FIELDS) {
    const previousKey = `previous${field[0].toUpperCase()}${field.slice(1)}`;
    metadata[previousKey] = previous?.[field] ?? null;
    metadata[field] = written[field] ?? null;
  }
  return metadata;
}

function validateBanBody(body: TAdminBanRequest | undefined): string | null {
  const { durationMs, reason } = body ?? {};
  if (durationMs !== undefined && !isNonNegativeNumber(durationMs)) {
    return 'durationMs must be a non-negative number of milliseconds';
  }
  if (durationMs !== undefined && !isValidBanDuration(durationMs)) {
    return `durationMs must be at most ${MAX_BAN_DURATION_MS} (10 years); use 0 for a permanent ban`;
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return 'reason must be a string';
  }
  if (reason !== undefined && reason.length > MAX_REASON_LENGTH) {
    return `reason must be at most ${MAX_REASON_LENGTH} characters`;
  }
  return null;
}

function validateResumeAt(paused: boolean, resumeAt: unknown): string | null {
  if (resumeAt === undefined) {
    return null;
  }
  if (!paused) {
    return 'resumeAt can only be set when pausing';
  }
  const at = typeof resumeAt === 'string' ? Date.parse(resumeAt) : Number.NaN;
  if (Number.isNaN(at)) {
    return 'resumeAt must be an ISO-8601 date';
  }
  const now = Date.now();
  if (at <= now) {
    return 'resumeAt must be in the future';
  }
  if (at - now > MAX_PAUSE_RESUME_MS) {
    return 'resumeAt must be at most 7 days from now';
  }
  return null;
}

function validatePauseBody(body: TAdminPauseRequest | undefined): string | null {
  const { paused, message, resumeAt } = body ?? {};
  if (typeof paused !== 'boolean') {
    return 'paused must be a boolean';
  }
  if (message !== undefined && typeof message !== 'string') {
    return 'message must be a string';
  }
  if (message !== undefined && message.length > MAX_PAUSE_MESSAGE_LENGTH) {
    return `message must be at most ${MAX_PAUSE_MESSAGE_LENGTH} characters`;
  }
  return validateResumeAt(paused, resumeAt);
}

/** A pause changes when it starts, stops, or its message or scheduled resume moves. */
function pauseChanged(previous: TAdminPauseState, next: TAdminPauseState): boolean {
  if (previous.paused !== next.paused) {
    return true;
  }
  return (
    next.paused &&
    (previous.message !== next.message || (previous.resumeAt ?? null) !== (next.resumeAt ?? null))
  );
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
    banEnforced = true,
    isBalanceEnabled,
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

  /**
   * Runs `steps` after a state change has been persisted. If any step throws
   * (a fail-closed audit write, session revocation), `undo` puts the previous
   * state back so a 5xx never leaves an unaudited change in effect.
   */
  async function completeOrUndo(
    label: string,
    steps: () => Promise<void>,
    undo: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await steps();
    } catch (error) {
      logger.error(`[adminControls] ${label} failed after the change was applied`, error);
      const undone = await undo().then(
        () => true,
        (undoError: unknown) => {
          logger.error(`[adminControls] ${label} rollback failed`, undoError);
          return false;
        },
      );
      throw new RolledBackError(undone);
    }
  }

  async function balanceEnabledFor(user: IUser): Promise<boolean> {
    return isBalanceEnabled ? isBalanceEnabled(user) : true;
  }

  async function loadUserControls(user: IUser, userId: string): Promise<AdminUserControls> {
    const [ban, balance, balanceEnabled] = await Promise.all([
      banService.getBan(userId),
      findBalanceByUser(userId),
      balanceEnabledFor(user),
    ]);
    return {
      userId,
      banned: ban !== null,
      banExpiresAt: ban?.expiresAt ?? null,
      balance: toAdminBalance(balance),
      banEnforced,
      balanceEnabled,
    };
  }

  async function undoBan(userId: string, prior: BanSnapshot): Promise<void> {
    await banService.restore(userId, prior);
    await invalidateAuthUserCache?.(userId);
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
    const user = await getUserById(id, TARGET_USER_FIELDS);
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
      const { paused, message, resumeAt } = req.body as TAdminPauseRequest;
      const previous = await pauseService.getState();
      const state: TAdminPauseState = await pauseService.setState({
        paused,
        message,
        updatedBy: caller.userId,
        resumeAt: resumeAt ? new Date(resumeAt).toISOString() : null,
      });
      if (pauseChanged(previous, state)) {
        await completeOrUndo(
          'setPause audit',
          () =>
            emitAudit({
              action: state.paused ? 'system.paused' : 'system.resumed',
              caller,
              target: PAUSE_TARGET,
              metadata: { message: state.message, resumeAt: state.resumeAt ?? null },
              context: buildAuditContext(req),
            }),
          () => pauseService.restoreState(previous),
        );
      }
      return res.status(200).json(state);
    } catch (error) {
      logger.error('[adminControls] setPause error:', error);
      return failureResponse(res, error, 'Failed to update pause state');
    }
  }

  async function getUserControls(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      return res.status(200).json(await loadUserControls(resolved.user, resolved.userId));
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
      const prior = await banService.snapshot(userId);
      const record = await banService.ban(userId, { durationMs, reason: trimmedReason });
      await completeOrUndo(
        'banUser session revocation/audit',
        async () => {
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
        },
        () => undoBan(userId, prior),
      );
      if (!banEnforced) {
        logger.warn(
          `[adminControls] Banned user ${userId}, but BAN_VIOLATIONS is off so checkBan will not enforce it`,
        );
      }
      return res.status(200).json(await loadUserControls(user, userId));
    } catch (error) {
      logger.error('[adminControls] banUser error:', error);
      return failureResponse(res, error, 'Failed to ban user');
    }
  }

  async function unbanUser(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      const { caller, user, userId } = resolved;
      const prior = await banService.snapshot(userId);
      await banService.unban(userId);
      await completeOrUndo(
        'unbanUser audit',
        async () => {
          await invalidateAuthUserCache?.(userId);
          if (!prior.entry) {
            return;
          }
          const existing = toBanRecord(userId, prior.entry);
          await emitAudit({
            action: 'user.unbanned',
            caller,
            target: userTarget(user),
            metadata: {
              reason: existing.reason,
              expiresAt: existing.expiresAt,
              ip: existing.ip,
            },
            context: buildAuditContext(req),
          });
        },
        () => undoBan(userId, prior),
      );
      return res.status(200).json(await loadUserControls(user, userId));
    } catch (error) {
      logger.error('[adminControls] unbanUser error:', error);
      return failureResponse(res, error, 'Failed to unban user');
    }
  }

  async function setUserBalance(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const parsed = parseBalanceBody(req.body as Partial<TAdminBalanceRequest> | undefined);
      if (parsed.error !== undefined) {
        return res.status(400).json({ error: parsed.error });
      }
      const { fields } = parsed;
      const resolved = await resolveTargetUser(req, res);
      if (!resolved) {
        return res;
      }
      const { caller, user, userId } = resolved;
      if (!(await balanceEnabledFor(user))) {
        return res.status(409).json({ error: BALANCE_DISABLED_ERROR });
      }
      const previous = await findBalanceByUser(userId);
      await upsertBalanceFields(userId, fields);
      await completeOrUndo(
        'setUserBalance audit',
        () =>
          emitAudit({
            action: 'user.balance_set',
            caller,
            target: userTarget(user),
            metadata: balanceAuditMetadata(previous, fields),
            context: buildAuditContext(req),
          }),
        () =>
          previous
            ? upsertBalanceFields(userId, previousBalanceFields(previous, fields))
            : Promise.reject(new Error('no earlier balance record to restore')),
      );
      return res.status(200).json(await loadUserControls(user, userId));
    } catch (error) {
      logger.error('[adminControls] setUserBalance error:', error);
      return failureResponse(res, error, 'Failed to set balance');
    }
  }

  return { getPause, setPause, getUserControls, banUser, unbanUser, setUserBalance };
}
