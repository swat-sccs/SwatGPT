import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildIndex,
  chunkDocument,
  loadCorpus,
  parseDocument,
  searchLexical,
} from '../lib/corpus.ts';

const KB = join(import.meta.dirname, '..', '..', 'information');

const RAW = `---
title: "Printing \\"Policies\\""
source: https://kb.swarthmore.edu/wiki/Printing
---
# Printing "Policies"
Intro paragraph.
## Large format
Posters are 48x35 and for curricular use.
## Paper cutter
Yes, there is a paper cutter.
`;

describe('parseDocument', () => {
  it('reads title and source from frontmatter and unescapes quotes', () => {
    const document = parseDocument('printing.md', RAW);
    assert.equal(document?.title, 'Printing "Policies"');
    assert.equal(document?.source, 'https://kb.swarthmore.edu/wiki/Printing');
  });

  it('rejects files without a source', () => {
    assert.equal(parseDocument('x.md', '---\ntitle: x\n---\nbody'), undefined);
  });
});

describe('chunkDocument and searchLexical', () => {
  it('splits on headings, keeps sections and ranks the matching chunk first', () => {
    const document = parseDocument('printing.md', RAW);
    assert.ok(document);
    const chunks = chunkDocument(document, 0);
    assert.deepEqual(
      chunks.map((chunk) => chunk.section),
      [undefined, 'Large format', 'Paper cutter'],
    );
    const hits = searchLexical(buildIndex(chunks), 'poster size curricular', 5);
    assert.equal(chunks[hits[0].chunk].section, 'Large format');
    assert.equal(hits[0].rank, 1);
  });

  it('restricts results to an allowed set', () => {
    const document = parseDocument('printing.md', RAW);
    assert.ok(document);
    const chunks = chunkDocument(document, 0);
    assert.deepEqual(
      searchLexical(buildIndex(chunks), 'paper cutter', 5, new Set([1, 2])).map((hit) => hit.chunk),
      [2],
    );
  });
});

describe('loadCorpus', () => {
  it('loads the whole KB including www/ and catalog/ and collects its links', async () => {
    const corpus = await loadCorpus(KB);
    assert.ok(corpus.documents.size > 3000);
    assert.ok(corpus.documents.has('help-desk-hours-of-operation.md'));
    assert.ok(corpus.documents.has('www/academics-2027-spring-semester.md'));
    assert.ok(corpus.known.emails.has('phishing@swarthmore.edu'));
    assert.ok(corpus.known.hosts.has('password.swarthmore.edu'));
  });
});
