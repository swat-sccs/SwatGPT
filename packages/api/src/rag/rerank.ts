import { postJson, resolveEndpoint } from './http';

export interface RerankResult {
  index: number;
  score: number;
}

const RERANK_PATH = '/rerank';

export async function rerankChunks(
  baseUrl: string,
  query: string,
  texts: string[],
  signal: AbortSignal,
): Promise<RerankResult[]> {
  return postJson<RerankResult[]>(resolveEndpoint(baseUrl, RERANK_PATH), { query, texts }, signal);
}
