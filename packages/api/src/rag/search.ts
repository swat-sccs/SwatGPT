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

function mergeChannels(dense: QdrantPoint[], sparse: QdrantPoint[]): KbCandidate[] {
  const byId = new Map<string | number, KbCandidate>();
  for (const point of dense) {
    if (isKbPayload(point.payload)) {
      byId.set(point.id, { payload: point.payload });
    }
  }
  sparse.forEach((point, index) => {
    if (!isKbPayload(point.payload)) {
      return;
    }
    const existing = byId.get(point.id);
    if (existing) {
      existing.lexicalRank = index + 1;
      return;
    }
    byId.set(point.id, { payload: point.payload, lexicalRank: index + 1 });
  });
  return [...byId.values()].slice(0, CANDIDATE_LIMIT);
}

/**
 * Hybrid KB search: a dense (semantic) and a sparse (lexical, IDF-weighted)
 * channel queried in parallel, deduplicated into one candidate pool for the
 * reranker. The lexical channel surfaces chunks whose titles or text literally
 * mention query terms (campus entities like "Cornell") even when the dense
 * channel is dominated by the topical part of the query; `lexicalRank` records
 * each candidate's position in that channel.
 */
export async function searchKb(
  baseUrl: string,
  vector: number[],
  sparse: SparseQuery | undefined,
  signal: AbortSignal,
): Promise<KbCandidate[]> {
  const [dense, lexical] = await Promise.all([
    queryChannel(baseUrl, 'dense', vector, signal),
    sparse ? queryChannel(baseUrl, 'sparse', sparse, signal) : Promise.resolve([]),
  ]);
  return mergeChannels(dense, lexical);
}
