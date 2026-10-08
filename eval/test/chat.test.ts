import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StreamState } from '../lib/chat.ts';
import { applySseData } from '../lib/chat.ts';

describe('applySseData', () => {
  it('records TTFT at the first content token, ignoring reasoning-only deltas', () => {
    const state: StreamState = { text: '' };
    applySseData(
      state,
      JSON.stringify({ choices: [{ delta: { role: 'assistant', content: '' } }] }),
      5,
    );
    applySseData(state, JSON.stringify({ choices: [{ delta: { reasoning: 'thinking' } }] }), 10);
    applySseData(state, JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] }), 20);
    applySseData(
      state,
      JSON.stringify({ choices: [{ delta: { content: ' there' }, finish_reason: 'stop' }] }),
      30,
    );
    applySseData(
      state,
      JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 3 } }),
      31,
    );
    assert.equal(applySseData(state, '[DONE]', 32), false);
    assert.deepEqual(state, {
      text: 'Hi there',
      ttftMs: 20,
      finishReason: 'stop',
      promptTokens: 900,
      completionTokens: 3,
    });
  });
});
