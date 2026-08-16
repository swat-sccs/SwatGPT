import { postJson, resolveEndpoint } from './http';

export interface KbPayload {
  text: string;
  title: string;
  source: string;
  section?: string;
  doc_type?: string;
  chunk_index?: number;
}

interface QdrantPoint {
  id: string | number;
  score: number;
  payload?: Partial<KbPayload>;
}

interface QdrantSearchResponse {
  result?: QdrantPoint[];
}

const SEARCH_LIMIT = 20;
const SEARCH_PATH = '/collections/kb/points/search';

function isKbPayload(payload?: Partial<KbPayload>): payload is KbPayload {
  return (
    typeof payload?.text === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.source === 'string'
  );
}

export async function searchKb(
  baseUrl: string,
  vector: number[],
  signal: AbortSignal,
): Promise<KbPayload[]> {
  const response = await postJson<QdrantSearchResponse>(
    resolveEndpoint(baseUrl, SEARCH_PATH),
    { vector, limit: SEARCH_LIMIT, with_payload: true },
    signal,
  );
  return (response.result ?? []).flatMap((point) =>
    isKbPayload(point.payload) ? [point.payload] : [],
  );
}
