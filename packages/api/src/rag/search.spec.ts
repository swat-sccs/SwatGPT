import type { SparseQuery } from './lexical';
import { searchKb } from './search';

const QDRANT_URL = 'http://qdrant.test';

interface QdrantRequest {
  using: 'dense' | 'sparse';
  query: number[] | SparseQuery;
}

interface Hit {
  id: number;
  score: number;
  payload: { text: string; title: string; source: string };
}

const hit = (id: number): Hit => ({
  id,
  score: 1,
  payload: { text: `text ${id}`, title: `Title ${id}`, source: `https://kb.test/${id}` },
});

const sparse = (seed: number): SparseQuery => ({ indices: [seed], values: [1] });

describe('searchKb', () => {
  let fetchMock: jest.SpyInstance;

  function mockQdrant(hits: (body: QdrantRequest) => Hit[]): void {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as QdrantRequest;
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: { points: hits(body) } }),
        } as Response;
      });
  }

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('records lexical ranks from the current turn only, not the combined follow-up query', async () => {
    mockQdrant(({ using, query }) => {
      if (using === 'dense') {
        return [hit(0), hit(1)];
      }
      return (query as SparseQuery).indices[0] === 1 ? [hit(10), hit(11)] : [hit(20), hit(10)];
    });
    const candidates = await searchKb(
      QDRANT_URL,
      [
        { vector: [0.1], sparse: sparse(1) },
        { vector: [0.2], sparse: sparse(2) },
      ],
      new AbortController().signal,
    );

    const ranks = new Map(
      candidates.map(({ payload, lexicalRank }) => [payload.title, lexicalRank]),
    );
    expect(ranks.get('Title 10')).toBe(1);
    expect(ranks.get('Title 11')).toBe(2);
    expect(ranks.get('Title 20')).toBeUndefined();
    expect(ranks.get('Title 0')).toBeUndefined();
    expect(candidates.map(({ payload }) => payload.title)).toEqual([
      'Title 0',
      'Title 10',
      'Title 20',
      'Title 1',
      'Title 11',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps the current turn lexical rank of a hit the combined query also returns', async () => {
    mockQdrant(({ using, query }) => {
      if (using === 'dense') {
        return [];
      }
      return (query as SparseQuery).indices[0] === 1 ? [hit(5), hit(6)] : [hit(6)];
    });
    const candidates = await searchKb(
      QDRANT_URL,
      [
        { vector: [0.1], sparse: sparse(1) },
        { vector: [0.2], sparse: sparse(2) },
      ],
      new AbortController().signal,
    );

    expect(candidates.map(({ payload, lexicalRank }) => [payload.title, lexicalRank])).toEqual([
      ['Title 5', 1],
      ['Title 6', 2],
    ]);
  });

  it('skips the sparse request for a query without lexical tokens', async () => {
    mockQdrant(() => [hit(0)]);
    const candidates = await searchKb(
      QDRANT_URL,
      [{ vector: [0.1] }],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(candidates).toEqual([{ payload: hit(0).payload, lexicalRank: undefined }]);
  });
});
