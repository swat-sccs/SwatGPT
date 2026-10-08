import { postJson, resolveEndpoint } from './http';

interface TeiEmbedding {
  embedding: number[];
}

interface TeiEmbeddingsResponse {
  data: TeiEmbedding[];
}

const EMBEDDINGS_MODEL = 'gte-modernbert-base';
const EMBEDDINGS_PATH = '/v1/embeddings';

/** Embeds every query in one TEI batch request; vectors are returned in input order. */
export async function embedQueries(
  baseUrl: string,
  queries: string[],
  signal: AbortSignal,
): Promise<number[][]> {
  const response = await postJson<TeiEmbeddingsResponse>(
    resolveEndpoint(baseUrl, EMBEDDINGS_PATH),
    { model: EMBEDDINGS_MODEL, input: queries },
    signal,
  );
  const embeddings = (response.data ?? []).map((entry) => entry.embedding);
  if (embeddings.length !== queries.length || embeddings.some((vector) => !vector?.length)) {
    throw new Error(
      `TEI embeddings response did not contain one embedding per query (${embeddings.length} for ${queries.length})`,
    );
  }
  return embeddings;
}
