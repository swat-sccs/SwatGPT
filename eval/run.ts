import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type {
  CaseRecord,
  ChatMessage,
  Question,
  QuestionSet,
  Report,
  RetrievalMode,
  RunMeta,
  TurnRecord,
} from './lib/types.ts';
import type { ProductionConfig } from './lib/prompt.ts';
import type { Retriever } from './lib/retrieval.ts';
import type { Corpus } from './lib/corpus.ts';
import type { EvalEnv } from './lib/env.ts';
import { createLiveRetriever, createLocalRetriever, resolveMode } from './lib/retrieval.ts';
import { buildSystemPrompt, loadProductionConfig } from './lib/prompt.ts';
import { caseStatus, renderMarkdown, summarize } from './lib/report.ts';
import { validateQuestions } from './lib/questions.ts';
import { streamCompletion } from './lib/chat.ts';
import { librechatApi } from './lib/runtime.ts';
import { scoreAnswer } from './lib/score.ts';
import { loadCorpus } from './lib/corpus.ts';
import { loadEnv } from './lib/env.ts';

/** Production shares loon's GPU with this eval; never run more than two requests at once. */
const MAX_CONCURRENCY = 2;
const ROOT = resolve(import.meta.dirname, '..');

interface Options {
  questions: string;
  kb: string;
  config: string;
  envFile: string;
  out: string;
  mode: RetrievalMode | 'auto';
  oracle: boolean;
  concurrency: number;
  only?: Set<string>;
  baseUrl?: string;
  rescore?: string;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      questions: { type: 'string', default: join(import.meta.dirname, 'questions.json') },
      kb: { type: 'string', default: join(ROOT, 'information') },
      config: { type: 'string', default: join(ROOT, 'librechat.yaml') },
      'env-file': { type: 'string', default: join(ROOT, '.env') },
      out: { type: 'string', default: join(import.meta.dirname, 'reports') },
      mode: { type: 'string', default: 'auto' },
      'no-oracle': { type: 'boolean', default: false },
      concurrency: { type: 'string', default: String(MAX_CONCURRENCY) },
      only: { type: 'string' },
      'base-url': { type: 'string' },
      rescore: { type: 'string' },
    },
  });
  const mode = values.mode;
  if (mode !== 'auto' && mode !== 'live' && mode !== 'local') {
    throw new Error(`--mode must be auto, live or local (got ${mode})`);
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be 1..${MAX_CONCURRENCY}; production shares the GPU`);
  }
  return {
    questions: values.questions,
    kb: values.kb,
    config: values.config,
    envFile: values['env-file'],
    out: values.out,
    mode,
    oracle: !values['no-oracle'],
    concurrency,
    only: values.only ? new Set(values.only.split(',').map((id) => id.trim())) : undefined,
    baseUrl: values['base-url'],
    rescore: values.rescore,
  };
}

interface Context {
  corpus: Corpus;
  production: ProductionConfig;
  retriever: Retriever;
  apiKey: string;
}

async function runTurn(
  context: Context,
  question: Question,
  history: ChatMessage[],
  text: string,
): Promise<TurnRecord> {
  const branch = [...history, { role: 'user', content: text }].map((message) => ({
    text: message.content,
    isCreatedByUser: message.role === 'user',
  }));
  const queries = librechatApi.buildKbQueries(branch);
  const retrieval = await context.retriever(queries, question.docs);
  const system = buildSystemPrompt(context.production.promptPrefix, retrieval.context, new Date());
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: text },
  ];
  const completion = await streamCompletion(context.production.params, context.apiKey, messages);
  return { question: text, retrievalQuery: queries.retrievalQuery, retrieval, completion };
}

async function runCase(context: Context, question: Question): Promise<CaseRecord> {
  const expectedSources = question.docs.map(
    (doc) => context.corpus.documents.get(doc)?.source ?? doc,
  );
  const record: CaseRecord = {
    id: question.id,
    kind: question.kind,
    expectedSources,
    facts: question.facts,
    turns: [],
  };
  const history: ChatMessage[] = [];
  try {
    for (const text of question.turns) {
      const turn = await runTurn(context, question, history, text);
      record.turns.push(turn);
      history.push(
        { role: 'user', content: text },
        { role: 'assistant', content: turn.completion.text },
      );
    }
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    return record;
  }
  return scoreRecord(record, context.production.promptPrefix, context.corpus);
}

/** Scores the final turn; the trusted prompt text is the preset, its KB block and the user turns. */
function scoreRecord(record: CaseRecord, promptPrefix: string, corpus: Corpus): CaseRecord {
  const last = record.turns.at(-1);
  if (record.error || !last) {
    return { ...record, score: undefined };
  }
  const promptText = [
    promptPrefix,
    last.retrieval.context ?? '',
    ...record.turns.map((turn) => turn.question),
  ].join('\n');
  const score = scoreAnswer({
    kind: record.kind,
    answer: last.completion.text,
    facts: record.facts,
    expectedSources: record.expectedSources,
    retrievedSources: last.retrieval.sources,
    promptText,
    known: corpus.known,
  });
  return { ...record, score };
}

async function writeReport(report: Report, out: string, name: string): Promise<string> {
  await mkdir(out, { recursive: true });
  const base = join(out, name);
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${base}.md`, renderMarkdown(report));
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\nreport: ${base}.md\n`);
  return base;
}

/** Re-scores a saved report with the current scorer and KB, without calling any model. */
async function rescore(options: Options): Promise<void> {
  const [corpus, production, text] = await Promise.all([
    loadCorpus(options.kb),
    loadProductionConfig(options.config),
    readFile(options.rescore ?? '', 'utf8'),
  ]);
  const previous = JSON.parse(text) as Report;
  const cases = previous.cases.map((record) =>
    scoreRecord(record, production.promptPrefix, corpus),
  );
  const report: Report = {
    meta: {
      ...previous.meta,
      notes: [
        ...previous.meta.notes,
        `Re-scored ${new Date().toISOString()} without new generations.`,
      ],
    },
    summary: summarize(cases, previous.meta),
    cases,
  };
  const stamp = previous.meta.startedAt.replace(/[:.]/g, '-');
  await writeReport(report, options.out, `eval-${stamp}-rescored`);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

function modeNotes(mode: RetrievalMode, oracle: boolean, env: EvalEnv): string[] {
  const shared = [
    'System prompt = librechat.yaml promptPrefix (stable part, then the date tail) + the KB block production appends; Dash MCP tools, MCP server instructions and the directory block are not included, so live-data questions are out of scope.',
  ];
  if (mode === 'live') {
    return [
      `Retrieval: production retrieveKbContextDetailed against Qdrant at ${env.QDRANT_URL}.`,
      ...shared,
    ];
  }
  return [
    `Retrieval: LOCAL approximation — Qdrant was not reachable/selected, so candidates come from BM25 over the information/ markdown (production tokenizer) for each production search query, merged round-robin${
      oracle ? " plus up to 12 chunks of the question's source documents" : ''
    }, reranked by the production TEI reranker with the production selection rule and formatContext. No dense channel; chunking approximates the ingest splitter.`,
    ...shared,
  ];
}

async function main(): Promise<void> {
  const options = parseOptions();
  if (options.rescore) {
    return rescore(options);
  }
  const env = await loadEnv(options.envFile);
  if (!env.VLLM_API_KEY) {
    throw new Error('VLLM_API_KEY is not set (environment or --env-file)');
  }
  const [corpus, production, questionText] = await Promise.all([
    loadCorpus(options.kb),
    loadProductionConfig(options.config),
    readFile(options.questions, 'utf8'),
  ]);
  if (options.baseUrl) {
    production.params.baseUrl = options.baseUrl;
  }
  const questionSet = JSON.parse(questionText) as QuestionSet;
  validateQuestions(questionSet, new Set(corpus.documents.keys()));
  const questions = questionSet.questions.filter(
    (question) => !options.only || options.only.has(question.id),
  );
  const mode = await resolveMode(options.mode, env);
  if (mode === 'live') {
    process.env.TEI_EMBEDDINGS_URL = env.TEI_EMBEDDINGS_URL;
    process.env.TEI_RERANK_URL = env.TEI_RERANK_URL;
    process.env.QDRANT_URL = env.QDRANT_URL;
  }
  if (mode === 'local' && !env.TEI_RERANK_URL) {
    throw new Error('Local mode needs TEI_RERANK_URL');
  }
  const retriever =
    mode === 'live'
      ? createLiveRetriever()
      : createLocalRetriever(corpus, env.TEI_RERANK_URL ?? '', options.oracle);
  const context: Context = { corpus, production, retriever, apiKey: env.VLLM_API_KEY };
  const startedAt = new Date();
  process.stderr.write(
    `eval: ${questions.length} cases, mode ${mode}, ${corpus.chunks.length} local chunks, concurrency ${options.concurrency}\n`,
  );
  let done = 0;
  const cases = await mapPool(questions, options.concurrency, async (question) => {
    const record = await runCase(context, question);
    done += 1;
    const status = record.error ? `error ${record.error}` : caseStatus(record);
    const latency = Math.round(record.turns.at(-1)?.completion.totalMs ?? 0);
    process.stderr.write(`[${done}/${questions.length}] ${question.id} ${status} ${latency}ms\n`);
    return record;
  });
  const meta: RunMeta = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    mode,
    oracle: options.oracle,
    concurrency: options.concurrency,
    params: production.params,
    questionSet: options.questions,
    notes: modeNotes(mode, options.oracle, env),
  };
  const report: Report = { meta, summary: summarize(cases, meta), cases };
  await writeReport(report, options.out, `eval-${startedAt.toISOString().replace(/[:.]/g, '-')}`);
  if (cases.some((record) => record.error)) {
    process.exitCode = 1;
  }
}

await main();
