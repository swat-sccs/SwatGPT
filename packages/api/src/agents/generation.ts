import { GraphEvents } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { ContentTypes } from 'librechat-data-provider';
import type { EventHandler, MessageContentComplex } from '@librechat/agents';
import type { GenerationMethods, FlagMethods, GenerationStatus } from '@librechat/data-schemas';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';

const MAX_ERROR_TYPE_LENGTH = 64;
const FALLBACK_MODEL = 'unknown';
const KB_ENTRY_PATTERN = /^\[\d+\] /gm;
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

/** Number of numbered KB entries in a context block built by `formatContext`. */
export function countKbChunks(context: string | undefined): number {
  return context ? (context.match(KB_ENTRY_PATTERN)?.length ?? 0) : 0;
}

export interface RecordGenerationDeps {
  createGeneration: GenerationMethods['createGeneration'];
  createFlag: FlagMethods['createFlag'];
  findKeywordFlags: (text: string) => string[];
}

type CollectedUsage = UsageMetadata & { finish_reason?: string };

export interface RecordGenerationInput {
  user: string | undefined;
  conversationId: string | undefined;
  messageId: string | undefined;
  /** Agent model; overridden by the model reported in usage when present. */
  model: string | undefined;
  collectedUsage: CollectedUsage[];
  /** Authoritative totals from `recordCollectedUsage`; absent on aborted runs. */
  usage?: { input_tokens: number; output_tokens: number };
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
}

function isPrimaryUsage(usage: CollectedUsage | null | undefined): usage is CollectedUsage {
  return usage != null && (usage.usage_type == null || usage.usage_type === 'message');
}

function sumPrimaryUsage(collected: CollectedUsage[]): {
  input_tokens: number;
  output_tokens: number;
} {
  const primary = collected.filter(isPrimaryUsage);
  const output = primary.reduce((total, usage) => total + (Number(usage.output_tokens) || 0), 0);
  return { input_tokens: Number(primary[0]?.input_tokens) || 0, output_tokens: output };
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
  errorText: string | undefined;
}

function digestContent(parts: MessageContentComplex[]): ContentDigest {
  const toolCalls: string[] = [];
  const texts: string[] = [];
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
    if (part.type === ContentTypes.ERROR) {
      const text = (part as { error?: unknown }).error;
      errorText = typeof text === 'string' ? text : '';
    }
  }
  return { toolCalls, responseText: texts.join('\n'), errorText };
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
  responseText: string,
): Promise<void> {
  const reasons = deps.findKeywordFlags(`${input.userText}\n${responseText}`);
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
      }),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('[recordGeneration] Failed to create keyword flag', result.reason);
    }
  }
}

/**
 * Writes the Generation ledger row for one assistant response and runs keyword
 * screening over the exchange. Never throws: any failure is logged and swallowed
 * so the chat path is unaffected.
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
  try {
    const { toolCalls, responseText, errorText } = digestContent(input.contentParts);
    const tokens = input.usage ?? sumPrimaryUsage(input.collectedUsage);
    const lastUsage = lastPrimaryUsage(input.collectedUsage);
    const errorType = resolveErrorType(input.error, errorText);
    const endedAt = input.endedAt ?? Date.now();
    await deps.createGeneration({
      user,
      conversationId,
      messageId,
      model: lastUsage?.model || input.model || FALLBACK_MODEL,
      promptTokens: tokens.input_tokens,
      completionTokens: tokens.output_tokens,
      ttftMs: elapsed(input.timing.startedAt, input.timing.firstTokenAt),
      durationMs: elapsed(input.timing.startedAt, endedAt),
      finishReason: lastUsage?.finish_reason,
      toolCalls,
      ragChunks: input.ragChunks ?? countKbChunks(input.kbContext),
      ragMs: input.ragMs == null ? undefined : Math.round(input.ragMs),
      status: resolveStatus(input.aborted, errorType != null),
      errorType,
      tenantId: input.tenantId,
    });
    await screenForFlags(deps, { ...input, user, conversationId, messageId }, responseText);
  } catch (error) {
    const isDuplicate = (error as { code?: unknown })?.code === 11000;
    if (isDuplicate) {
      logger.debug(`[recordGeneration] Generation already recorded for message ${messageId}`);
      return;
    }
    logger.error('[recordGeneration] Failed to record generation', error);
  }
}
