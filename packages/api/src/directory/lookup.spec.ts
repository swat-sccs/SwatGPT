import { logger } from '@librechat/data-schemas';
import type { DirectoryEntry } from '@librechat/data-schemas';
import { resolveDirectoryContext } from './lookup';
import { resetDirectoryStore } from './store';
import { MAX_RESIDENTS } from './match';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const entries: DirectoryEntry[] = [
  {
    uid: 'jdoe1',
    firstName: 'Jane',
    lastName: 'Doe',
    gradYear: 2027,
    dorm: 'Willets',
    room: '214',
    dormHidden: false,
  },
  {
    uid: 'jroe1',
    firstName: 'John',
    lastName: 'Roe',
    gradYear: 2028,
    dorm: 'Willets',
    room: '214',
    dormHidden: false,
  },
  {
    uid: 'wsmit1',
    firstName: 'William',
    lastName: 'Smith-Jones',
    gradYear: 2026,
    dorm: 'Mary Lyon',
    room: '012',
    dormHidden: false,
  },
  {
    uid: 'ahall1',
    firstName: 'Alex',
    lastName: 'Hall',
    gradYear: 2029,
    dorm: 'Wharton',
    room: 'C301',
    dormHidden: false,
  },
  {
    uid: 'apark1',
    firstName: 'Alex',
    lastName: 'Park',
    gradYear: 2029,
    dorm: 'Wharton',
    room: 'C302',
    dormHidden: false,
  },
  { uid: 'mnune1', firstName: 'María', lastName: 'Núñez', gradYear: 2027, dormHidden: true },
];

const load = jest.fn(async () => entries);

function resident(n: number, room: string): DirectoryEntry {
  return {
    uid: `dana${n}`,
    firstName: `Resident${n}`,
    lastName: `Dana${n}`,
    gradYear: 2027,
    dorm: 'Dana',
    room,
    dormHidden: false,
  };
}

const crowded: DirectoryEntry[] = [
  ...Array.from({ length: MAX_RESIDENTS + 4 }, (_, i) => resident(i, '101')),
  ...Array.from({ length: MAX_RESIDENTS + 6 }, (_, i) => resident(100 + i, `1${10 + i}`)),
];
const loadCrowded = jest.fn(async () => crowded);

