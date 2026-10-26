import { postJson, resolveEndpoint } from './http';

interface TeiEmbedding {
  /** Position of the input this vector belongs to; TEI does not promise input order. */
  index: number;
  embedding: number[];
}

interface TeiEmbeddingsResponse {
  data: TeiEmbedding[];
}

const EMBEDDINGS_MODEL = 'gte-modernbert-base';
const EMBEDDINGS_PATH = '/v1/embeddings';

/** Embeds every query in one TEI batch request; vectors are returned in input order (sorted by `index`, as ingest.py does). */
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
  const embeddings = [...(response.data ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.embedding);
  if (embeddings.length !== queries.length || embeddings.some((vector) => !vector?.length)) {
    throw new Error(
      `TEI embeddings response did not contain one embedding per query (${embeddings.length} for ${queries.length})`,
    );
  }
  return embeddings;
}
