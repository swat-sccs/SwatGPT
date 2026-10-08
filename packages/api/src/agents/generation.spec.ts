import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { EventHandler, MessageContentComplex } from '@librechat/agents';
import type { RecordGenerationDeps, RecordGenerationInput } from './generation';
import { formatContext, formatRetrievalNote } from '~/rag/format';
import { countTokens } from '~/utils/tokenizer';
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
    createGeneration: jest.fn().mockResolvedValue({ generation: {}, continued: false }),
    createFlag: jest.fn().mockResolvedValue({}),
    findKeywordFlags: jest.fn().mockReturnValue([]),
    ...overrides,
  };
}

const textPart = (text: string): MessageContentComplex => ({ type: 'text', text });
const toolPart = (name: string): MessageContentComplex =>
  ({ type: 'tool_call', tool_call: { name, args: '{}', id: `call_${name}` } }) as never;
const errorPart = (error: string): MessageContentComplex => ({ type: 'error', error }) as never;
const thinkPart = (think: string): MessageContentComplex => ({ type: 'think', think }) as never;

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
  it('counts the entries of a formatted KB context', () => {
    const chunk = { title: 'Dining', section: 'Sharples', source: 'https://a', text: '## not\nan entry' };
    const context = formatContext([chunk, { ...chunk, source: 'https://b' }, chunk]);
    expect(countKbChunks(context)).toBe(3);
    expect(countKbChunks(undefined)).toBe(0);
    expect(countKbChunks('')).toBe(0);
  });

  it('counts nothing in a retrieval note', () => {
    expect(countKbChunks(formatRetrievalNote('empty', 'question'))).toBe(0);
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
        contentParts: [toolPart('dash_menu'), textPart('Pizza'), toolPart('dash_menu')],
        kbContext: formatContext([
          { title: 'A', source: 'https://a', text: 'x' },
          { title: 'B', source: 'https://b', text: 'y' },
        ]),
        ragMs: 120.4,
        tenantId: 't1',
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId: 'convo-1',
      messageId: 'msg-1',
      model: 'qwen3',
      promptTokens: 900,
      completionTokens: 40,
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
    expect(deps.findKeywordFlags).toHaveBeenCalledWith('What is for lunch?', 'Pizza');
    expect(deps.createFlag).not.toHaveBeenCalled();
  });

  it('prefers the retrieval chunk count over the context fallback', async () => {
    const deps = createDeps();
    await recordGeneration(deps, createInput({ ragChunks: 5, kbContext: formatContext([{ title: 'A', source: 'https://a', text: 'x' }]) }));
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ ragChunks: 5, ragMs: undefined }),
    );
  });

  it('sums the prompt of every model call in a tool-using turn', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [
          { input_tokens: 6000, output_tokens: 80, model: 'qwen3', finish_reason: 'tool_calls' },
          { input_tokens: 6200, output_tokens: 300, model: 'qwen3', finish_reason: 'stop' },
        ],
        contentParts: [toolPart('dash_search'), textPart('Answer')],
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 12200, completionTokens: 380, finishReason: 'stop' }),
    );
  });

  it('counts cache tokens the way billing does and recovers omitted reasoning output', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [
          {
            input_tokens: 1000,
            output_tokens: 10,
            provider: 'openAI',
            input_token_details: { cache_read: 800 },
          },
          {
            input_tokens: 100,
            output_tokens: 10,
            provider: 'bedrock',
            cache_read_input_tokens: 500,
          },
          { input_tokens: 50, output_tokens: 5, total_tokens: 85 },
          { input_tokens: 30, output_tokens: 4, input_token_details: { cache_read: 20 } },
        ],
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 1700, completionTokens: 59 }),
    );
  });

  it('keeps reported usage from completed calls on an aborted turn', async () => {
    const deps = createDeps();
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [
          { input_tokens: 100, output_tokens: 10 },
          { input_tokens: 400, output_tokens: 7, usage_type: 'subagent' },
          { input_tokens: 130, output_tokens: 20 },
        ],
        estimatedPromptTokens: 90,
        aborted: true,
        timing: { startedAt: 1_000, firstTokenAt: null },
      }),
    );
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 230,
        completionTokens: 30,
        model: 'agent-model',
        status: 'aborted',
        ttftMs: undefined,
        durationMs: 2000,
      }),
    );
  });

  it('estimates tokens for an aborted turn whose stream never reported usage', async () => {
    const deps = createDeps();
    const reasoning = 'Let me think about the dining hours at Sharples for a moment.';
    const answer = 'Sharples opens at 7:30 on weekdays and closes at 8 in the evening.';
    await recordGeneration(
      deps,
      createInput({
        collectedUsage: [],
        estimatedPromptTokens: 5400,
        contentParts: [thinkPart(reasoning), textPart(answer)],
        aborted: true,
      }),
    );
    const streamed = await countTokens(`${reasoning}\n${answer}`);
    expect(streamed).toBeGreaterThan(await countTokens(answer));
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: 5400,
        completionTokens: streamed,
        status: 'aborted',
      }),
    );
    expect(deps.findKeywordFlags).toHaveBeenCalledWith('What is for lunch?', answer);
  });

  it('ignores the prompt estimate on a completed turn', async () => {
    const deps = createDeps();
    await recordGeneration(deps, createInput({ estimatedPromptTokens: 5400 }));
    expect(deps.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 0, completionTokens: 0, status: 'ok' }),
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

  it('forwards a temporary conversation expiry to the ledger row and its flags', async () => {
    const expiredAt = new Date('2026-11-01T00:00:00Z');
    const deps = createDeps({ findKeywordFlags: jest.fn().mockReturnValue(['self-harm']) });
    await recordGeneration(deps, createInput({ expiredAt }));
    expect(deps.createGeneration).toHaveBeenCalledWith(expect.objectContaining({ expiredAt }));
    expect(deps.createFlag).toHaveBeenCalledWith(expect.objectContaining({ expiredAt }));
  });

  it('omits expiry for a permanent conversation', async () => {
    const deps = createDeps({ findKeywordFlags: jest.fn().mockReturnValue(['self-harm']) });
    await recordGeneration(deps, createInput({ expiredAt: null }));
    const [ledgerRow] = (deps.createGeneration as jest.Mock).mock.calls[0];
    const [flag] = (deps.createFlag as jest.Mock).mock.calls[0];
    expect(ledgerRow.expiredAt).toBeUndefined();
    expect(flag.expiredAt).toBeUndefined();
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

    const flagFailure = createDeps({
      findKeywordFlags: jest.fn().mockReturnValue(['x']),
      createFlag: jest.fn().mockRejectedValue(new Error('flag down')),
    });
    await expect(recordGeneration(flagFailure, createInput())).resolves.toBeUndefined();
    expect(flagFailure.createGeneration).toHaveBeenCalledTimes(1);
  });

  it('still screens the exchange when the ledger write fails', async () => {
    const deps = createDeps({
      createGeneration: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 })),
      findKeywordFlags: jest.fn().mockReturnValue(['weapons']),
    });
    await expect(recordGeneration(deps, createInput())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      '[recordGeneration] Failed to record generation',
      expect.objectContaining({ code: 11000 }),
    );
    expect(deps.findKeywordFlags).toHaveBeenCalledWith('What is for lunch?', 'Hello there');
    expect(deps.createFlag).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-1', reason: 'weapons', source: 'keyword' }),
    );
  });

  it('screens only the new response text on a continued run', async () => {
    const deps = createDeps({
      createGeneration: jest.fn().mockResolvedValue({ generation: {}, continued: true }),
      findKeywordFlags: jest.fn().mockReturnValue(['weapons']),
    });
    await recordGeneration(deps, createInput({ contentParts: [textPart('more text')] }));
    expect(deps.findKeywordFlags).toHaveBeenCalledWith('', 'more text');
    expect(deps.createFlag).toHaveBeenCalledTimes(1);
  });

  it('never throws when keyword screening itself fails', async () => {
    const deps = createDeps({
      findKeywordFlags: jest.fn().mockImplementation(() => {
        throw new Error('bad pattern');
      }),
    });
    await expect(recordGeneration(deps, createInput())).resolves.toBeUndefined();
    expect(deps.createGeneration).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[recordGeneration] Failed to screen generation',
      expect.any(Error),
    );
  });
});
