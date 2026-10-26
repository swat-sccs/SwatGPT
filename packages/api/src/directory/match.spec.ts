import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryLookup } from './match';
import { buildIndex, runLookup } from './match';
import { detectIntent } from './intent';

const entries: DirectoryEntry[] = [
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
    uid: 'ajone1',
    firstName: 'Ada',
    lastName: 'Jones',
    gradYear: 2027,
    dorm: 'Willets',
    room: '101',
    dormHidden: false,
  },
  {
    uid: 'ksmit1',
    firstName: 'Kai',
    lastName: 'Smith',
    gradYear: 2028,
    dorm: 'Willets',
    room: '102',
    dormHidden: false,
  },
  {
    uid: 'lvand1',
    firstName: 'Lena',
    lastName: 'van der Berg',
    gradYear: 2029,
    dorm: 'Wharton',
    room: 'A110',
    dormHidden: false,
  },
];

const index = buildIndex(entries);

function uids(text: string): string[] | undefined {
  const intent = detectIntent(text);
  const lookup: DirectoryLookup | undefined = intent ? runLookup(intent, index) : undefined;
  return lookup?.kind === 'person' ? lookup.matches.map((entry) => entry.uid) : undefined;
}

describe('surname-only lookups', () => {
  it.each([
    ['where does Smith-Jones live', ['wsmit1']],
    ['where does smith jones live', ['wsmit1']],
    ['Where is Smith-Jones?', ['wsmit1']],
    ['where does van der Berg live', ['lvand1']],
    ['where does Van Der Berg live?', ['lvand1']],
  ])('resolves %j to the one student with that surname', (text, expected) => {
    expect(uids(text)).toEqual(expected);
  });

  it('does not pair two different surnames into a match', () => {
    const lookup = runLookup(
      { kind: 'person', span: 'jones berg', roommates: false, explicit: true },
      index,
    );
    expect(lookup).toMatchObject({ kind: 'person', total: 0 });
  });

  it('still prefers a full-name hit over a surname intersection', () => {
    expect(uids('where does Ada Jones live')).toEqual(['ajone1']);
    expect(uids('where does Kai Smith live')).toEqual(['ksmit1']);
  });
});

describe('hidden dorms', () => {
  const hidden: DirectoryEntry = {
    uid: 'hshy1',
    firstName: 'Hana',
    lastName: 'Shy',
    gradYear: 2027,
    dorm: 'Willets',
    room: '101',
    dormHidden: true,
  };
  const withHidden = buildIndex([...entries, hidden]);

  function run(text: string): DirectoryLookup | undefined {
    const intent = detectIntent(text);
    return intent ? runLookup(intent, withHidden) : undefined;
  }

  it('keeps a hidden entry out of the dorm and room indexes', () => {
    expect(withHidden.byDorm.get('willets')?.map((i) => withHidden.entries[i].uid)).toEqual([
      'ajone1',
      'ksmit1',
    ]);
    const room = run('who lives in Willets 101');
    expect(room?.kind === 'place' && room.residents.map((entry) => entry.uid)).toEqual(['ajone1']);
    const dorm = run('who lives in Willets');
    expect(dorm?.kind === 'place' && dorm.total).toBe(2);
  });

  it('never lists a hidden entry as a roommate, nor anyone as its roommate', () => {
    const theirs = run("who are Ada Jones's roommates");
    expect(theirs?.kind === 'person' && theirs.roommates).toEqual([]);
    const own = run("who are Hana Shy's roommates");
    expect(own?.kind === 'person' && own.roommates).toEqual([]);
  });

  it('still finds a hidden entry by name without a dorm', () => {
    const lookup = run('where does Hana Shy live');
    expect(lookup?.kind === 'person' && lookup.matches.map((entry) => entry.uid)).toEqual([
      'hshy1',
    ]);
  });
});
