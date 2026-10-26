import type { KbChunk, Retrieval, RetrievalMode } from './types.ts';
import type { Corpus, LexicalHit } from './corpus.ts';
import type { KbQueries } from './runtime.ts';
import type { EvalEnv } from './env.ts';
import { searchLexical } from './corpus.ts';
import { librechatApi } from './runtime.ts';

/** Mirrors `packages/api/src/rag/retrieve.ts` and `search.ts`. */
const RERANK_SCORE_FLOOR = 0.3;
const TOP_CHUNKS = 8;
const LEXICAL_TOP = 3;
const CHANNEL_LIMIT = 20;
const CANDIDATE_LIMIT = 32;
const GOLD_CHUNKS = 12;
const PROBE_TIMEOUT_MS = 3000;
const RERANK_TIMEOUT_MS = 10_000;

export type Retriever = (queries: KbQueries, goldDocs: string[]) => Promise<Retrieval>;

export interface Candidate {
  chunk: KbChunk;
  lexicalRank?: number;
}

export interface RerankScore {
  index: number;
  score: number;
}

const elapsedSince = (startedAt: number): number => performance.now() - startedAt;

/** Source URLs of the entries in a formatted KB context block. */
export function contextSources(context: string | undefined): string[] {
  return librechatApi.contextEntrySources(context);
}

/** Same selection rule as production `selectTopChunks`: score floor, top 8, one lexical slot. */
export function selectTop(candidates: Candidate[], scores: RerankScore[]): KbChunk[] {
  const eligible = scores
    .filter(
      (result) => result.score >= RERANK_SCORE_FLOOR && candidates[result.index] !== undefined,
    )
    .sort((a, b) => b.score - a.score);
  const top = eligible.slice(0, TOP_CHUNKS);
  const lexicalRank = (result: RerankScore): number =>
    candidates[result.index].lexicalRank ?? Number.POSITIVE_INFINITY;
  const isLexical = (result: RerankScore): boolean => lexicalRank(result) <= LEXICAL_TOP;
  const guaranteed = eligible
    .filter(isLexical)
    .reduce<
      RerankScore | undefined
    >((best, result) => (best && lexicalRank(best) <= lexicalRank(result) ? best : result), undefined);
  if (guaranteed && top.length === TOP_CHUNKS && !top.some(isLexical)) {
    top[top.length - 1] = guaranteed;
  }
  return top.map((result) => candidates[result.index].chunk);
}

/** Position of the current turn in the production search queries (`resolveRetrievalQueries`). */
const CURRENT_QUERY = 0;

/**
 * Deduplicated union of one lexical channel per search query, filled round-robin by
 * rank as production `mergeChannels` does; only the current turn's channel sets
 * `lexicalRank`, so the combined follow-up query cannot claim the guaranteed slot.
 */
function mergeLexical(corpus: Corpus, channels: LexicalHit[][]): Map<number, Candidate> {
  const byId = new Map<number, Candidate>();
  const depth = Math.max(0, ...channels.map((hits) => hits.length));
  for (let rank = 0; rank < depth; rank++) {
    channels.forEach((hits, query) => {
      const hit = hits[rank];
      if (!hit || byId.has(hit.chunk)) {
        return;
      }
      const lexicalRank = query === CURRENT_QUERY ? hit.rank : undefined;
      byId.set(hit.chunk, { chunk: corpus.chunks[hit.chunk], lexicalRank });
    });
  }
  return byId;
}

/**
 * Candidate pool for local mode: the lexical top 20 of every production search query
 * (the current turn, plus the combined query on a follow-up) plus, in oracle mode, the
 * best-matching chunks of the documents the question was written from, so the
 * reranker always sees the gold material next to realistic distractors.
 */
export function buildCandidates(
  corpus: Corpus,
  search: string[],
  goldDocs: string[],
  oracle: boolean,
): Candidate[] {
  const byId = mergeLexical(
    corpus,
    search.map((query) => searchLexical(corpus.index, query, CHANNEL_LIMIT)),
  );
  const gold = oracle ? goldHits(corpus, search[search.length - 1] ?? '', goldDocs) : [];
  for (const hit of gold) {
    if (!byId.has(hit.chunk)) {
      byId.set(hit.chunk, { chunk: corpus.chunks[hit.chunk] });
    }
  }
  const all = [...byId.values()];
  const goldIds = new Set(gold.map((hit) => hit.chunk));
  const reserved = all.filter((candidate) => goldIds.has(candidate.chunk.id));
  const rest = all.filter((candidate) => !goldIds.has(candidate.chunk.id));
  return [...reserved, ...rest].slice(0, CANDIDATE_LIMIT);
}

