import type { TAdminConversationDetail } from 'librechat-data-provider';
import type { Response } from 'express';

const JSONL_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

/** Keeps the download name to a safe character set regardless of the stored id. */
export function exportFilename(conversationId: string): string {
  const safe = conversationId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'conversation';
  return `${safe}.jsonl`;
}

/**
 * Streams one JSONL record per line: the conversation summary (with its flags)
 * first, then every message in chronological order.
 */
export function writeConversationJsonl(res: Response, detail: TAdminConversationDetail): Response {
  res.setHeader('Content-Type', JSONL_CONTENT_TYPE);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${exportFilename(detail.conversation.conversationId)}"`,
  );
  res.write(
    `${JSON.stringify({ type: 'conversation', ...detail.conversation, flags: detail.flags })}\n`,
  );
  for (const message of detail.messages) {
    res.write(`${JSON.stringify({ type: 'message', ...message })}\n`);
  }
  res.end();
  return res;
}
