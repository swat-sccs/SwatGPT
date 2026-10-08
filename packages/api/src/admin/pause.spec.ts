import { Keyv } from 'keyv';
import { ErrorTypes } from 'librechat-data-provider';
import {
  PAUSED_STATUS,
  toPausedError,
  PAUSE_STATE_KEY,
  createPauseService,
  DEFAULT_PAUSE_MESSAGE,
} from './pause';

const NOW = new Date('2026-09-09T12:00:00.000Z');

describe('createPauseService', () => {
  let store: Keyv;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    store = new Keyv({ namespace: 'CONFIG_STORE' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports a running system when nothing is stored', async () => {
    const service = createPauseService(store);

    await expect(service.getState()).resolves.toEqual({
      paused: false,
      message: DEFAULT_PAUSE_MESSAGE,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('persists a pause under the namespaced key with a trimmed message', async () => {
    const service = createPauseService(store);

    const state = await service.setState({
      paused: true,
      message: '  Back at 3pm.  ',
      updatedBy: 'admin-1',
    });

    const expected = {
      paused: true,
      message: 'Back at 3pm.',
      updatedAt: NOW.toISOString(),
      updatedBy: 'admin-1',
    };
    expect(state).toEqual(expected);
    await expect(store.get(PAUSE_STATE_KEY)).resolves.toEqual(expected);
    await expect(service.getState()).resolves.toEqual(expected);
  });

  it('falls back to the default message when none is given or it is blank', async () => {
    const service = createPauseService(store);

    await service.setState({ paused: true, message: '   ', updatedBy: 'admin-1' });
    await expect(service.getState()).resolves.toMatchObject({ message: DEFAULT_PAUSE_MESSAGE });

    await service.setState({ paused: true, updatedBy: 'admin-1' });
    await expect(service.getState()).resolves.toMatchObject({ message: DEFAULT_PAUSE_MESSAGE });
  });

  it('records who resumed the system', async () => {
    const service = createPauseService(store);
    await service.setState({ paused: true, message: 'Down', updatedBy: 'admin-1' });

    jest.setSystemTime(new Date('2026-09-09T13:00:00.000Z'));
    const state = await service.setState({ paused: false, updatedBy: 'admin-2' });

    expect(state).toEqual({
      paused: false,
      message: DEFAULT_PAUSE_MESSAGE,
      updatedAt: '2026-09-09T13:00:00.000Z',
      updatedBy: 'admin-2',
    });
  });

  it('ignores a corrupted stored value', async () => {
    const service = createPauseService(store);
    await store.set(PAUSE_STATE_KEY, { paused: 'yes' });

    await expect(service.getState()).resolves.toMatchObject({ paused: false });
  });

  it('restores a previous state exactly, timestamps included', async () => {
    const service = createPauseService(store);
    const previous = await service.setState({ paused: true, message: 'Down', updatedBy: 'a' });

    jest.setSystemTime(new Date('2026-09-09T13:00:00.000Z'));
    await service.setState({ paused: false, updatedBy: 'b' });
    await service.restoreState(previous);

    await expect(service.getState()).resolves.toEqual(previous);
  });

  it('throws when the store reports the write did not land', async () => {
    const service = createPauseService({
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(false),
      delete: jest.fn(),
    });

    await expect(service.setState({ paused: true, updatedBy: 'admin-1' })).rejects.toThrow(
      'Failed to persist the pause state',
    );
  });

  describe('read cache', () => {
    it('serves reads from memory until it expires', async () => {
      const service = createPauseService(store, { readCacheMs: 5000 });
      await expect(service.getState()).resolves.toMatchObject({ paused: false });

      await store.set(PAUSE_STATE_KEY, { paused: true, message: 'elsewhere' });
      await expect(service.getState()).resolves.toMatchObject({ paused: false });

      jest.advanceTimersByTime(5001);
      await expect(service.getState()).resolves.toMatchObject({ paused: true });
    });

    it('applies its own writes immediately', async () => {
      const service = createPauseService(store, { readCacheMs: 5000 });
      await service.getState();

      await service.setState({ paused: true, updatedBy: 'admin-1' });

      await expect(service.getState()).resolves.toMatchObject({ paused: true });
    });

    it('does not cache a failed read', async () => {
      const get = jest.fn().mockRejectedValueOnce(new Error('mongo down'));
      const flaky = { get, set: jest.fn(), delete: jest.fn() };
      const service = createPauseService(flaky, { readCacheMs: 5000 });

      await expect(service.getState()).rejects.toThrow('mongo down');
      get.mockResolvedValueOnce({ paused: true, message: 'Down' });
      await expect(service.getState()).resolves.toMatchObject({ paused: true });
    });
  });

  it('builds a 4xx error body the chat client renders as the plain admin message', () => {
    const body = toPausedError({
      paused: true,
      message: 'Back at 3pm.',
      updatedAt: null,
      updatedBy: null,
    });

    expect(PAUSED_STATUS).toBeGreaterThanOrEqual(400);
    expect(PAUSED_STATUS).toBeLessThan(500);
    expect(body).toEqual({
      type: ErrorTypes.GOOGLE_ERROR,
      info: 'Back at 3pm.',
      error: 'paused',
      message: 'Back at 3pm.',
    });
  });
});
