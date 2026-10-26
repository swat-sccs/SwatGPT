import type { CaseRecord, Percentiles, Report, RunMeta, Summary } from './types.ts';

const WORST_COUNT = 5;

/** Nearest-rank percentile; `undefined` for an empty sample. */
export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function percentiles(values: number[]): Percentiles {
  return { p50: percentile(values, 50), p95: percentile(values, 95) };
}

const ratio = (count: number, total: number): number => (total ? count / total : 0);

const finalTurn = (record: CaseRecord) => record.turns[record.turns.length - 1];

/** Local oracle mode seeds the candidate pool with the gold chunks, so their presence in the context is not retrieval recall. */
export type SummaryMode = Pick<RunMeta, 'mode' | 'oracle'>;

const measuresRecall = ({ mode, oracle }: SummaryMode): boolean => mode !== 'local' || !oracle;

export function summarize(cases: CaseRecord[], meta: SummaryMode): Summary {
  const scored = cases.filter((record) => record.score && !record.error);
  const answerable = scored.filter((record) => record.kind !== 'unanswerable');
  const unanswerable = scored.filter((record) => record.kind === 'unanswerable');
  const count = (records: CaseRecord[], predicate: (record: CaseRecord) => boolean): number =>
    records.filter(predicate).length;
  const withUrls = scored.filter((record) => (record.score?.urls.length ?? 0) > 0);
  const turns = scored.flatMap((record) => record.turns);
  const defined = (values: (number | undefined)[]): number[] =>
    values.filter((value): value is number => typeof value === 'number');
  const factRecall = answerable.map((record) =>
    record.score?.factsTotal ? record.score.factsMatched / record.score.factsTotal : 0,
  );
  return {
    cases: cases.length,
    errors: count(cases, (record) => record.error !== undefined),
    answerable: answerable.length,
    accuracy: ratio(
      count(answerable, (record) => record.score?.pass === true),
      answerable.length,
    ),
    meanFactRecall: ratio(
      factRecall.reduce((sum, value) => sum + value, 0),
      factRecall.length,
    ),
    unanswerable: unanswerable.length,
    refusalCorrect: ratio(
      count(unanswerable, (record) => record.score?.pass === true),
      unanswerable.length,
    ),
    falseRefusals: ratio(
      count(
        answerable,
        (record) => record.score?.refused === true && (record.score?.missingFacts.length ?? 0) > 0,
      ),
      answerable.length,
    ),
    hallucinatedUrlRate: ratio(
      count(scored, (record) => (record.score?.inventedUrls.length ?? 0) > 0),
      scored.length,
    ),
    inventedUrlCount: scored.reduce(
      (sum, record) => sum + (record.score?.inventedUrls.length ?? 0),
      0,
    ),
    inventedEmailRate: ratio(
      count(scored, (record) => (record.score?.inventedEmails.length ?? 0) > 0),
      scored.length,
    ),
    inventedPhoneRate: ratio(
      count(scored, (record) => (record.score?.inventedPhones.length ?? 0) > 0),
      scored.length,
    ),
    numericCitationRate: ratio(
      count(answerable, (record) => record.score?.numericCitation === true),
      answerable.length,
    ),
    expectedSourceCited: ratio(
      count(answerable, (record) => record.score?.citedExpected === true),
      answerable.length,
    ),
    citedAmongRetrieved: ratio(
      count(withUrls, (record) => record.score?.citedRetrieved === true),
      withUrls.length,
    ),
    goldRetrieved: measuresRecall(meta)
      ? ratio(
          count(answerable, (record) => record.score?.goldRetrieved === true),
          answerable.length,
        )
      : undefined,
    latencyMs: percentiles(scored.map((record) => finalTurn(record).completion.totalMs)),
    ttftMs: percentiles(defined(scored.map((record) => finalTurn(record).completion.ttftMs))),
    retrievalMs: percentiles(turns.map((turn) => turn.retrieval.elapsedMs)),
    completionTokens: percentiles(defined(turns.map((turn) => turn.completion.completionTokens))),
  };
}

/** Errors, then failures, then passes, each by descending severity. */
export function worstCases(cases: CaseRecord[], limit = WORST_COUNT): CaseRecord[] {
  const rank = (record: CaseRecord): number => {
    if (record.error !== undefined) {
      return 2;
    }
    return record.score?.pass ? 0 : 1;
  };
  return [...cases]
    .sort((a, b) => rank(b) - rank(a) || (b.score?.severity ?? 0) - (a.score?.severity ?? 0))
    .slice(0, limit);
}

export function caseStatus(record: CaseRecord): 'error' | 'pass' | 'fail' {
  if (record.error !== undefined) {
    return 'error';
  }
  return record.score?.pass ? 'pass' : 'fail';
}

function modeDetail(meta: RunMeta): string {
  if (meta.mode !== 'local') {
    return '';
  }
  return meta.oracle ? ' (oracle: gold chunks added to the pool)' : ' (no oracle)';
}

export const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
export const ms = (value: number | undefined): string =>
  value === undefined ? 'n/a' : `${Math.round(value)} ms`;

