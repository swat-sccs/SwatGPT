import { logger } from '@librechat/data-schemas';
import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryIndex } from './match';
import { buildIndex } from './match';

export type DirectoryLoader = () => Promise<DirectoryEntry[]>;

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const FIRST_LOAD_BUDGET_MS = 1500;

interface DirectoryState {
  index?: DirectoryIndex;
  loadedAt: number;
  loading?: Promise<DirectoryIndex | undefined>;
}

const state: DirectoryState = { loadedAt: 0 };

function refresh(load: DirectoryLoader): Promise<DirectoryIndex | undefined> {
  if (state.loading) {
    return state.loading;
  }
  state.loading = load()
    .then((entries) => {
      state.index = entries.length > 0 ? buildIndex(entries) : undefined;
      state.loadedAt = Date.now();
      logger.info(`[directory] loaded ${entries.length} directory entries`);
      return state.index;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[directory] failed to load directory; keeping previous index: ${message}`);
      state.loadedAt = Date.now() - REFRESH_MS + RETRY_MS;
      return state.index;
    })
    .finally(() => {
      state.loading = undefined;
    });
  return state.loading;
}

function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Returns the in-memory directory index, loading it on first use and
 * refreshing it in the background once it is older than `REFRESH_MS`. The
 * first load is bounded so a slow database never delays a chat message; the
 * load keeps running and serves the next request.
 */
export async function getDirectoryIndex(
  load: DirectoryLoader,
): Promise<DirectoryIndex | undefined> {
  const age = Date.now() - state.loadedAt;
  if (state.loadedAt > 0 && age < REFRESH_MS) {
    return state.index;
  }
  if (state.loadedAt > 0) {
    void refresh(load);
    return state.index;
  }
  return withinBudget(refresh(load), FIRST_LOAD_BUDGET_MS);
}

export function resetDirectoryStore(): void {
  state.index = undefined;
  state.loadedAt = 0;
  state.loading = undefined;
}
