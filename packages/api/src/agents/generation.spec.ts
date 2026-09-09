import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { EventHandler, MessageContentComplex } from '@librechat/agents';
import type { RecordGenerationDeps, RecordGenerationInput } from './generation';
import {
  countKbChunks,
  recordGeneration,
  createGenerationTiming,
  createFirstTokenTimingHandlers,
} from './generation';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function createDeps(overrides: Partial<RecordGenerationDeps> = {}): RecordGenerationDeps {
  return {
    createGeneration: jest.fn().mockResolvedValue({}),
    createFlag: jest.fn().mockResolvedValue({}),
    findKeywordFlags: jest.fn().mockReturnValue([]),
    ...overrides,
  };
}

const textPart = (text: string): MessageContentComplex => ({ type: 'text', text });
const toolPart = (name: string): MessageContentComplex =>
  ({ type: 'tool_call', tool_call: { name, args: '{}', id: `call_${name}` } }) as never;
const errorPart = (error: string): MessageContentComplex => ({ type: 'error', error }) as never;

function createInput(overrides: Partial<RecordGenerationInput> = {}): RecordGenerationInput {
  return {
    user: 'user-1',
    conversationId: 'convo-1',
    messageId: 'msg-1',
    model: 'agent-model',
    collectedUsage: [],
    contentParts: [textPart('Hello there')],
    userText: 'What is for lunch?',
    timing: { startedAt: 1_000, firstTokenAt: 1_250 },
    endedAt: 3_000,
    aborted: false,
    ...overrides,
  };
}

describe('createFirstTokenTimingHandlers', () => {
  it('stamps firstTokenAt once on the first delta and delegates to the wrapped handler', async () => {
    const timing = createGenerationTiming();
    const inner = { handle: jest.fn() };
    const other = { handle: jest.fn() };
    const handlers: Record<string, EventHandler> = {
      [GraphEvents.ON_MESSAGE_DELTA]: inner,
      [GraphEvents.ON_REASONING_DELTA]: inner,
      [GraphEvents.ON_RUN_STEP]: other,
    };
    const wrapped = createFirstTokenTimingHandlers(handlers, timing);
    expect(wrapped).not.toBe(handlers);
    expect(wrapped?.[GraphEvents.ON_RUN_STEP]).toBe(other);

    const spy = jest.spyOn(Date, 'now').mockReturnValueOnce(500).mockReturnValueOnce(900);
    await wrapped?.[GraphEvents.ON_REASONING_DELTA].handle('a', undefined, undefined, undefined);
    await wrapped?.[GraphEvents.ON_MESSAGE_DELTA].handle('b', undefined, undefined, undefined);
    spy.mockRestore();

    expect(timing.firstTokenAt).toBe(500);
    expect(inner.handle).toHaveBeenCalledTimes(2);
    expect(inner.handle).toHaveBeenNthCalledWith(1, 'a', undefined, undefined, undefined);
  });

  it('passes undefined handlers through', () => {
    expect(createFirstTokenTimingHandlers(undefined, createGenerationTiming())).toBeUndefined();
  });
});

describe('countKbChunks', () => {
  it('counts numbered KB entries', () => {
    const context = [
      '# Swarthmore College knowledge base context',
      '[1] Dining — Sharples (https://a)\nText [2] not an entry',
      '[2] Library (https://b)\nMore',
      '[10] Registrar (https://c)\nMore',
    ].join('\n\n');
    expect(countKbChunks(context)).toBe(3);
    expect(countKbChunks(undefined)).toBe(0);
    expect(countKbChunks('')).toBe(0);
  });
});

