import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RetrievalCase, RetrievalReport } from '../lib/types.ts';
import { recallAt8, renderRetrievalMarkdown, summarizeRetrieval } from '../lib/recall.ts';

const KB = 'https://kb.swarthmore.edu/wiki';

const record = (
  id: string,
  kind: RetrievalCase['kind'],
  expected: string[],
  sources: string[],
  elapsedMs: number,
  result: RetrievalCase['retrieval']['result'] = 'hit',
): RetrievalCase => ({
  id,
  kind,
  retrievalQuery: id,
  expectedSources: expected,
  retrieval: { result, sources, elapsedMs, context: sources.length ? 'ctx' : undefined },
  recall: recallAt8(expected, sources),
});

describe('recallAt8', () => {
  it('is the share of expected sources among the retrieved entries, URL-normalized', () => {
    assert.equal(recallAt8([`${KB}/A`, `${KB}/B`], [`${KB}/A/`, `${KB}/C`]), 0.5);
    assert.equal(recallAt8([`${KB}/A`], []), 0);
    assert.equal(recallAt8([], [`${KB}/A`]), 1);
  });
});

describe('summarizeRetrieval', () => {
  const cases = [
    record('a', 'answerable', [`${KB}/A`], [`${KB}/A`, `${KB}/X`], 100),
    record('b', 'answerable', [`${KB}/B`, `${KB}/C`], [`${KB}/B`], 300),
    record('c', 'followup', [`${KB}/D`], [`${KB}/X`], 200, 'hit'),
    record('u', 'unanswerable', [], [], 50, 'empty'),
    record('e', 'answerable', [`${KB}/E`], [], 1000, 'timeout'),
  ];
  const summary = summarizeRetrieval(cases);

  it('averages recall over answerable and follow-up cases only', () => {
    assert.equal(summary.cases, 5);
    assert.equal(summary.answerable, 4);
    assert.equal(summary.recallAt8, (1 + 0.5 + 0 + 0) / 4);
    assert.equal(summary.anyExpectedFound, 0.5);
  });

  it('counts every result and reports latency percentiles', () => {
    assert.deepEqual(summary.results, { hit: 3, empty: 1, timeout: 1, error: 0, disabled: 0 });
    assert.deepEqual(summary.retrievalMs, { p50: 200, p95: 1000 });
  });

  it('renders the summary and one row per case with the missing sources', () => {
    const report: RetrievalReport = {
      meta: { startedAt: 's', finishedAt: 'f', concurrency: 2, questionSet: 'q', notes: ['note'] },
      summary,
      cases,
    };
    const markdown = renderRetrievalMarkdown(report);
    assert.match(markdown, /\| Recall@8 of expected sources \(mean, answerable\) \| 37\.5% \|/);
    assert.match(markdown, /hit 3, empty 1, timeout 1, error 0, disabled 0/);
    assert.match(markdown, /\| `b` \| answerable \| hit \| 50\.0% \| 1 \| 300 ms \| https:\/\/kb\.swarthmore\.edu\/wiki\/C \|/);
    assert.match(markdown, /\| `u` \| unanswerable \| empty \| 100\.0% \| 0 \| 50 ms \|  \|/);
  });
});
