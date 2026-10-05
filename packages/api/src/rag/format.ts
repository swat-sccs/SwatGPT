import type { KbPayload } from './search';

const CONTEXT_HEADING = '# Swarthmore College knowledge base context';
const CONTEXT_INSTRUCTION =
  "Answer from this context when it is relevant to the user's question, and cite the source URLs of the entries you use.";

const location = (chunk: KbPayload, separator: string): string =>
  chunk.section ? `${chunk.title}${separator}${chunk.section}` : chunk.title;

/** Rebuilds the exact text the ingest pipeline embedded (ingest.py `embed_text`). */
export const embedText = (chunk: KbPayload): string => `${location(chunk, ' › ')}\n\n${chunk.text}`;

function formatEntry(chunk: KbPayload, position: number): string {
  return `[${position}] ${location(chunk, ' — ')} (${chunk.source})\n${chunk.text}`;
}

export function formatContext(chunks: KbPayload[]): string {
  const entries = chunks.map((chunk, index) => formatEntry(chunk, index + 1));
  return [CONTEXT_HEADING, CONTEXT_INSTRUCTION, ...entries].join('\n\n');
}
