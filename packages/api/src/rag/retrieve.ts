import { logger } from '@librechat/data-schemas';
import type { KbRetrievalResult } from '~/app/metrics';
import type { KbQueries, KbRetrievalQueries } from './query';
import type { KbCandidate, KbPayload } from './search';
import type { RerankResult } from './rerank';
import { embedText, formatContext } from './format';
import { recordRagRetrieval } from '~/app/metrics';
import { cacheKey, retrievalCache } from './cache';
import { resolveRetrievalQueries } from './query';
import { buildSparseQuery } from './lexical';
import { rerankChunks } from './rerank';
import { embedQueries } from './embed';
import { searchKb } from './search';

const RERANK_SCORE_FLOOR = 0.3;
const TOTAL_BUDGET_MS = 1000;
const TOP_CHUNKS = 8;
const LEXICAL_TOP = 3;

interface RagConfig {
  embeddingsUrl: string;
  rerankUrl: string;
  qdrantUrl: string;
}

const CONFIG_VARS = ['TEI_EMBEDDINGS_URL', 'TEI_RERANK_URL', 'QDRANT_URL'] as const;

let loggedConfig: string | undefined;

/**
 * Logs the KB configuration state once per distinct state: a partial set of variables
 * is almost always a deployment mistake, so it is a warning naming the missing ones,
 * while a complete set is noted at info and a fully unset one is a silent opt-out.
 */
function logConfigOnce(missing: string[]): void {
  const signature = missing.join(',');
  if (signature === loggedConfig) {
    return;
  }
  loggedConfig = signature;
  if (!missing.length) {
    logger.info('[retrieveKbContext] KB retrieval enabled (TEI embeddings, TEI rerank, Qdrant)');
    return;
  }
  if (missing.length === CONFIG_VARS.length) {
    return;
  }
  logger.warn(
    `[retrieveKbContext] KB retrieval disabled: partial configuration, missing ${missing.join(', ')}`,
  );
}

function readConfig(): RagConfig | undefined {
  const embeddingsUrl = process.env.TEI_EMBEDDINGS_URL;
  const rerankUrl = process.env.TEI_RERANK_URL;
  const qdrantUrl = process.env.QDRANT_URL;
  logConfigOnce(CONFIG_VARS.filter((name) => !process.env[name]));
  if (!embeddingsUrl || !rerankUrl || !qdrantUrl) {
    return undefined;
  }
  return { embeddingsUrl, rerankUrl, qdrantUrl };
}

/**
 * Picks the final context chunks by rerank score, with one guarantee: the
 * best-reranked candidate among the lexical channel's top hits always gets a
 * slot. The reranker judges topical relevance, so a chunk that grounds an
 * entity the user named (e.g. the "Cornell Science Library" page for a query
 * mentioning Cornell) would otherwise lose every slot to near-duplicate
 * topical chunks.
 */
function selectTopChunks(candidates: KbCandidate[], scores: RerankResult[]): KbPayload[] {
  const eligible = scores.filter(
    (result) => result.score >= RERANK_SCORE_FLOOR && candidates[result.index] !== undefined,
  );
  eligible.sort((a, b) => b.score - a.score);
  const top = eligible.slice(0, TOP_CHUNKS);
  const lexicalRank = (result: RerankResult): number =>
    candidates[result.index].lexicalRank ?? Number.POSITIVE_INFINITY;
  const isLexical = (result: RerankResult): boolean => lexicalRank(result) <= LEXICAL_TOP;
  const guaranteed = eligible.find(isLexical);
  if (guaranteed && top.length === TOP_CHUNKS && !top.some(isLexical)) {
    top[top.length - 1] = guaranteed;
  }
  return top.map((result) => candidates[result.index].payload);
}

export interface KbRetrieval {
  /** Formatted context block for the system prompt; `undefined` when nothing usable was found. */
  context?: string;
  /** Number of KB chunks included in `context`. */
  chunks: number;
  /** Wall-clock time spent in retrieval, including the fail-open path. */
  elapsedMs: number;
  result: KbRetrievalResult;
  /** Set when the chunks came from the short-TTL in-process cache instead of the pipeline. */
  cached?: true;
}

const NO_RETRIEVAL: KbRetrieval = { chunks: 0, elapsedMs: 0, result: 'disabled' };

const elapsedSince = (startedAt: bigint): number =>
  Number(process.hrtime.bigint() - startedAt) / 1_000_000;

async function runPipeline(
  config: RagConfig,
  queries: KbRetrievalQueries,
  signal: AbortSignal,
): Promise<KbPayload[]> {
  const vectors = await embedQueries(config.embeddingsUrl, queries.search, signal);
  const searches = queries.search.map((query, index) => ({
    vector: vectors[index],
    sparse: buildSparseQuery(query),
  }));
  const candidates = await searchKb(config.qdrantUrl, searches, signal);
  if (!candidates.length) {
    return [];
  }
  const scores = await rerankChunks(
    config.rerankUrl,
    queries.rerank,
    candidates.map((candidate) => embedText(candidate.payload)),
    signal,
  );
  return selectTopChunks(candidates, scores);
}

/**
 * Retrieves Swarthmore KB context for a user query and reports what happened:
 * embed → Qdrant dense + lexical channels per query (deduplicated union, no score
 * fusion) → rerank (with a lexical-slot guarantee) → top chunks.
 * Accepts a bare query or {@link KbQueries}; see {@link resolveRetrievalQueries}
 * for how follow-ups search and how queries are length-capped.
 * Fail-open by design — any error, timeout, or missing configuration yields no
 * `context` (with `result` explaining why) so a RAG failure never fails the chat message.
 * Successful results (`hit`, `empty`) are served from a short-TTL in-process cache for
 * repeated queries; failures are never cached.
 * Every attempt past the blank-query check is recorded in the Prometheus RAG metrics;
 * a blank query returns `empty` without recording anything.
 */
export async function retrieveKbContextDetailed(query: string | KbQueries): Promise<KbRetrieval> {
  const queries = resolveRetrievalQueries(query);
  if (!queries.rerank) {
    return { ...NO_RETRIEVAL, result: 'empty' };
  }
  const config = readConfig();
  if (!config) {
    recordRagRetrieval('disabled', 0, 0);
    return NO_RETRIEVAL;
  }
  const startedAt = process.hrtime.bigint();
  const finish = (result: KbRetrievalResult, top: KbPayload[] = []): KbRetrieval => {
    const elapsedMs = elapsedSince(startedAt);
    recordRagRetrieval(result, elapsedMs / 1000, top.length);
    return {
      context: top.length ? formatContext(top) : undefined,
      chunks: top.length,
      elapsedMs,
      result,
    };
  };
  const key = cacheKey(queries);
  const cached = retrievalCache.get(key);
  if (cached) {
    return { ...finish(cached.length ? 'hit' : 'empty', cached), cached: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
  try {
    const top = await runPipeline(config, queries, controller.signal);
    retrievalCache.set(key, top);
    return finish(top.length ? 'hit' : 'empty', top);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[retrieveKbContext] KB retrieval failed; continuing without context: ${message}`);
    return finish(controller.signal.aborted ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retrieves Swarthmore KB context for a user query. Fail-open: any error, timeout,
 * or missing configuration yields `undefined`. See {@link retrieveKbContextDetailed}
 * for the structured variant.
 */
export async function retrieveKbContext(query: string | KbQueries): Promise<string | undefined> {
  const { context } = await retrieveKbContextDetailed(query);
  return context;
}
