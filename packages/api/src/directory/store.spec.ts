import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryIndex } from './match';
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

const roe: DirectoryEntry = {
  uid: 'JRoe1',
  firstName: 'John',
  lastName: 'Roe',
  gradYear: 2028,
  dorm: 'Willets',
  room: '214',
  dormHidden: false,
};

beforeEach(() => {
  resetDirectoryStore();
  delete process.env.DIRECTORY_OPTOUT_UIDS;
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DIRECTORY_OPTOUT_UIDS', () => {
  it('drops listed usernames before indexing, ignoring case and spacing', async () => {
    process.env.DIRECTORY_OPTOUT_UIDS = ' jroe1 ,nobody1,';
    const index = await getDirectoryIndex(jest.fn(async () => [jane, roe]));
    expect(index?.entries.map((entry) => entry.uid)).toEqual(['jdoe1']);
    expect(index?.byUid.has('jroe1')).toBe(false);
    expect(index?.byDorm.get('willets')).toEqual([0]);
  });

  it('yields no index when every entry is opted out', async () => {
    process.env.DIRECTORY_OPTOUT_UIDS = 'jdoe1';
    expect(await getDirectoryIndex(jest.fn(async () => [jane]))).toBeUndefined();
  });

  it('keeps every entry when the list is unset or empty', async () => {
    process.env.DIRECTORY_OPTOUT_UIDS = '';
    const index = await getDirectoryIndex(jest.fn(async () => [jane, roe]));
    expect(index?.entries).toHaveLength(2);
  });
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
    expect(await getDirectoryIndex(load)).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
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

describe('getDirectoryIndex after a successful load', () => {
  type Loader = jest.Mock<Promise<DirectoryEntry[]>, []>;

  async function staleLoad(): Promise<{ load: Loader; previous: DirectoryIndex }> {
    const load: Loader = jest.fn(async () => [jane]);
    const previous = await getDirectoryIndex(load);
    if (!previous) {
      throw new Error('expected the first load to build an index');
    }
    jest.advanceTimersByTime(16 * MINUTE);
    return { load, previous };
  }

  it('serves the previous index immediately while a stale refresh is in flight', async () => {
    const { load, previous } = await staleLoad();
    load.mockImplementationOnce(() => new Promise<DirectoryEntry[]>(() => undefined));

    expect(await getDirectoryIndex(load)).toBe(previous);
    expect(await getDirectoryIndex(load)).toBe(previous);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous index when a refresh fails and retries after a minute', async () => {
    const { load, previous } = await staleLoad();
    load.mockRejectedValueOnce(new Error('down'));
    expect(await getDirectoryIndex(load)).toBe(previous);
    await flush();

    jest.advanceTimersByTime(30 * 1000);
    expect(await getDirectoryIndex(load)).toBe(previous);
    expect(load).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(31 * 1000);
    expect(await getDirectoryIndex(load)).toBe(previous);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('drops the index when a refresh returns an empty directory (a deliberate purge)', async () => {
    const { load, previous } = await staleLoad();
    load.mockResolvedValueOnce([]);
    expect(await getDirectoryIndex(load)).toBe(previous);
    await flush();

    expect(await getDirectoryIndex(load)).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
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
