import { logger } from '@librechat/data-schemas';
import type { KbRetrievalResult } from '~/app/metrics';
import type { KbCandidate, KbPayload } from './search';
import type { RerankResult } from './rerank';
import { recordRagRetrieval } from '~/app/metrics';
import { buildSparseQuery } from './lexical';
import { formatContext } from './format';
import { rerankChunks } from './rerank';
import { embedQuery } from './embed';
import { searchKb } from './search';

const RERANK_SCORE_FLOOR = 0.3;
const TOTAL_BUDGET_MS = 1500;
const TOP_CHUNKS = 8;
const LEXICAL_TOP = 3;

interface RagConfig {
  embeddingsUrl: string;
  rerankUrl: string;
  qdrantUrl: string;
}

function readConfig(): RagConfig | undefined {
  const embeddingsUrl = process.env.TEI_EMBEDDINGS_URL;
  const rerankUrl = process.env.TEI_RERANK_URL;
  const qdrantUrl = process.env.QDRANT_URL;
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
  const guaranteed = eligible
    .filter(isLexical)
    .reduce<
      RerankResult | undefined
    >((best, result) => (best && lexicalRank(best) <= lexicalRank(result) ? best : result), undefined);
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
}

const NO_RETRIEVAL: KbRetrieval = { chunks: 0, elapsedMs: 0, result: 'disabled' };

const elapsedSince = (startedAt: bigint): number =>
  Number(process.hrtime.bigint() - startedAt) / 1_000_000;

async function runPipeline(
  config: RagConfig,
  query: string,
  signal: AbortSignal,
): Promise<KbPayload[]> {
  const vector = await embedQuery(config.embeddingsUrl, query, signal);
  const candidates = await searchKb(config.qdrantUrl, vector, buildSparseQuery(query), signal);
  if (!candidates.length) {
    return [];
  }
  const scores = await rerankChunks(
    config.rerankUrl,
    query,
    candidates.map((candidate) => candidate.payload.text),
    signal,
  );
  return selectTopChunks(candidates, scores);
}

/**
 * Retrieves Swarthmore KB context for a user query and reports what happened:
 * embed → Qdrant hybrid (dense + lexical, RRF) → rerank → top chunks.
 * Fail-open by design — any error, timeout, or missing configuration yields no
 * `context` (with `result` explaining why) so a RAG failure never fails the chat message.
 * Every attempt is recorded in the Prometheus RAG metrics.
 */
export async function retrieveKbContextDetailed(query: string): Promise<KbRetrieval> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ...NO_RETRIEVAL, result: 'empty' };
  }
  const config = readConfig();
  if (!config) {
    recordRagRetrieval('disabled', 0, 0);
    return NO_RETRIEVAL;
  }
  const startedAt = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
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
  try {
    const top = await runPipeline(config, trimmed, controller.signal);
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
export async function retrieveKbContext(query: string): Promise<string | undefined> {
  const { context } = await retrieveKbContextDetailed(query);
  return context;
}
