import { logger } from '@librechat/data-schemas';
import type { RerankResult } from './rerank';
import type { KbPayload } from './search';
import { retrieveKbContext } from './retrieve';

const EMBEDDINGS_URL = 'http://tei-embed.test';
const RERANK_URL = 'http://tei-rerank.test';
const QDRANT_URL = 'http://qdrant.test';
const QUERY = 'how do I connect to eduroam?';

interface QdrantHit {
  id: number;
  score: number;
  payload: Partial<KbPayload>;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as Response;
}

function kbHit(index: number): QdrantHit {
  return {
    id: index,
    score: 0.9 - index * 0.01,
    payload: {
      text: `Chunk text ${index}`,
      title: `Title ${index}`,
      section: `Section ${index}`,
      source: `https://kb.swarthmore.edu/wiki/Article_${index}`,
      doc_type: 'kb',
      chunk_index: index,
    },
  };
}

describe('retrieveKbContext', () => {
  let fetchMock: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.TEI_EMBEDDINGS_URL = EMBEDDINGS_URL;
    process.env.TEI_RERANK_URL = RERANK_URL;
    process.env.QDRANT_URL = QDRANT_URL;
    fetchMock = jest.spyOn(globalThis, 'fetch');
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    delete process.env.TEI_EMBEDDINGS_URL;
    delete process.env.TEI_RERANK_URL;
    delete process.env.QDRANT_URL;
    jest.useRealTimers();
  });

  function mockServices(options: {
    embedding?: number[];
    hits?: QdrantHit[];
    scores?: RerankResult[];
    searchResponse?: Response;
    rerankResponse?: Response;
    embeddingsResponse?: Response;
  }): void {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/v1/embeddings')) {
        return (
          options.embeddingsResponse ??
          jsonResponse({ data: [{ embedding: options.embedding ?? [0.1, 0.2, 0.3] }] })
        );
      }
      if (url.includes('/points/search')) {
        return options.searchResponse ?? jsonResponse({ result: options.hits ?? [] });
      }
      if (url.includes('/rerank')) {
        return options.rerankResponse ?? jsonResponse(options.scores ?? []);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
  }

  function requestBody(callIndex: number): Record<string, unknown> {
    const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
  }

  describe('happy path', () => {
    const hits = [0, 1, 2, 3, 4, 5, 6].map(kbHit);
    const scores: RerankResult[] = [
      { index: 2, score: 0.9 },
      { index: 6, score: 0.95 },
      { index: 4, score: 0.7 },
      { index: 0, score: 0.8 },
      { index: 3, score: 0.5 },
      { index: 1, score: 0.6 },
      { index: 5, score: 0.1 },
    ];

    it('reorders results by rerank score and formats the top 5', async () => {
      mockServices({ hits, scores });
      const context = await retrieveKbContext(QUERY);

      expect(context).toBeDefined();
      expect(context).toContain('# Swarthmore College knowledge base context');
      expect(context).toContain('cite the source URLs');
      expect(context).toContain(
        '[1] Title 6 — Section 6 (https://kb.swarthmore.edu/wiki/Article_6)\nChunk text 6',
      );
      expect(context).toContain('[2] Title 2 — Section 2');
      expect(context).toContain('[3] Title 0 — Section 0');
      expect(context).toContain('[4] Title 4 — Section 4');
      expect(context).toContain('[5] Title 1 — Section 1');
      expect(context).not.toContain('Title 3');
      expect(context).not.toContain('Title 5');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('sends the expected wire requests to all three services', async () => {
      mockServices({ hits, scores, embedding: [0.5, 0.6] });
      await retrieveKbContext(`  ${QUERY}  `);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(String(fetchMock.mock.calls[0][0])).toBe(`${EMBEDDINGS_URL}/v1/embeddings`);
      expect(requestBody(0)).toEqual({ model: 'gte-modernbert-base', input: QUERY });

      expect(String(fetchMock.mock.calls[1][0])).toBe(`${QDRANT_URL}/collections/kb/points/search`);
      expect(requestBody(1)).toEqual({ vector: [0.5, 0.6], limit: 20, with_payload: true });

      expect(String(fetchMock.mock.calls[2][0])).toBe(`${RERANK_URL}/rerank`);
      expect(requestBody(2)).toEqual({
        query: QUERY,
        texts: hits.map((hit) => hit.payload.text),
      });
    });

    it('accepts base URLs that already include the service path', async () => {
      process.env.TEI_EMBEDDINGS_URL = `${EMBEDDINGS_URL}/v1/embeddings`;
      process.env.TEI_RERANK_URL = `${RERANK_URL}/rerank`;
      mockServices({ hits, scores });
      await retrieveKbContext(QUERY);

      expect(String(fetchMock.mock.calls[0][0])).toBe(`${EMBEDDINGS_URL}/v1/embeddings`);
      expect(String(fetchMock.mock.calls[2][0])).toBe(`${RERANK_URL}/rerank`);
    });
  });

  describe('score floor', () => {
    it('returns undefined when no rerank score reaches the floor', async () => {
      mockServices({
        hits: [0, 1, 2].map(kbHit),
        scores: [
          { index: 0, score: 0.29 },
          { index: 1, score: 0.1 },
          { index: 2, score: 0.05 },
        ],
      });
      await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('fail-open behavior', () => {
    it('returns undefined and warns when the embeddings service is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('returns undefined and warns when Qdrant responds non-2xx', async () => {
      mockServices({ searchResponse: errorResponse(500) });
      await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('status 500'));
    });

    it('returns undefined and warns when the rerank service fails', async () => {
      mockServices({
        hits: [0, 1].map(kbHit),
        rerankResponse: errorResponse(503),
      });
      await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('returns undefined and warns when the total time budget elapses', async () => {
      jest.useFakeTimers();
      fetchMock.mockImplementation(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('This operation was aborted')),
            );
          }),
      );
      const pending = retrieveKbContext(QUERY);
      await jest.advanceTimersByTimeAsync(1500);
      await expect(pending).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('returns undefined without warning when Qdrant returns no hits', async () => {
      mockServices({ hits: [] });
      await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('feature off', () => {
    it.each(['TEI_EMBEDDINGS_URL', 'TEI_RERANK_URL', 'QDRANT_URL'])(
      'returns undefined without fetching when %s is unset',
      async (name) => {
        delete process.env[name];
        await expect(retrieveKbContext(QUERY)).resolves.toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('trivial queries', () => {
    it.each(['', '   ', '\n\t '])(
      'returns undefined without fetching for whitespace query %j',
      async (query) => {
        await expect(retrieveKbContext(query)).resolves.toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });
});