function listed(context: string | undefined): number {
  return (context ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
}

const info = logger.info as jest.Mock;

beforeEach(() => {
  resetDirectoryStore();
  load.mockClear();
  info.mockClear();
  delete process.env.DIRECTORY_LOOKUP_ENABLED;
});

describe('resolveDirectoryContext', () => {
  it('returns nothing for unrelated messages without touching the loader', async () => {
    expect(await resolveDirectoryContext('How do I connect to Wi-Fi?', load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('answers a full-name question with dorm and room', async () => {
    const context = await resolveDirectoryContext('Where does Jane Doe live?', load);
    expect(context).toContain('# Swarthmore student directory lookup');
    expect(context).toContain("- Jane Doe '27 (jdoe1): Willets 214");
    expect(context).not.toContain('John Roe');
  });

  it('loads the directory once and serves later questions from memory', async () => {
    await resolveDirectoryContext('Where does Jane Doe live?', load);
    await resolveDirectoryContext("what's jdoe1's room", load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('matches usernames, nicknames, hyphenated and accented names', async () => {
    expect(await resolveDirectoryContext('where does jdoe1 live', load)).toContain('Jane Doe');
    expect(await resolveDirectoryContext('where does Bill Smith live', load)).toContain(
      'William Smith-Jones',
    );
    expect(await resolveDirectoryContext('where does Maria Nunez live', load)).toContain(
      'María Núñez',
    );
  });

  it('reports a hidden dorm without revealing it', async () => {
    const context = await resolveDirectoryContext('Where does María Núñez live?', load);
    expect(context).toContain('dorm not shared');
    expect(context).not.toMatch(/Núñez.*Willets/);
  });

  it('lists every match for an ambiguous first name', async () => {
    const context = await resolveDirectoryContext('where does Alex live', load);
    expect(context).toContain('2 students match "alex"');
    expect(context).toContain('Alex Hall');
    expect(context).toContain('Alex Park');
  });

  it('reports an explicit miss so the model does not guess', async () => {
    const context = await resolveDirectoryContext('Where does Taylor Swift live?', load);
    expect(context).toContain('No student directory entry matches "taylor swift"');
  });

  it('stays silent on loose phrasing that names a building, not a person', async () => {
    expect(await resolveDirectoryContext('Where is Parrish Hall?', load)).toBeUndefined();
    expect(await resolveDirectoryContext('Where is Jane Doe?', load)).toContain('Willets 214');
  });

  it('finds roommates', async () => {
    const context = await resolveDirectoryContext("who are Jane Doe's roommates", load);
    expect(context).toContain('Roommates:');
    expect(context).toContain("- John Roe '28 (jroe1): Willets 214");
  });

  it('answers reverse lookups by room, floor, and dorm', async () => {
    const room = await resolveDirectoryContext('Who lives in Willets 214?', load);
    expect(room).toContain('Residents of Willets 214:');
    expect(room).toContain('Jane Doe');
    expect(room).toContain('John Roe');

    const shorthand = await resolveDirectoryContext('who lives in ML 12', load);
    expect(shorthand).toContain('Residents of Mary Lyon 12:');
    expect(shorthand).toContain('William Smith-Jones');

    const floor = await resolveDirectoryContext('who lives on the 3rd floor of Wharton', load);
    expect(floor).toContain('Residents on floor 3 of Wharton');
    expect(floor).toContain('Alex Hall');

    const dorm = await resolveDirectoryContext('who lives in Wharton', load);
    expect(dorm).toContain('Wharton has 2 listed residents');
  });

  it('fails open when the loader throws', async () => {
    const failing = jest.fn(async () => {
      throw new Error('mongo down');
    });
    expect(await resolveDirectoryContext('Where does Jane Doe live?', failing)).toBeUndefined();
  });

  it('stays silent when the directory is empty', async () => {
    const empty = jest.fn(async () => []);
    expect(await resolveDirectoryContext('Where does Jane Doe live?', empty)).toBeUndefined();
  });

  it('can be disabled by environment', async () => {
    process.env.DIRECTORY_LOOKUP_ENABLED = 'false';
    expect(await resolveDirectoryContext('Where does Jane Doe live?', load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the resident cap small', () => {
    expect(MAX_RESIDENTS).toBeLessThanOrEqual(10);
  });

  it('caps room, floor, and roommate listings and says how many were withheld', async () => {
    const room = await resolveDirectoryContext('who lives in Dana 101', loadCrowded);
    expect(listed(room)).toBe(MAX_RESIDENTS);
    expect(room).toContain(`showing ${MAX_RESIDENTS} of ${MAX_RESIDENTS + 4}`);

    const floor = await resolveDirectoryContext('who lives on the 1st floor of Dana', loadCrowded);
    expect(listed(floor)).toBe(MAX_RESIDENTS);
    expect(floor).toContain(`showing ${MAX_RESIDENTS} of ${2 * MAX_RESIDENTS + 10}`);

    const roommates = await resolveDirectoryContext("who are dana0's roommates", loadCrowded);
    expect(listed(roommates)).toBe(1 + MAX_RESIDENTS);
    expect(roommates).toContain(`Roommates (showing ${MAX_RESIDENTS} of ${MAX_RESIDENTS + 3}`);
  });

  it('audits each reverse lookup with the requester and counts but no student data', async () => {
    const requester = { userId: 'user-123' };
    await resolveDirectoryContext('who lives in Dana 101', loadCrowded, requester);
    await resolveDirectoryContext('who lives on the 1st floor of Dana', loadCrowded, requester);
    await resolveDirectoryContext('who lives in Dana', loadCrowded, requester);
    await resolveDirectoryContext("who are dana0's roommates", loadCrowded, requester);
    await resolveDirectoryContext('where does dana0 live', loadCrowded, requester);

    const audits = info.mock.calls.filter(([message]) => message === '[directory] reverse lookup');
    expect(audits.map(([, meta]) => meta)).toEqual([
      { userId: 'user-123', kind: 'room', total: MAX_RESIDENTS + 4, returned: MAX_RESIDENTS },
      {
        userId: 'user-123',
        kind: 'floor',
        total: 2 * MAX_RESIDENTS + 10,
        returned: MAX_RESIDENTS,
      },
      { userId: 'user-123', kind: 'dorm', total: 2 * MAX_RESIDENTS + 10, returned: 0 },
      { userId: 'user-123', kind: 'roommates', total: MAX_RESIDENTS + 3, returned: MAX_RESIDENTS },
    ]);
    expect(JSON.stringify(audits)).not.toMatch(/dana\d|Resident|Dana 1/);
  });

  it('audits reverse lookups without a requester as unknown', async () => {
    await resolveDirectoryContext('Who lives in Willets 214?', load);
    expect(info).toHaveBeenCalledWith('[directory] reverse lookup', {
      userId: 'unknown',
      kind: 'room',
      total: 2,
      returned: 2,
    });
  });
});
