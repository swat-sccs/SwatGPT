import type { TAdminPauseState } from 'librechat-data-provider';
import type { KeyValueStore } from './bans';

export type PauseStore = KeyValueStore;

export const DEFAULT_PAUSE_MESSAGE = 'SwatGPT is paused for maintenance. Please try again later.';

/** Namespaced key inside the shared `CONFIG_STORE` cache. */
export const PAUSE_STATE_KEY = 'controls:pause';

export interface PauseUpdate {
  paused: boolean;
  message?: string;
  updatedBy: string | null;
}

export interface PauseService {
  getState: () => Promise<TAdminPauseState>;
  setState: (update: PauseUpdate) => Promise<TAdminPauseState>;
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

/**
 * Global kill switch. State lives in the shared cache so every worker sees the
 * same answer; a missing entry means "running".
 */
export function createPauseService(store: PauseStore): PauseService {
  async function getState(): Promise<TAdminPauseState> {
    const value = await store.get(PAUSE_STATE_KEY);
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

  async function setState({ paused, message, updatedBy }: PauseUpdate): Promise<TAdminPauseState> {
    const state: TAdminPauseState = {
      paused,
      message: normalizeMessage(message),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    await store.set(PAUSE_STATE_KEY, state, 0);
    return state;
  }

  return { getState, setState };
}
