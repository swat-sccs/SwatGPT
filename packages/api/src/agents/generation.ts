import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { ContentTypes, inputTokensIncludesCache } from 'librechat-data-provider';
import type { EventHandler, MessageContentComplex } from '@librechat/agents';
import type { GenerationMethods, FlagMethods, GenerationStatus } from '@librechat/data-schemas';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import { contextEntrySources } from '~/rag/format';
import { countTokens } from '~/utils/tokenizer';

const MAX_ERROR_TYPE_LENGTH = 64;
const FALLBACK_MODEL = 'unknown';
const FIRST_TOKEN_EVENTS = [GraphEvents.ON_MESSAGE_DELTA, GraphEvents.ON_REASONING_DELTA];

/** Wall-clock marks (epoch ms) for one agent run; `null` until the event happens. */
export interface GenerationTiming {
  startedAt: number | null;
  firstTokenAt: number | null;
}

export function createGenerationTiming(): GenerationTiming {
  return { startedAt: null, firstTokenAt: null };
}

/**
 * Wraps the message/reasoning delta handlers so the first streamed token stamps
 * `timing.firstTokenAt`. Every other handler passes through untouched.
 */
export function createFirstTokenTimingHandlers(
  handlers: Record<string, EventHandler> | undefined,
  timing: GenerationTiming,
): Record<string, EventHandler> | undefined {
  if (handlers == null) {
    return handlers;
  }
  const wrapped: Record<string, EventHandler> = { ...handlers };
  for (const eventName of FIRST_TOKEN_EVENTS) {
    const handler = handlers[eventName];
    if (!handler) {
      continue;
    }
    wrapped[eventName] = {
      handle: (event, data, metadata, graph) => {
        timing.firstTokenAt ??= Date.now();
        return handler.handle(event, data, metadata, graph);
      },
    };
  }
  return wrapped;
}

/** Number of KB entries in a context block built by `formatContext`. */
export function countKbChunks(context: string | undefined): number {
  return contextEntrySources(context).length;
}

export interface RecordGenerationDeps {
  createGeneration: GenerationMethods['createGeneration'];
  createFlag: FlagMethods['createFlag'];
  findKeywordFlags: (prompt: string, reply?: string) => string[];
}

type GenerationRecord = Parameters<GenerationMethods['createGeneration']>[0];

type CollectedUsage = UsageMetadata & { finish_reason?: string };

export interface RecordGenerationInput {
  user: string | undefined;
  conversationId: string | undefined;
  messageId: string | undefined;
  /** Agent model; overridden by the model reported in usage when present. */
  model: string | undefined;
  /**
   * Usage reported for every model call of the turn. Pass a copy taken before
   * any await on the abort path: the abort middleware empties the shared array.
   */
  collectedUsage: CollectedUsage[];
  /**
   * Prompt-size estimate for the turn's first model call. Used only for an
   * aborted turn whose calls never reported usage (streams report it last).
   */
  estimatedPromptTokens?: number;
  contentParts: MessageContentComplex[];
  userText: string;
  /** Chunk count from `retrieveKbContextDetailed`; falls back to counting `kbContext` entries. */
  ragChunks?: number;
  kbContext?: string;
  ragMs?: number | null;
  timing: GenerationTiming;
  endedAt?: number;
  aborted: boolean;
  error?: unknown;
  tenantId?: string;
  /** A temporary conversation's `expiredAt`; the ledger row and any flags expire with it. */
  expiredAt?: Date | null;
}

function isPrimaryUsage(usage: CollectedUsage | null | undefined): usage is CollectedUsage {
  return usage != null && (usage.usage_type == null || usage.usage_type === 'message');
}

interface TokenTotals {
  promptTokens: number;
  completionTokens: number;
}

