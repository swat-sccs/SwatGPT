import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CaseRecord, Score } from '../lib/types.ts';
import { percentile, renderMarkdown, summarize, worstCases } from '../lib/report.ts';

const score = (overrides: Partial<Score>): Score => ({
  factsMatched: 1,
  factsTotal: 1,
  missingFacts: [],
  refused: false,
  urls: [],
  inventedUrls: [],
  emails: [],
  inventedEmails: [],
  phones: [],
  inventedPhones: [],
  numericCitation: false,
  citedRetrieved: false,
  citedExpected: false,
  goldRetrieved: true,
  pass: true,
  severity: 0,
  ...overrides,
});

const record = (
  id: string,
  kind: CaseRecord['kind'],
  overrides: Partial<Score>,
  totalMs = 1000,
): CaseRecord => ({
  id,
  kind,
  expectedSources: [],
  facts: [['x']],
  turns: [
    {
      question: id,
      retrievalQuery: id,
      retrieval: { result: 'hit', sources: [], elapsedMs: 50 },
      completion: { text: `answer ${id}`, totalMs, ttftMs: totalMs / 10, completionTokens: 100 },
    },
  ],
  score: score(overrides),
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
    assert.equal(percentile([], 50), undefined);
  });
});

describe('summarize', () => {
  const cases = [
    record('a', 'answerable', {}, 1000),
    record(
      'b',
      'answerable',
      { pass: false, factsMatched: 0, missingFacts: [0], refused: true, severity: 25 },
      2000,
    ),
    record('c', 'unanswerable', { refused: true, factsTotal: 0, factsMatched: 0 }, 3000),
    record('d', 'unanswerable', {
      pass: false,
      inventedUrls: ['https://x.edu/y'],
      urls: ['https://x.edu/y'],
      severity: 65,
    }),
    { ...record('e', 'followup', {}), score: undefined, error: 'vLLM returned 503' },
  ];
  const summary = summarize(cases);

  it('splits accuracy, refusals and hallucinations by kind and excludes errors', () => {
    assert.equal(summary.cases, 5);
    assert.equal(summary.errors, 1);
    assert.equal(summary.accuracy, 0.5);
    assert.equal(summary.refusalCorrect, 0.5);
    assert.equal(summary.falseRefusals, 0.5);
    assert.equal(summary.hallucinatedUrlRate, 0.25);
    assert.equal(summary.inventedUrlCount, 1);
    assert.deepEqual(summary.latencyMs, { p50: 1000, p95: 3000 });
  });

  it('puts errors, then the most severe failures, first and renders them verbatim', () => {
    assert.deepEqual(
      worstCases(cases, 3).map((entry) => entry.id),
      ['e', 'd', 'b'],
    );
    const markdown = renderMarkdown({
      meta: {
        startedAt: 's',
        finishedAt: 'f',
        mode: 'local',
        oracle: true,
        concurrency: 2,
        params: {
          model: 'm',
          baseUrl: 'u',
          temperature: 0.3,
          top_p: 0.8,
          top_k: 20,
          max_tokens: 1536,
          chat_template_kwargs: { enable_thinking: false },
        },
        questionSet: 'q',
        notes: ['note'],
      },
      summary,
      cases,
    });
    assert.match(markdown, /invented URL https:\/\/x\.edu\/y/);
    assert.match(markdown, /answer d/);
    assert.match(markdown, /error: vLLM returned 503/);
  });
});
