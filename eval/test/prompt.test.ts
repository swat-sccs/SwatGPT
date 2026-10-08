import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildSystemPrompt, loadProductionConfig, parseProductionConfig } from '../lib/prompt.ts';

const FIXTURE = `
modelSpecs:
  list:
    - name: other
      preset: { endpoint: Other, model: m0, temperature: 1, top_p: 1, max_tokens: 1, promptPrefix: no }
    - name: swatgpt
      default: true
      preset:
        endpoint: SwatGPT
        model: Qwen/Qwen3.6-35B-A3B-FP8
        temperature: 0.3
        top_p: 0.8
        max_tokens: 1536
        promptPrefix: >-
          You are SwatGPT. Now: {{current_datetime}}.
endpoints:
  custom:
    - name: SwatGPT
      baseURL: http://loon.sccs.swarthmore.edu:8000/v1
      addParams:
        streamUsage: true
        top_k: 20
        chat_template_kwargs:
          enable_thinking: false
`;

describe('parseProductionConfig', () => {
  it('takes the default spec preset and its endpoint addParams, dropping LibreChat-only keys', () => {
    const config = parseProductionConfig(FIXTURE);
    assert.equal(config.promptPrefix, 'You are SwatGPT. Now: {{current_datetime}}.');
    assert.deepEqual(config.params, {
      model: 'Qwen/Qwen3.6-35B-A3B-FP8',
      baseUrl: 'http://loon.sccs.swarthmore.edu:8000/v1',
      temperature: 0.3,
      top_p: 0.8,
      top_k: 20,
      max_tokens: 1536,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('fails loudly when the endpoint is missing', () => {
    assert.throws(
      () => parseProductionConfig(FIXTURE.replace('name: SwatGPT', 'name: Renamed')),
      /custom endpoint/,
    );
  });

  it('parses the repository librechat.yaml', async () => {
    const config = await loadProductionConfig(
      join(import.meta.dirname, '..', '..', 'librechat.yaml'),
    );
    assert.match(config.promptPrefix, /SwatGPT/);
    assert.equal(config.params.chat_template_kwargs.enable_thinking, false);
  });
});

describe('buildSystemPrompt', () => {
  it('keeps the text before the date line first, then the date tail, then the KB block', () => {
    const now = new Date('2026-10-08T16:00:00Z');
    const prompt = buildSystemPrompt(
      'Stable rules.\nNow: {{current_datetime}}.',
      '# KB\n[1] x',
      now,
    );
    assert.equal(
      prompt,
      'Stable rules.\n\nNow: 2026-10-08 12:00:00 -04:00 (Thursday).\n\n# KB\n[1] x',
    );
    assert.equal(buildSystemPrompt('Hi', undefined, now), 'Hi');
  });
});
