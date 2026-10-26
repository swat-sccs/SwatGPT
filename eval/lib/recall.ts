import type { RetrievalCase, RetrievalReport, RetrievalResult, RetrievalSummary } from './types.ts';
import { ms, pct, percentile } from './report.ts';
import { normalizeUrl } from './links.ts';

const RESULTS: readonly RetrievalResult[] = ['hit', 'empty', 'timeout', 'error', 'disabled'];

/** Share of the expected sources among the retrieved entries (production returns at most 8). */
export function recallAt8(expectedSources: string[], retrieved: string[]): number {
  if (!expectedSources.length) {
    return 1;
  }
  const found = new Set(retrieved.map(normalizeUrl));
  const matched = expectedSources.filter((source) => found.has(normalizeUrl(source))).length;
  return matched / expectedSources.length;
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function summarizeRetrieval(cases: RetrievalCase[]): RetrievalSummary {
  const answerable = cases.filter((record) => record.kind !== 'unanswerable');
  const results = Object.fromEntries(RESULTS.map((result) => [result, 0])) as Record<
    RetrievalResult,
    number
  >;
  for (const record of cases) {
    results[record.retrieval.result] += 1;
  }
  const elapsed = cases.map((record) => record.retrieval.elapsedMs);
  return {
    cases: cases.length,
    answerable: answerable.length,
    recallAt8: mean(answerable.map((record) => record.recall)),
    anyExpectedFound: mean(answerable.map((record) => (record.recall > 0 ? 1 : 0))),
    results,
    retrievalMs: { p50: percentile(elapsed, 50), p95: percentile(elapsed, 95) },
  };
}

function missingSources(record: RetrievalCase): string[] {
  const found = new Set(record.retrieval.sources.map(normalizeUrl));
  return record.expectedSources.filter((source) => !found.has(normalizeUrl(source)));
}

export function renderRetrievalMarkdown(report: RetrievalReport): string {
  const { meta, summary } = report;
  const rows: [string, string][] = [
    ['Cases (answerable + follow-up)', `${summary.cases} (${summary.answerable})`],
    ['Recall@8 of expected sources (mean, answerable)', pct(summary.recallAt8)],
    ['Answerable cases with an expected source retrieved', pct(summary.anyExpectedFound)],
    ['Results', RESULTS.map((result) => `${result} ${summary.results[result]}`).join(', ')],
    ['Retrieval p50 / p95', `${ms(summary.retrievalMs.p50)} / ${ms(summary.retrievalMs.p95)}`],
  ];
  const cases = report.cases.map(
    (record) =>
      `| \`${record.id}\` | ${record.kind} | ${record.retrieval.result} | ${pct(record.recall)} | ${
        record.retrieval.sources.length
      } | ${ms(record.retrieval.elapsedMs)} | ${missingSources(record).join(', ')} |`,
  );
  return [
    '# SwatGPT retrieval-only eval',
    '',
    `Run ${meta.startedAt} → ${meta.finishedAt}, retrieval mode **live**, concurrency ${meta.concurrency}.`,
    '',
    ...meta.notes.map((note) => `> ${note}`),
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    '## All cases',
    '',
    '| Case | Kind | Result | Recall | Entries | Elapsed | Missing expected sources |',
    '|---|---|---|---|---|---|---|',
    ...cases,
    '',
  ].join('\n');
}
