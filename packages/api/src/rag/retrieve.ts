import { logger } from '@librechat/data-schemas';
import type { RerankResult } from './rerank';
import type { KbPayload } from './search';
import { formatContext } from './format';
import { rerankChunks } from './rerank';
import { embedQuery } from './embed';
import { searchKb } from './search';

const RERANK_SCORE_FLOOR = 0.3;
const TOTAL_BUDGET_MS = 1500;
const TOP_CHUNKS = 5;

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

function selectTopChunks(chunks: KbPayload[], scores: RerankResult[]): KbPayload[] {
  const eligible = scores.filter(
    (result) => result.score >= RERANK_SCORE_FLOOR && chunks[result.index] !== undefined,
  );
  eligible.sort((a, b) => b.score - a.score);
  return eligible.slice(0, TOP_CHUNKS).map((result) => chunks[result.index]);
}

/**
 * Retrieves Swarthmore KB context for a user query: embed → Qdrant top-20 → rerank → top-5.
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
    const chunks = await searchKb(config.qdrantUrl, vector, controller.signal);
    if (!chunks.length) {
      return undefined;
    }
    const scores = await rerankChunks(
      config.rerankUrl,
      trimmed,
      chunks.map((chunk) => chunk.text),
      controller.signal,
    );
    const top = selectTopChunks(chunks, scores);
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
