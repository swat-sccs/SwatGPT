import type { SparseQuery } from './lexical';
import { postJson, resolveEndpoint } from './http';

export interface KbPayload {
  text: string;
  title: string;
  source: string;
  section?: string;
  doc_type?: string;
  chunk_index?: number;
}

export interface KbCandidate {
  payload: KbPayload;
  lexicalRank?: number;
}

interface QdrantPoint {
  id: string | number;
  score: number;
  payload?: Partial<KbPayload>;
}

interface QdrantQueryResponse {
  result?: {
    points?: QdrantPoint[];
  };
}

const CHANNEL_LIMIT = 20;
/** TEI's default `max_client_batch_size` is 32 — the reranker rejects larger candidate pools. */
const CANDIDATE_LIMIT = 32;
const QUERY_PATH = '/collections/kb/points/query';

function isKbPayload(payload?: Partial<KbPayload>): payload is KbPayload {
  return (
    typeof payload?.text === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.source === 'string'
  );
}

async function queryChannel(
  baseUrl: string,
  using: 'dense' | 'sparse',
  query: number[] | SparseQuery,
  signal: AbortSignal,
): Promise<QdrantPoint[]> {
  const response = await postJson<QdrantQueryResponse>(
    resolveEndpoint(baseUrl, QUERY_PATH),
    { query, using, limit: CHANNEL_LIMIT, with_payload: true },
    signal,
  );
  return response.result?.points ?? [];
}

/** One retrieval query's inputs: its dense vector and, when it has lexical tokens, its sparse vector. */
export interface KbSearchQuery {
  vector: number[];
  sparse?: SparseQuery;
}

interface ChannelResult {
  lexical: boolean;
  points: QdrantPoint[];
}

/** Best (lowest) 1-based rank of each point across the lexical channels. */
function lexicalRanks(channels: ChannelResult[]): Map<string | number, number> {
  const ranks = new Map<string | number, number>();
  for (const { lexical, points } of channels) {
    if (!lexical) {
      continue;
    }
    points.forEach((point, index) => {
      const best = ranks.get(point.id);
      if (best === undefined || index + 1 < best) {
        ranks.set(point.id, index + 1);
      }
    });
  }
  return ranks;
}

/**
 * Deduplicated union of every channel, filled round-robin by rank so each channel
 * contributes equally to the capped pool — a lexical-only hit at rank 14 is not
 * crowded out by a full page of dense hits.
 */
function mergeChannels(channels: ChannelResult[]): KbCandidate[] {
  const ranks = lexicalRanks(channels);
  const byId = new Map<string | number, KbCandidate>();
  const depth = Math.max(0, ...channels.map(({ points }) => points.length));
  for (let rank = 0; rank < depth; rank++) {
    for (const { points } of channels) {
      if (byId.size >= CANDIDATE_LIMIT) {
        return [...byId.values()];
      }
      const point = points[rank];
      if (point && !byId.has(point.id) && isKbPayload(point.payload)) {
        byId.set(point.id, { payload: point.payload, lexicalRank: ranks.get(point.id) });
      }
    }
  }
  return [...byId.values()];
}

/**
 * Hybrid KB search: for each query, a dense (semantic) and a sparse (lexical,
 * IDF-weighted) channel, all queried in parallel and deduplicated into one
 * candidate pool for the reranker. There is no score fusion — the reranker
 * orders the pool. The lexical channel surfaces chunks whose titles or text
 * literally mention query terms (campus entities like "Cornell") even when the
 * dense channel is dominated by the topical part of the query; `lexicalRank`
 * records each candidate's best position in a lexical channel.
 */
export async function searchKb(
  baseUrl: string,
  queries: KbSearchQuery[],
  signal: AbortSignal,
): Promise<KbCandidate[]> {
  const channels = await Promise.all(
    queries.flatMap(({ vector, sparse }): Promise<ChannelResult>[] => [
      queryChannel(baseUrl, 'dense', vector, signal).then((points) => ({ lexical: false, points })),
      sparse
        ? queryChannel(baseUrl, 'sparse', sparse, signal).then((points) => ({
            lexical: true,
            points,
          }))
        : Promise.resolve({ lexical: true, points: [] }),
    ]),
  );
  return mergeChannels(channels);
}
