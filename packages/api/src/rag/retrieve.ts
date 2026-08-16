import { logger } from '@librechat/data-schemas';
import type { KbCandidate, KbPayload } from './search';
import type { RerankResult } from './rerank';
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

/**
 * Retrieves Swarthmore KB context for a user query:
 * embed → Qdrant hybrid (dense + lexical, RRF) → rerank → top chunks.
 * Fail-open by design — any error, timeout, or missing configuration yields `undefined`
 * so a RAG failure never fails the chat message.
 */
export async function retrieveKbContext(query: string): Promise<string | undefined> {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }
  const config = readConfig();
  if (!config) {
    return undefined;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
  try {
    const vector = await embedQuery(config.embeddingsUrl, trimmed, controller.signal);
    const candidates = await searchKb(
      config.qdrantUrl,
      vector,
      buildSparseQuery(trimmed),
      controller.signal,
    );
    if (!candidates.length) {
      return undefined;
    }
    const scores = await rerankChunks(
      config.rerankUrl,
      trimmed,
      candidates.map((candidate) => candidate.payload.text),
      controller.signal,
    );
    const top = selectTopChunks(candidates, scores);
    if (!top.length) {
      return undefined;
    }
    return formatContext(top);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[retrieveKbContext] KB retrieval failed; continuing without context: ${message}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
