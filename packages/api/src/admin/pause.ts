import { Keyv } from 'keyv';
import { ErrorTypes } from 'librechat-data-provider';
import type { TAdminPauseState } from 'librechat-data-provider';
import type { KeyValueStore } from './bans';
import { keyvMongo } from '~/cache';

export type PauseStore = KeyValueStore;

export const DEFAULT_PAUSE_MESSAGE = 'SwatGPT is paused for maintenance. Please try again later.';

/** Key of the pause entry inside {@link PAUSE_NAMESPACE}. */
export const PAUSE_STATE_KEY = 'controls:pause';

/** Keyv namespace of the pause entry in the Mongo-backed `keyvMongo` store (`logs` collection). */
export const PAUSE_NAMESPACE = 'controls';

/** How long `checkPaused` may serve a cached read before asking Mongo again. */
export const PAUSE_READ_CACHE_MS = 5000;

/** 4xx so the chat client treats the rejection as definite and restores the user's turn. */
export const PAUSED_STATUS = 423;

/**
 * Body `checkPaused` sends. The chat client's error renderer (`Messages/Content/Error.tsx`)
 * shows `info` verbatim for `ErrorTypes.GOOGLE_ERROR`, the only existing type that
 * passes a server-written message through untouched; `error`/`message` keep the
 * original machine-readable shape for other consumers.
 */
export interface PausedErrorBody {
  type: ErrorTypes.GOOGLE_ERROR;
  info: string;
  error: 'paused';
  message: string;
}

export interface PauseUpdate {
  paused: boolean;
  message?: string;
  updatedBy: string | null;
}

export interface PauseService {
  getState: () => Promise<TAdminPauseState>;
  setState: (update: PauseUpdate) => Promise<TAdminPauseState>;
  /** Writes back a state previously returned by `getState`, unchanged (used for rollback). */
  restoreState: (state: TAdminPauseState) => Promise<TAdminPauseState>;
}

export interface PauseServiceOptions {
  /** Serve `getState` from memory for this long after a read or write; `0` disables. */
  readCacheMs?: number;
}

const RESUMED_STATE: TAdminPauseState = {
  paused: false,
  message: DEFAULT_PAUSE_MESSAGE,
  updatedAt: null,
  updatedBy: null,
};

function isPauseState(value: unknown): value is TAdminPauseState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TAdminPauseState).paused === 'boolean'
  );
}

function normalizeMessage(message: string | undefined): string {
  const trimmed = message?.trim();
  return trimmed ? trimmed : DEFAULT_PAUSE_MESSAGE;
}

function toState(value: unknown): TAdminPauseState {
  if (!isPauseState(value)) {
    return RESUMED_STATE;
  }
  return {
    paused: value.paused,
    message: normalizeMessage(value.message),
    updatedAt: value.updatedAt ?? null,
    updatedBy: value.updatedBy ?? null,
  };
}

/**
 * Global kill switch. A missing entry means "running". With a persistent store
 * (see {@link getPauseService}) a pause survives restarts and deploys.
 */
export function createPauseService(
  store: PauseStore,
  { readCacheMs = 0 }: PauseServiceOptions = {},
): PauseService {
  let cached: { state: TAdminPauseState; until: number } | null = null;

  function remember(state: TAdminPauseState): TAdminPauseState {
    cached = readCacheMs > 0 ? { state, until: Date.now() + readCacheMs } : null;
    return state;
  }

  async function getState(): Promise<TAdminPauseState> {
    if (cached && Date.now() < cached.until) {
      return cached.state;
    }
    return remember(toState(await store.get(PAUSE_STATE_KEY)));
  }

  async function restoreState(state: TAdminPauseState): Promise<TAdminPauseState> {
    const written = await store.set(PAUSE_STATE_KEY, state, 0);
    if (written === false) {
      throw new Error('Failed to persist the pause state');
    }
    return remember(state);
  }

  function setState({ paused, message, updatedBy }: PauseUpdate): Promise<TAdminPauseState> {
    return restoreState({
      paused,
      message: normalizeMessage(message),
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
  }

  return { getState, setState, restoreState };
}

let sharedPauseService: PauseService | undefined;

/**
 * Process-wide pause service over the Mongo-backed `keyvMongo` store, shared by the
 * admin controls route and `checkPaused` so a pause applies to this process immediately
 * and to other processes within {@link PAUSE_READ_CACHE_MS}. Store errors are thrown
 * rather than swallowed by Keyv, so an unreadable store is logged by `checkPaused`
 * (which then fails open) instead of silently reading as "running".
 */
export function getPauseService(): PauseService {
  sharedPauseService ??= createPauseService(
    new Keyv({ store: keyvMongo, namespace: PAUSE_NAMESPACE, ttl: 0, throwOnErrors: true }),
    { readCacheMs: PAUSE_READ_CACHE_MS },
  );
  return sharedPauseService;
}

export function toPausedError(state: TAdminPauseState): PausedErrorBody {
  return {
    type: ErrorTypes.GOOGLE_ERROR,
    info: state.message,
    error: 'paused',
    message: state.message,
  };
}
