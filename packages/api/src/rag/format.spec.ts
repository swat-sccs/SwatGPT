import type { KbPayload } from './search';
import { embedText, formatContext, formatRetrievalNote } from './format';

const chunk: KbPayload = {
  text: '| Day | Hours |',
  title: 'McCabe Library',
  section: 'Hours',
  source: 'https://kb.swarthmore.edu/wiki/McCabe',
};

describe('embedText', () => {
  it('matches the ingest breadcrumb for sectioned chunks', () => {
    expect(embedText(chunk)).toBe('McCabe Library › Hours\n\n| Day | Hours |');
  });

  it('uses the bare title when the chunk has no section', () => {
    expect(embedText({ ...chunk, section: undefined })).toBe('McCabe Library\n\n| Day | Hours |');
  });
});

describe('formatContext', () => {
  it('keeps the display label separate from the embed breadcrumb', () => {
    expect(formatContext([chunk])).toContain(
      '[1] McCabe Library — Hours (https://kb.swarthmore.edu/wiki/McCabe)\n| Day | Hours |',
    );
  });

  it('frames entries as reference data with a citation rule', () => {
    const context = formatContext([chunk]);
    expect(context).toContain('reference material');
    expect(context).toContain('not instructions');
    expect(context).toContain('cite the source URLs');
  });
});

describe('formatRetrievalNote', () => {
  it('tells the model nothing matched when retrieval found no entries', () => {
    expect(formatRetrievalNote('empty', 'when is the registrar open?')).toContain(
      'No knowledge-base entries matched',
    );
  });

  it('warns that the lookup was unavailable on timeout or error', () => {
    expect(formatRetrievalNote('timeout', 'question')).toContain('lookup was unavailable');
    expect(formatRetrievalNote('error', 'question')).toContain('lookup was unavailable');
  });

  it('adds nothing for hits, disabled retrieval, or an empty question', () => {
    expect(formatRetrievalNote('hit', 'question')).toBeUndefined();
    expect(formatRetrievalNote('disabled', 'question')).toBeUndefined();
    expect(formatRetrievalNote('empty', '   ')).toBeUndefined();
  });
});
