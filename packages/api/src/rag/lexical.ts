export interface SparseQuery {
  indices: number[];
  values: number[];
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MIN_TOKEN_LENGTH = 2;
const TOKEN_PATTERN = /[a-z0-9]+/g;

/**
 * FNV-1a 32-bit hash over ASCII tokens. Must stay byte-identical to the
 * tokenizer in `ingest/ingest.py` — both sides map tokens to the same
 * sparse indices in Qdrant.
 */
function fnv1a(token: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < token.length; i++) {
    hash = Math.imul(hash ^ token.charCodeAt(i), FNV_PRIME);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  return tokens.filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

export function buildSparseQuery(query: string): SparseQuery | undefined {
  const counts = new Map<number, number>();
  for (const token of tokenize(query)) {
    const id = fnv1a(token);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (!counts.size) {
    return undefined;
  }
  return { indices: [...counts.keys()], values: [...counts.values()] };
}