describe('recordGeneration', () => {
  it('records a successful generation with tokens, timing, tools, and retrieval', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [
          { input_tokens: 900, output_tokens: 40, model: 'qwen3', finish_reason: 'stop' },
          { input_tokens: 10, output_tokens: 5, usage_type: 'summarization' },
        ],
        usage: { input_tokens: 950, output_tokens: 42 },
        contentParts: [toolPart('dash_menu'), textPart('Pizza'), toolPart('dash_menu')],
        kbContext: '[1] A (https://a)\nx\n\n[2] B (https://b)\ny',
        ragMs: 120.4,
        tenantId: 't1',
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId: 'convo-1',
      messageId: 'msg-1',
      model: 'qwen3',
      promptTokens: 950,
      completionTokens: 42,
      ttftMs: 250,
      durationMs: 2000,
      finishReason: 'stop',
      toolCalls: ['dash_menu', 'dash_menu'],
      ragChunks: 2,
      ragMs: 120,
      status: 'ok',
      errorType: undefined,
      tenantId: 't1',
    });
    expect(deps.findKeywordFlags).toHaveBeenCalledWith('What is for lunch?\nPizza');
    expect(deps.createFlag).not.toHaveBeenCalled();
  });

  it('prefers the retrieval chunk count over the context fallback', async () => {
    const deps = createDeps();
    await recordGeneration(deps, createInput({ ragChunks: 5, kbContext: '[1] A (https://a)' }));
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ ragChunks: 5, ragMs: undefined }),
    );
  });

  it('falls back to summing primary usage when no authoritative usage exists', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [
          { input_tokens: 100, output_tokens: 10 },
          { input_tokens: 400, output_tokens: 7, usage_type: 'subagent' },
          { input_tokens: 130, output_tokens: 20 },
        ],
        aborted: true,
        timing: { startedAt: 1_000, firstTokenAt: null },
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 100,
        completionTokens: 30,
        model: 'agent-model',
        status: 'aborted',
        ttftMs: undefined,
        durationMs: 2000,
      }),
    );
  });

  it('marks thrown errors with a short error type', async () => {
    const deps = createDeps();
    const error = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    await recordGeneration(deps, createInput({ error }));
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorType: 'ECONNRESET' }),
    );
    await recordGeneration(deps, createInput({ error: new TypeError('bad') }));
    expect(deps.createGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', errorType: 'TypeError' }),
    );
  });

  it('derives the error type from an error content part', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({ contentParts: [errorPart(JSON.stringify({ type: 'refusal', info: {} }))] }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorType: 'refusal' }),
    );
    await recordGeneration(deps, createInput({ contentParts: [errorPart('plain failure')] }));
    expect(deps.createGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', errorType: 'response_error' }),
    );
  });

  it('creates one keyword flag per matched reason', async () => {
    const deps = createDeps({
      findKeywordFlags: jest.fn().mockReturnValue(['self-harm', 'weapons']),
    });
    await recordGeneration(deps, createInput({ tenantId: 't1' }));
    expect(deps.createFlag).toHaveBeenCalledTimes(2);
    expect(deps.createFlag).toHaveBeenCalledWith({
      conversationId: 'convo-1',
      messageId: 'msg-1',
      user: 'user-1',
      reason: 'self-harm',
      source: 'keyword',
      tenantId: 't1',
    });
  });

  it('skips when identifiers are missing and never throws on failures', async () => {
    const skipped = createDeps();
    await recordGeneration(skipped, createInput({ messageId: undefined }));
    expect(skipped.createGeneration).not.toHaveBeenCalled();

    const failing = createDeps({
      createGeneration: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(recordGeneration(failing, createInput())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      '[recordGeneration] Failed to record generation',
      expect.any(Error),
    );

    const duplicate = createDeps({
      createGeneration: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 })),
    });
    await expect(recordGeneration(duplicate, createInput())).resolves.toBeUndefined();

    const flagFailure = createDeps({
      findKeywordFlags: jest.fn().mockReturnValue(['x']),
      createFlag: jest.fn().mockRejectedValue(new Error('flag down')),
    });
    await expect(recordGeneration(flagFailure, createInput())).resolves.toBeUndefined();
    expect(flagFailure.createGeneration).toHaveBeenCalledTimes(1);
  });
});
