import type { KbPayload } from './search';

const CONTEXT_HEADING = '# Swarthmore College knowledge base context';
const CONTEXT_INSTRUCTION =
  "Answer from this context when it is relevant to the user's question, and cite the source URLs of the entries you use.";

function formatEntry(chunk: KbPayload, position: number): string {
  const location = chunk.section ? `${chunk.title} — ${chunk.section}` : chunk.title;
  return `[${position}] ${location} (${chunk.source})\n${chunk.text}`;
}

export function formatContext(chunks: KbPayload[]): string {
  const entries = chunks.map((chunk, index) => formatEntry(chunk, index + 1));
  return [CONTEXT_HEADING, CONTEXT_INSTRUCTION, ...entries].join('\n\n');
}