function failureReasons(record: CaseRecord): string[] {
  if (record.error) {
    return [`error: ${record.error}`];
  }
  const score = record.score;
  if (!score) {
    return [];
  }
  const reasons = [
    ...score.inventedUrls.map((url) => `invented URL ${url}`),
    ...score.inventedEmails.map((email) => `invented email ${email}`),
    ...score.inventedPhones.map((phone) => `invented phone number ${phone}`),
    ...score.missingFacts.map((index) => `missing fact: ${record.facts[index].join(' | ')}`),
  ];
  if (record.kind === 'unanswerable' && !score.refused) {
    reasons.push('answered instead of saying it does not know');
  }
  if (record.kind !== 'unanswerable' && !score.goldRetrieved) {
    reasons.push('expected source not in retrieved context');
  }
  if (record.kind !== 'unanswerable' && !score.citedExpected) {
    reasons.push('did not link the expected source');
  }
  if (score.numericCitation) {
    reasons.push('cites context entries as [n] instead of URLs');
  }
  return reasons;
}

function renderCase(record: CaseRecord, position: number): string {
  const turnLines = record.turns.flatMap((turn, index) => [
    `**User${record.turns.length > 1 ? ` (turn ${index + 1})` : ''}:** ${turn.question}`,
    '',
    `Retrieval: ${turn.retrieval.result}, ${turn.retrieval.sources.length} entries, ${ms(turn.retrieval.elapsedMs)}`,
    '',
    '**Answer:**',
    '',
    '```text',
    turn.completion.text.trim(),
    '```',
    '',
  ]);
  return [
    `### ${position}. \`${record.id}\` (${record.kind}, ${caseStatus(record)})`,
    '',
    ...failureReasons(record).map((reason) => `- ${reason}`),
    '',
    `Expected sources: ${record.expectedSources.join(', ') || 'none (should say it does not know)'}`,
    '',
    ...turnLines,
  ].join('\n');
}

export function renderMarkdown(report: Report): string {
  const { meta, summary } = report;
  const rows: [string, string][] = [
    ['Cases (errors)', `${summary.cases} (${summary.errors})`],
    [
      'Accuracy, answerable + follow-up (all facts, nothing invented)',
      `${pct(summary.accuracy)} of ${summary.answerable}`,
    ],
    ['Mean fact recall', pct(summary.meanFactRecall)],
    [
      'Refusal correctness, unanswerable',
      `${pct(summary.refusalCorrect)} of ${summary.unanswerable}`,
    ],
    ['False refusals, answerable', pct(summary.falseRefusals)],
    [
      'Answers with an invented URL',
      `${pct(summary.hallucinatedUrlRate)} (${summary.inventedUrlCount} URLs)`,
    ],
    ['Answers with an invented email', pct(summary.inventedEmailRate)],
    ['Answers with an invented phone number', pct(summary.inventedPhoneRate)],
    ['Expected source cited', pct(summary.expectedSourceCited)],
    ['Answerable cases citing `[n]` entry numbers', pct(summary.numericCitationRate)],
    [
      'Cited URL among retrieved sources (answers citing any URL)',
      pct(summary.citedAmongRetrieved),
    ],
    [
      'Expected source in retrieved context',
      summary.goldRetrieved === undefined ? 'n/a (oracle)' : pct(summary.goldRetrieved),
    ],
    [
      'Latency p50 / p95 (final turn)',
      `${ms(summary.latencyMs.p50)} / ${ms(summary.latencyMs.p95)}`,
    ],
    ['TTFT p50 / p95', `${ms(summary.ttftMs.p50)} / ${ms(summary.ttftMs.p95)}`],
    ['Retrieval p50 / p95', `${ms(summary.retrievalMs.p50)} / ${ms(summary.retrievalMs.p95)}`],
    [
      'Completion tokens p50 / p95',
      `${summary.completionTokens.p50 ?? 'n/a'} / ${summary.completionTokens.p95 ?? 'n/a'}`,
    ],
  ];
  const results = report.cases.map(
    (record) =>
      `| \`${record.id}\` | ${record.kind} | ${caseStatus(record)} | ${
        record.score ? `${record.score.factsMatched}/${record.score.factsTotal}` : '-'
      } | ${record.score?.refused ? 'yes' : 'no'} | ${record.score?.inventedUrls.length ?? '-'} | ${ms(
        record.turns.at(-1)?.completion.totalMs,
      )} |`,
  );
  return [
    '# SwatGPT answer-quality eval',
    '',
    `Run ${meta.startedAt} → ${meta.finishedAt}, retrieval mode **${meta.mode}**${modeDetail(
      meta,
    )}, concurrency ${meta.concurrency}, model \`${meta.params.model}\` (temperature ${meta.params.temperature}, top_p ${
      meta.params.top_p
    }, top_k ${meta.params.top_k}, max_tokens ${meta.params.max_tokens}, enable_thinking ${
      meta.params.chat_template_kwargs.enable_thinking
    }).`,
    '',
    ...meta.notes.map((note) => `> ${note}`),
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    `## ${WORST_COUNT} worst cases`,
    '',
    ...worstCases(report.cases).map((record, index) => renderCase(record, index + 1)),
    '## All cases',
    '',
    '| Case | Kind | Result | Facts | Refused | Invented URLs | Latency |',
    '|---|---|---|---|---|---|---|',
    ...results,
    '',
  ].join('\n');
}
