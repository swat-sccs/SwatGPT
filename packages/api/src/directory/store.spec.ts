import type { DirectoryEntry } from '@librechat/data-schemas';
import { getDirectoryIndex, resetDirectoryStore, warmDirectoryStore } from './store';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const jane: DirectoryEntry = {
  uid: 'jdoe1',
  firstName: 'Jane',
  lastName: 'Doe',
  gradYear: 2027,
  dorm: 'Willets',
  room: '214',
  dormHidden: false,
};

const MINUTE = 60 * 1000;

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  resetDirectoryStore();
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getDirectoryIndex', () => {
  it('caches a populated directory for the refresh interval', async () => {
    const load = jest.fn(async () => [jane]);
    expect(await getDirectoryIndex(load)).toBeDefined();
    jest.advanceTimersByTime(14 * MINUTE);
    expect(await getDirectoryIndex(load)).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries an empty directory after a minute instead of caching it for the full interval', async () => {
    const load = jest.fn(async () => [] as DirectoryEntry[]);
    expect(await getDirectoryIndex(load)).toBeUndefined();
    jest.advanceTimersByTime(30 * 1000);
    expect(await getDirectoryIndex(load)).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);

    load.mockResolvedValueOnce([jane]);
    jest.advanceTimersByTime(31 * 1000);
    await getDirectoryIndex(load);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(await getDirectoryIndex(load)).toBeDefined();
  });

  it('serves the first question without a directory when the first load is slow', async () => {
    let release: (entries: DirectoryEntry[]) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<DirectoryEntry[]>((resolve) => {
          release = resolve;
        }),
    );
    const first = getDirectoryIndex(load);
    jest.advanceTimersByTime(2000);
    expect(await first).toBeUndefined();

    release([jane]);
    await flush();
    expect(await getDirectoryIndex(load)).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('warmDirectoryStore', () => {
  it('preloads the directory so the first question is served from memory', async () => {
    const load = jest.fn(async () => [jane]);
    warmDirectoryStore(load);
    await flush();
    expect(await getDirectoryIndex(load)).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing once a load has started or completed', async () => {
    const load = jest.fn(async () => [jane]);
    warmDirectoryStore(load);
    warmDirectoryStore(load);
    await flush();
    warmDirectoryStore(load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
