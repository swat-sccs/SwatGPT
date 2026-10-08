import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDotenv } from '../lib/env.ts';

describe('parseDotenv', () => {
  it('keeps only the keys the eval needs and strips quotes', () => {
    const env = parseDotenv(
      [
        'MONGO_URI=mongodb://secret',
        'VLLM_API_KEY="abc"',
        '# QDRANT_URL=http://x',
        'TEI_RERANK_URL=http://loon:8002',
        'QDRANT_URL=',
      ].join('\n'),
    );
    assert.deepEqual(env, { VLLM_API_KEY: 'abc', TEI_RERANK_URL: 'http://loon:8002' });
  });
});
