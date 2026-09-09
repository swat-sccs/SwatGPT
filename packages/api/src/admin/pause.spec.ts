import { Keyv } from 'keyv';
import { createPauseService, DEFAULT_PAUSE_MESSAGE, PAUSE_STATE_KEY } from './pause';

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
});
