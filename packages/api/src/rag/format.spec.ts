import type { KbPayload } from './search';
import { embedText, formatContext } from './format';

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
});
