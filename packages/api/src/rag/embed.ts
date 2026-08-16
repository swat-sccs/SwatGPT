import { postJson, resolveEndpoint } from './http';

interface TeiEmbedding {
  embedding: number[];
}

interface TeiEmbeddingsResponse {
  data: TeiEmbedding[];
}

const EMBEDDINGS_MODEL = 'gte-modernbert-base';
const EMBEDDINGS_PATH = '/v1/embeddings';

export async function embedQuery(
  baseUrl: string,
  query: string,
  signal: AbortSignal,
): Promise<number[]> {
  const response = await postJson<TeiEmbeddingsResponse>(
    resolveEndpoint(baseUrl, EMBEDDINGS_PATH),
    { model: EMBEDDINGS_MODEL, input: query },
    signal,
  );
  const embedding = response.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error('TEI embeddings response contained no embedding');
  }
  return embedding;
}
