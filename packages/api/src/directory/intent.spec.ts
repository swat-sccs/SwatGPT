import type { DirectoryEntry } from '@librechat/data-schemas';
import type { DirectoryLookup } from './match';
import { buildIndex, runLookup } from './match';
import { detectIntent, MAX_QUESTION_LENGTH } from './intent';

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
    uid: 'mlang1',
    firstName: 'Maya',
    lastName: 'Lang',
    gradYear: 2028,
    dorm: 'Wharton',
    room: 'C210',
    dormHidden: false,
  },
];

const index = buildIndex(entries);

function lookup(text: string): DirectoryLookup | undefined {
  const intent = detectIntent(text);
  return intent ? runLookup(intent, index) : undefined;
}

describe('detectIntent', () => {
  it('ignores messages without housing vocabulary', () => {
    expect(detectIntent('How do I reset my password?')).toBeUndefined();
    expect(detectIntent('')).toBeUndefined();
    expect(detectIntent('Tell me about Jane Doe')).toBeUndefined();
  });

  it.each([
    ['Where does Jane Doe live?', 'jane doe'],
    ["where's Jane Doe living this year", 'jane doe'],
    ['What dorm is Jane Doe in?', 'jane doe'],
    ['Which building does jdoe1 live in', 'jdoe1'],
    ["what's jane doe's room number", 'jane doe'],
    ['dorm of Jane Doe', 'jane doe'],
    ['hey, where does Jane Doé live', 'jane doe'],
    ['Where does jdoe1@swarthmore.edu live?', 'jdoe1'],
    ['What dorm room is Jane in?', 'jane'],
    ['Which residence hall does Jane Doe live in', 'jane doe'],
    ['What hall does Lang live in?', 'lang'],
    ['Where is Jane Doe living?', 'jane doe'],
    ['Where is Jane rooming this year?', 'jane'],
  ])('extracts the person span from %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: false, explicit: true });
  });

  it.each([
    ['Where is Jane Doe?', 'jane doe'],
    ['where can I find Jane Doe', 'jane doe'],
    ['Where is Parrish Hall located?', 'parrish hall'],
    ['Where is Lang located?', 'lang'],
    ['What building is the registrar in?', 'registrar'],
    ['Which building is the registrar in?', 'registrar'],
    ['Which building is the chemistry final in', 'chemistry final'],
    ['What room is the CS colloquium in?', 'cs colloquium'],
    ['What hall is financial aid in?', 'financial aid'],
    ['What building is Lang in?', 'lang'],
    ['which building is the registrar', 'registrar'],
    ['What dorm is the registrar in?', 'registrar'],
    ['Where is Lang room 101?', 'lang room'],
    ['Where is the music room?', 'music room'],
  ])('treats %j as a loose person question', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: false, explicit: false });
  });

  it.each([
    ["Who are Jane Doe's roommates?", 'jane doe'],
    ['who lives with Jane Doe', 'jane doe'],
  ])('flags roommate questions like %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'person', span, roommates: true, explicit: true });
  });

  it.each([
    ['Who lives in Willets 214?', 'willets 214'],
    ["who's in Willets room 214", 'willets room 214'],
    ['who lives on the 3rd floor of Wharton', 'the 3rd floor of wharton'],
  ])('extracts the place span from %j', (text, span) => {
    expect(detectIntent(text)).toEqual({ kind: 'place', span });
  });

  it.each([
    'Where is Lang located?',
    'What building is Lang in?',
    'Where is Parrish Hall located?',
    'Which building is the registrar in?',
    'What building is the registrar in?',
    'What room is the CS colloquium in?',
    'What hall is financial aid in?',
    'Which building is the chemistry final in',
    'What dorm is the registrar in?',
    'Where is Lang room 101?',
  ])('produces no directory lookup for the place question %j', (text) => {
    expect(lookup(text)).toBeUndefined();
  });

  it.each([
    ['Where does Lang live?', 'mlang1'],
    ['What dorm is Jane Doe in?', 'jdoe1'],
    ['What room is Jane Doe in?', 'jdoe1'],
    ['Which building does jdoe1 live in', 'jdoe1'],
  ])('still resolves the person question %j', (text, uid) => {
    const result = lookup(text);
    expect(result?.kind).toBe('person');
    expect(result?.kind === 'person' && result.matches.map((entry) => entry.uid)).toEqual([uid]);
  });
});

describe('detectIntent on long messages', () => {
  function elapsedMs(run: () => void): number {
    const start = performance.now();
    run();
    return performance.now() - start;
  }

  it.each([
    ['where is a ', 20000],
    ['which room is x ', 15000],
    ["where's a ", 20000],
  ])('rejects %j repeated %d times without scanning it', (chunk, times) => {
    const text = chunk.repeat(times);
    let intent: ReturnType<typeof detectIntent>;
    const ms = elapsedMs(() => {
      intent = detectIntent(text);
    });
    expect(intent).toBeUndefined();
    expect(ms).toBeLessThan(50);
  });

  it('still answers a housing question at the length limit', () => {
    const question = 'Where does Jane Doe live?';
    const text = question.padStart(MAX_QUESTION_LENGTH, ' ');
    expect(text).toHaveLength(MAX_QUESTION_LENGTH);
    expect(detectIntent(text)).toEqual({
      kind: 'person',
      span: 'jane doe',
      roommates: false,
      explicit: true,
    });
  });

  it('ignores a housing question buried in a message over the limit', () => {
    const text = `${'x'.repeat(MAX_QUESTION_LENGTH)} Where does Jane Doe live?`;
    expect(detectIntent(text)).toBeUndefined();
  });

  it('stays fast on worst-case input just under the limit', () => {
    const chunk = 'where is a ';
    const text = chunk.repeat(Math.floor(MAX_QUESTION_LENGTH / chunk.length));
    expect(text.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH);
    expect(elapsedMs(() => detectIntent(text))).toBeLessThan(50);
  });
});
