import { embedQueries } from './embed';

const URL = 'http://tei-embed.test';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('embedQueries', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('orders the vectors by the response index, not by position', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { index: 1, embedding: [0.2] },
          { index: 0, embedding: [0.1] },
        ],
      }),
    );
    const vectors = await embedQueries(URL, ['first', 'second'], new AbortController().signal);

    expect(vectors).toEqual([[0.1], [0.2]]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${URL}/v1/embeddings`);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      model: 'gte-modernbert-base',
      input: ['first', 'second'],
    });
  });

  it('rejects a response with fewer vectors than queries', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ index: 0, embedding: [0.1] }] }));
    await expect(embedQueries(URL, ['a', 'b'], new AbortController().signal)).rejects.toThrow(
      'one embedding per query (1 for 2)',
    );
  });

  it('rejects an empty vector', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ index: 0, embedding: [] }] }));
    await expect(embedQueries(URL, ['a'], new AbortController().signal)).rejects.toThrow(
      'one embedding per query',
    );
  });
});
