import type { DirectoryEntry } from '@librechat/data-schemas';
import { resolveDirectoryContext } from './lookup';
import { resetDirectoryStore } from './store';

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

beforeEach(() => {
  resetDirectoryStore();
  load.mockClear();
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
});