/** Full prompt of one call, cache included, by the same rule `splitUsage` bills with. */
function callPromptTokens(usage: CollectedUsage): number {
  const input = Number(usage.input_tokens) || 0;
  if (inputTokensIncludesCache(usage.provider)) {
    return input;
  }
  const details = usage.input_token_details;
  const cacheRead = Number(details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;
  const cacheCreation =
    Number(details?.cache_creation) ||
    Number(details?.cache_write_tokens) ||
    Number(usage.cache_creation_input_tokens) ||
    Number(usage.cache_write_tokens) ||
    0;
  return input + cacheRead + cacheCreation;
}

/** Output of one call; recovers reasoning tokens a provider left out of `output_tokens`. */
function callCompletionTokens(usage: CollectedUsage, prompt: number): number {
  const output = Number(usage.output_tokens) || 0;
  const total = Number(usage.total_tokens) || 0;
  return total > prompt + output ? total - prompt : output;
}

/**
 * Sums every primary model call of the turn. Each tool round resends the full
 * context, so the ledger counts each call's prompt (matching Transactions and
 * vLLM's prompt counter), unlike the message `tokenCount`, which keeps only the
 * first call's input.
 */
function sumPrimaryUsage(collected: CollectedUsage[]): TokenTotals & { calls: number } {
  return collected.reduce(
    (totals, usage) => {
      if (!isPrimaryUsage(usage)) {
        return totals;
      }
      const prompt = callPromptTokens(usage);
      return {
        promptTokens: totals.promptTokens + prompt,
        completionTokens: totals.completionTokens + callCompletionTokens(usage, prompt),
        calls: totals.calls + 1,
      };
    },
    { promptTokens: 0, completionTokens: 0, calls: 0 },
  );
}

async function countStreamed(text: string): Promise<number> {
  if (!text) {
    return 0;
  }
  try {
    return await countTokens(text);
  } catch (error) {
    logger.warn('[recordGeneration] Failed to count streamed tokens', error);
    return 0;
  }
}

/**
 * Token totals for the ledger. A stopped stream never reports usage for the
 * call in flight, so an aborted turn falls back to the prompt estimate and a
 * token count of the streamed text and reasoning, keeping the larger figure
 * when completed calls did report.
 */
async function resolveTokens(
  input: RecordGenerationInput,
  generatedText: string,
): Promise<TokenTotals> {
  const reported = sumPrimaryUsage(input.collectedUsage);
  if (!input.aborted) {
    return reported;
  }
  const streamed = await countStreamed(generatedText);
  return {
    promptTokens:
      reported.calls > 0 ? reported.promptTokens : Math.max(0, input.estimatedPromptTokens ?? 0),
    completionTokens: Math.max(reported.completionTokens, streamed),
  };
}

function lastPrimaryUsage(collected: CollectedUsage[]): CollectedUsage | undefined {
  for (let i = collected.length - 1; i >= 0; i--) {
    if (isPrimaryUsage(collected[i])) {
      return collected[i];
    }
  }
  return undefined;
}

function truncate(value: string): string {
  return value.length > MAX_ERROR_TYPE_LENGTH ? value.slice(0, MAX_ERROR_TYPE_LENGTH) : value;
}

function errorPartType(errorText: string): string {
  try {
    const parsed: unknown = JSON.parse(errorText);
    const type =
      parsed != null && typeof parsed === 'object'
        ? (parsed as { type?: unknown }).type
        : undefined;
    return typeof type === 'string' && type ? truncate(type) : 'response_error';
  } catch {
    return 'response_error';
  }
}

function resolveErrorType(error: unknown, errorText: string | undefined): string | undefined {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return truncate(typeof code === 'string' && code ? code : error.name || 'Error');
  }
  if (typeof error === 'string' && error) {
    return truncate(error);
  }
  if (error != null) {
    return 'Error';
  }
  return errorText == null ? undefined : errorPartType(errorText);
}

interface ContentDigest {
  toolCalls: string[];
  responseText: string;
  /** Response text plus reasoning: everything the model streamed as output. */
  generatedText: string;
  errorText: string | undefined;
}

function thinkText(part: MessageContentComplex): string | undefined {
  const think = (part as { think?: unknown }).think;
  if (typeof think === 'string') {
    return think;
  }
  const value = (think as { value?: unknown } | null | undefined)?.value;
  return typeof value === 'string' ? value : undefined;
}

