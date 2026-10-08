import type { KbQueryMessage } from './query';
import { buildKbQueries, capQuery, resolveRetrievalQueries } from './query';

const user = (text: string): KbQueryMessage => ({ text, isCreatedByUser: true });
const assistant = (text: string): KbQueryMessage => ({ text, isCreatedByUser: false });

describe('buildKbQueries', () => {
  it('uses the message unchanged on the first turn', () => {
    expect(buildKbQueries([user('  When is Sharples open?  ')])).toEqual({
      userText: 'When is Sharples open?',
      retrievalQuery: 'When is Sharples open?',
    });
  });

  it('prefixes a short follow-up with the previous user turn, not the assistant reply', () => {
    const messages = [
      user('When is Sharples open?'),
      assistant('Sharples Dining Hall is open from 7:30am to 8pm on weekdays.'),
      user('What about on weekends?'),
    ];
    expect(buildKbQueries(messages)).toEqual({
      userText: 'What about on weekends?',
      retrievalQuery: 'When is Sharples open?\nWhat about on weekends?',
    });
  });

  it('keeps a long self-contained follow-up unchanged', () => {
    const followUp =
      'How do I connect my Windows laptop to the eduroam wireless network on campus this semester?';
    const messages = [user('When is Sharples open?'), assistant('7:30am to 8pm.'), user(followUp)];
    expect(buildKbQueries(messages)).toEqual({ userText: followUp, retrievalQuery: followUp });
  });

  it('bounds the carried-over context to the tail of the previous user turn', () => {
    const previous = `${'filler '.repeat(100)}McCabe Library hours`;
    const { retrievalQuery } = buildKbQueries([
      user(previous),
      assistant('...'),
      user('and Sundays?'),
    ]);
    const [context, current] = retrievalQuery.split('\n');
    expect(current).toBe('and Sundays?');
    expect(context.length).toBeLessThanOrEqual(300);
    expect(context.endsWith('McCabe Library hours')).toBe(true);
  });

  it('anchors on the last user turn when continuing an assistant message', () => {
    const messages = [
      user(
        'Tell me about the Swarthmore honors program in detail please, including the external examiners',
      ),
      assistant('The Honors Program is a distinctive feature of Swarthmore that'),
    ];
    const question = messages[0].text;
    expect(buildKbQueries(messages)).toEqual({ userText: question, retrievalQuery: question });
  });

  it('keeps continuation queries on user text when the branch has earlier turns', () => {
    const messages = [
      user('Where is Kohlberg?'),
      assistant('Kohlberg Hall is on the main quad.'),
      user('hours?'),
      assistant('Kohlberg is open from'),
    ];
    expect(buildKbQueries(messages)).toEqual({
      userText: 'hours?',
      retrievalQuery: 'Where is Kohlberg?\nhours?',
    });
  });

  it('skips a blank previous user turn', () => {
    expect(buildKbQueries([user('   '), assistant('Hi!'), user('library hours')])).toEqual({
      userText: 'library hours',
      retrievalQuery: 'library hours',
    });
  });

  it('returns empty queries when there is no user message', () => {
    expect(buildKbQueries([])).toEqual({ userText: '', retrievalQuery: '' });
    expect(buildKbQueries([assistant('Welcome to SwatGPT')])).toEqual({
      userText: '',
      retrievalQuery: '',
    });
  });
});

describe('capQuery', () => {
  it('returns short queries trimmed and otherwise unchanged', () => {
    expect(capQuery('  When is Sharples open?  ')).toBe('When is Sharples open?');
    expect(capQuery('x'.repeat(1000))).toHaveLength(1000);
  });

  it('keeps the tail of a long paste, starting on a word boundary', () => {
    const question = 'Does this essay meet the W requirement?';
    const capped = capQuery(`${'lorem ipsum dolor '.repeat(200)}\n${question}`);
    expect(capped.length).toBeLessThanOrEqual(1000);
    expect(capped.length).toBeGreaterThan(950);
    expect(capped.endsWith(question)).toBe(true);
    expect(capped).toMatch(/^(lorem|ipsum|dolor) /);
  });

  it('does not drop a whole word when the cut lands exactly on a boundary', () => {
    const words = `${'a'.repeat(999)} ${'b'.repeat(999)}`;
    expect(capQuery(words)).toBe('b'.repeat(999));
    const exact = `${'a'.repeat(500)} ${'b'.repeat(500)} ${'c'.repeat(499)}`;
    expect(capQuery(exact)).toBe(`${'b'.repeat(500)} ${'c'.repeat(499)}`);
  });

  it('hard-cuts long unbroken runs instead of discarding them', () => {
    const run = 'https://example.edu/'.repeat(100);
    expect(capQuery(run)).toBe(run.slice(-1000));
  });
});

describe('resolveRetrievalQueries', () => {
  it('searches and reranks with a bare query alone', () => {
    expect(resolveRetrievalQueries('  eduroam  ')).toEqual({
      search: ['eduroam'],
      rerank: 'eduroam',
    });
  });

  it('runs one search when the query was not combined with a previous turn', () => {
    const queries = buildKbQueries([user('When is Sharples open?')]);
    expect(resolveRetrievalQueries(queries)).toEqual({
      search: ['When is Sharples open?'],
      rerank: 'When is Sharples open?',
    });
  });

  it('searches with the current turn and the combined follow-up, reranking with the combined one', () => {
    const queries = buildKbQueries([
      user('When is Sharples open?'),
      assistant('7:30am to 8pm.'),
      user('how do I set up eduroam?'),
    ]);
    expect(resolveRetrievalQueries(queries)).toEqual({
      search: ['how do I set up eduroam?', 'When is Sharples open?\nhow do I set up eduroam?'],
      rerank: 'When is Sharples open?\nhow do I set up eduroam?',
    });
  });

  it('caps both queries while preserving the current turn', () => {
    const current = `${'x'.repeat(600)} essay ${'y'.repeat(600)} ok?`;
    const { search, rerank } = resolveRetrievalQueries({
      userText: current,
      retrievalQuery: `previous turn\n${current}`,
    });
    expect(search).toEqual([capQuery(current)]);
    expect(rerank).toBe(capQuery(current));
    expect(rerank.length).toBeLessThanOrEqual(1000);
    expect(rerank.endsWith('ok?')).toBe(true);
  });
});