function goldHits(corpus: Corpus, query: string, goldDocs: string[]): LexicalHit[] {
  if (!goldDocs.length) {
    return [];
  }
  const docs = new Set(goldDocs);
  const allowed = new Set(
    corpus.chunks.filter((chunk) => docs.has(chunk.doc)).map((chunk) => chunk.id),
  );
  const ranked = searchLexical(corpus.index, query, GOLD_CHUNKS, allowed);
  const rankedIds = new Set(ranked.map((hit) => hit.chunk));
  const unmatched = [...allowed]
    .filter((id) => !rankedIds.has(id))
    .map((chunk) => ({ chunk, score: 0, rank: Number.POSITIVE_INFINITY }));
  return [...ranked, ...unmatched].slice(0, GOLD_CHUNKS);
}

async function rerank(url: string, query: string, texts: string[]): Promise<RerankScore[]> {
  const endpoint = `${url.replace(/\/+$/, '').replace(/\/rerank$/, '')}/rerank`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, texts, truncate: true }),
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`TEI rerank returned ${response.status}`);
  }
  return (await response.json()) as RerankScore[];
}

const toPayload = (chunk: KbChunk) => ({
  text: chunk.text,
  title: chunk.title,
  source: chunk.source,
  section: chunk.section,
});

export function createLocalRetriever(
  corpus: Corpus,
  rerankUrl: string,
  oracle: boolean,
): Retriever {
  return async (queries, goldDocs) => {
    const startedAt = performance.now();
    const { search, rerank: query } = librechatApi.resolveRetrievalQueries(queries);
    const candidates = buildCandidates(corpus, search, goldDocs, oracle);
    if (!candidates.length) {
      const context = librechatApi.formatRetrievalNote('empty', query);
      return { context, result: 'empty', sources: [], elapsedMs: elapsedSince(startedAt) };
    }
    try {
      const texts = candidates.map((candidate) =>
        librechatApi.embedText(toPayload(candidate.chunk)),
      );
      const top = selectTop(candidates, await rerank(rerankUrl, query, texts));
      const result = top.length ? 'hit' : 'empty';
      const context = top.length
        ? librechatApi.formatContext(top.map(toPayload))
        : librechatApi.formatRetrievalNote(result, query);
      const sources = top.map((chunk) => chunk.source);
      return { context, result, sources, elapsedMs: elapsedSince(startedAt) };
    } catch {
      const context = librechatApi.formatRetrievalNote('error', query);
      return { context, result: 'error', sources: [], elapsedMs: elapsedSince(startedAt) };
    }
  };
}

/** Production retrieval end to end (TEI embed → Qdrant hybrid → TEI rerank), as shipped. */
export function createLiveRetriever(): Retriever {
  return async (queries) => {
    const retrieval = await librechatApi.retrieveKbContextDetailed(queries);
    const context =
      retrieval.context ??
      librechatApi.formatRetrievalNote(retrieval.result, queries.retrievalQuery);
    return {
      context,
      result: retrieval.result,
      sources: contextSources(retrieval.context),
      elapsedMs: retrieval.elapsedMs,
    };
  };
}

/** Live mode needs Qdrant's `kb` collection; anything else falls back to local mode. */
export async function probeQdrant(env: EvalEnv): Promise<boolean> {
  if (!env.QDRANT_URL || !env.TEI_EMBEDDINGS_URL || !env.TEI_RERANK_URL) {
    return false;
  }
  try {
    const response = await fetch(`${env.QDRANT_URL.replace(/\/+$/, '')}/collections/kb`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveMode(
  requested: RetrievalMode | 'auto',
  env: EvalEnv,
): Promise<RetrievalMode> {
  if (requested !== 'auto') {
    return requested;
  }
  return (await probeQdrant(env)) ? 'live' : 'local';
}
