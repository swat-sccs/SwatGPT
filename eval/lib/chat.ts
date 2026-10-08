import type { ChatMessage, Completion, GenerationParams } from './types.ts';

const REQUEST_TIMEOUT_MS = 180_000;

interface StreamDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
}

interface StreamChunk {
  choices?: { delta?: StreamDelta; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export interface StreamState {
  text: string;
  ttftMs?: number;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}

/** Folds one SSE `data:` payload into the stream state; returns false on `[DONE]`. */
export function applySseData(state: StreamState, data: string, elapsedMs: number): boolean {
  if (data === '[DONE]') {
    return false;
  }
  const chunk = JSON.parse(data) as StreamChunk;
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content;
  if (content) {
    state.ttftMs ??= elapsedMs;
    state.text += content;
  }
  if (choice?.finish_reason) {
    state.finishReason = choice.finish_reason;
  }
  if (chunk.usage) {
    state.promptTokens = chunk.usage.prompt_tokens;
    state.completionTokens = chunk.usage.completion_tokens;
  }
  return true;
}

function requestBody(params: GenerationParams, messages: ChatMessage[]): string {
  return JSON.stringify({
    model: params.model,
    temperature: params.temperature,
    top_p: params.top_p,
    top_k: params.top_k,
    max_tokens: params.max_tokens,
    chat_template_kwargs: params.chat_template_kwargs,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });
}

/**
 * Streams one chat completion from the OpenAI-compatible vLLM endpoint and measures
 * time to first content token and total latency. The API key only goes in the header.
 */
export async function streamCompletion(
  params: GenerationParams,
  apiKey: string,
  messages: ChatMessage[],
): Promise<Completion> {
  const startedAt = performance.now();
  const elapsed = (): number => performance.now() - startedAt;
  const response = await fetch(`${params.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: requestBody(params, messages),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`vLLM returned ${response.status}: ${detail}`);
  }
  const state: StreamState = { text: '' };
  const decoder = new TextDecoder();
  let buffer = '';
  let open = true;
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : '';
      if (open && data) {
        open = applySseData(state, data, elapsed());
      }
    }
  }
  return {
    text: state.text,
    ttftMs: state.ttftMs,
    totalMs: elapsed(),
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    finishReason: state.finishReason,
  };
}