function digestContent(parts: MessageContentComplex[]): ContentDigest {
  const toolCalls: string[] = [];
  const texts: string[] = [];
  const thoughts: string[] = [];
  let errorText: string | undefined;
  for (const part of parts) {
    if (part == null) {
      continue;
    }
    if (part.type === ContentTypes.TOOL_CALL) {
      const name = (part as { tool_call?: { name?: unknown } }).tool_call?.name;
      if (typeof name === 'string' && name) {
        toolCalls.push(name);
      }
      continue;
    }
    if (part.type === ContentTypes.TEXT) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') {
        texts.push(text);
      }
      continue;
    }
    if (part.type === ContentTypes.THINK) {
      const text = thinkText(part);
      if (text) {
        thoughts.push(text);
      }
      continue;
    }
    if (part.type === ContentTypes.ERROR) {
      const text = (part as { error?: unknown }).error;
      errorText = typeof text === 'string' ? text : '';
    }
  }
  const responseText = texts.join('\n');
  const generatedText = thoughts.length ? [...thoughts, responseText].join('\n') : responseText;
  return { toolCalls, responseText, generatedText, errorText };
}

function resolveStatus(aborted: boolean, hasError: boolean): GenerationStatus {
  if (aborted) {
    return 'aborted';
  }
  return hasError ? 'error' : 'ok';
}

function elapsed(from: number | null, to: number | null | undefined): number | undefined {
  if (from == null || to == null || to < from) {
    return undefined;
  }
  return to - from;
}

async function screenForFlags(
  deps: RecordGenerationDeps,
  input: RecordGenerationInput & { user: string; conversationId: string; messageId: string },
  prompt: string,
  reply: string,
): Promise<void> {
  const reasons = deps.findKeywordFlags(prompt, reply);
  if (reasons.length === 0) {
    return;
  }
  const results = await Promise.allSettled(
    reasons.map((reason) =>
      deps.createFlag({
        conversationId: input.conversationId,
        messageId: input.messageId,
        user: input.user,
        reason,
        source: 'keyword',
        tenantId: input.tenantId,
        expiredAt: input.expiredAt ?? undefined,
      }),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('[recordGeneration] Failed to create keyword flag', result.reason);
    }
  }
}

async function writeLedger(
  deps: RecordGenerationDeps,
  input: GenerationRecord,
): Promise<boolean | undefined> {
  try {
    const { continued } = await deps.createGeneration(input);
    if (continued) {
      logger.debug(`[recordGeneration] Folded continued run into message ${input.messageId}`);
    }
    return continued;
  } catch (error) {
    logger.error('[recordGeneration] Failed to record generation', error);
    return undefined;
  }
}

/**
 * Writes the Generation ledger row for one assistant response and runs keyword
 * screening over the exchange. Screening runs even when the ledger write fails;
 * on a Continue run (same messageId) only the new response text is screened,
 * since the user's turn was screened with the original run. Never throws: any
 * failure is logged and swallowed so the chat path is unaffected.
 */
export async function recordGeneration(
  deps: RecordGenerationDeps,
  input: RecordGenerationInput,
): Promise<void> {
  const { user, conversationId, messageId } = input;
  if (!user || !conversationId || !messageId) {
    logger.debug('[recordGeneration] Skipping: missing user, conversation, or message id');
    return;
  }
  let responseText = '';
  let continued: boolean | undefined;
  try {
    const digest = digestContent(input.contentParts);
    responseText = digest.responseText;
    const tokens = await resolveTokens(input, digest.generatedText);
    const lastUsage = lastPrimaryUsage(input.collectedUsage);
    const errorType = resolveErrorType(input.error, digest.errorText);
    const endedAt = input.endedAt ?? Date.now();
    continued = await writeLedger(deps, {
      user,
      conversationId,
      messageId,
      model: lastUsage?.model || input.model || FALLBACK_MODEL,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      ttftMs: elapsed(input.timing.startedAt, input.timing.firstTokenAt),
      durationMs: elapsed(input.timing.startedAt, endedAt),
      finishReason: lastUsage?.finish_reason,
      toolCalls: digest.toolCalls,
      ragChunks: input.ragChunks ?? countKbChunks(input.kbContext),
      ragMs: input.ragMs == null ? undefined : Math.round(input.ragMs),
      status: resolveStatus(input.aborted, errorType != null),
      errorType,
      tenantId: input.tenantId,
      expiredAt: input.expiredAt ?? undefined,
    });
  } catch (error) {
    logger.error('[recordGeneration] Failed to build generation record', error);
  }
  try {
    const prompt = continued ? '' : input.userText;
    await screenForFlags(deps, { ...input, user, conversationId, messageId }, prompt, responseText);
  } catch (error) {
    logger.error('[recordGeneration] Failed to screen generation', error);
  }
}
