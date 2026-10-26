import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KbChunk } from '../lib/types.ts';
import type { Candidate } from '../lib/retrieval.ts';
import type { Corpus } from '../lib/corpus.ts';
import { buildCandidates, contextSources, selectTop } from '../lib/retrieval.ts';
import { buildIndex } from '../lib/corpus.ts';
import { librechatApi } from '../lib/runtime.ts';
import { emptyKnownLinks } from '../lib/links.ts';

const chunk = (id: number, doc = `doc${id}.md`, text = `chunk ${id}`): KbChunk => ({
  id,
  title: `Title ${id}`,
  source: `https://kb.swarthmore.edu/wiki/T${id}`,
  text,
  doc,
});

describe('selectTop', () => {
  it('applies the 0.3 floor and the top-8 cap in score order', () => {
    const candidates: Candidate[] = Array.from({ length: 10 }, (_, id) => ({ chunk: chunk(id) }));
    const scores = candidates.map((_, index) => ({
      index,
      score: index === 9 ? 0.1 : 0.9 - index * 0.05,
    }));
    const top = selectTop(candidates, scores);
    assert.equal(top.length, 8);
    assert.deepEqual(
      top.map((entry) => entry.id),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  });

  it('reserves the last slot for the best lexical top-3 hit when none made the cut', () => {
    const candidates: Candidate[] = Array.from({ length: 10 }, (_, id) => ({
      chunk: chunk(id),
      lexicalRank: id === 9 ? 2 : undefined,
    }));
    const scores = candidates.map((_, index) => ({ index, score: 0.95 - index * 0.05 }));
    const top = selectTop(candidates, scores);
    assert.equal(top.length, 8);
    assert.equal(top[7].id, 9);
  });
});

describe('contextSources', () => {
  it('reads the entry sources from the production context format', () => {
    const context = librechatApi.formatContext([
      {
        title: 'Help Desk',
        section: 'Phone',
        source: 'https://kb.swarthmore.edu/wiki/A',
        text: 'x8513',
      },
      { title: 'VPN', source: 'https://kb.swarthmore.edu/wiki/B', text: 'Cisco (AnyConnect)' },
    ]);
    assert.deepEqual(contextSources(context), [
      'https://kb.swarthmore.edu/wiki/A',
      'https://kb.swarthmore.edu/wiki/B',
    ]);
    assert.deepEqual(contextSources(undefined), []);
  });
});

describe('buildCandidates', () => {
  const chunks = [
    chunk(0, 'printing.md', 'students print for free at GarnetPrint'),
    chunk(1, 'gold.md', 'poster paper size 48x35'),
    chunk(2, 'gold.md', 'unrelated gold text'),
    ...Array.from({ length: 40 }, (_, offset) =>
      chunk(offset + 3, 'noise.md', `print print noise ${offset}`),
    ),
  ];
  const corpus: Corpus = {
    documents: new Map(),
    chunks,
    known: emptyKnownLinks(),
    index: buildIndex(chunks),
  };

  it('adds every gold chunk to the lexical top 20 in oracle mode', () => {
    const pool = buildCandidates(corpus, ['print'], ['gold.md'], true);
    assert.equal(pool.length, 22);
    const ids = new Set(pool.map((candidate) => candidate.chunk.id));
    assert.ok(ids.has(1) && ids.has(2));
  });

  it('never exceeds the 32-candidate TEI batch limit', () => {
    assert.equal(
      buildCandidates(corpus, ['gold text poster'], ['noise.md'], true).length <= 32,
      true,
    );
  });

  it('uses only the lexical channel without the oracle', () => {
    const pool = buildCandidates(corpus, ['print'], ['gold.md'], false);
    assert.equal(pool.length, 20);
    assert.ok(pool.every((candidate) => candidate.lexicalRank !== undefined));
  });

  it('merges one channel per search query round-robin, ranking only the current turn', () => {
    const pool = buildCandidates(corpus, ['poster', 'GarnetPrint poster'], [], false);
    assert.deepEqual(
      pool.map((candidate) => [candidate.chunk.id, candidate.lexicalRank]),
      [
        [1, 1],
        [0, undefined],
      ],
    );
    const followup = buildCandidates(corpus, ['unrelated', 'print unrelated'], [], false);
    assert.equal(followup[0].chunk.id, 2);
    assert.equal(followup[0].lexicalRank, 1);
    assert.equal(followup.length, 20);
    assert.ok(followup.slice(1).every((candidate) => candidate.lexicalRank === undefined));
  });
});
