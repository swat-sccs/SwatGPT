import type { TMessage } from 'librechat-data-provider';

export type KbQueryMessage = Partial<Pick<TMessage, 'text' | 'isCreatedByUser'>>;

export interface KbQueries {
  /** The latest user turn verbatim — the input for directory lookup and the usage ledger. */
  userText: string;
  /** The KB retrieval query: `userText`, prefixed with the previous user turn for short follow-ups. */
  retrievalQuery: string;
}

/** Follow-ups at or above this word count are treated as self-contained. */
const SELF_CONTAINED_WORDS = 12;
/** Upper bound on characters carried over from the previous user turn. */
const PREVIOUS_TURN_CHARS = 300;

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Returns the texts of the latest two user turns, newest first, in a single backward scan. */
function latestUserTexts(messages: KbQueryMessage[]): [string | undefined, string | undefined] {
  let current: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.isCreatedByUser !== true) {
      continue;
    }
    const text = message.text ?? '';
    if (current !== undefined) {
      return [current, text];
    }
    current = text;
  }
  return [current, undefined];
}

/**
 * Derives the KB and directory queries from an ordered conversation branch.
 * Both are anchored on the latest *user* turn, so a Continue (where the branch ends
 * on an assistant message) still queries with the user's question. Short follow-ups
 * ("what about weekends?") get the tail of the previous user turn prepended so
 * retrieval keeps the entity they refer to; assistant text is never included.
 */
export function buildKbQueries(messages: KbQueryMessage[]): KbQueries {
  const [current, previous] = latestUserTexts(messages);
  const userText = (current ?? '').trim();
  const context = previous?.trim().slice(-PREVIOUS_TURN_CHARS).trim();
  if (!userText || !context || countWords(userText) >= SELF_CONTAINED_WORDS) {
    return { userText, retrievalQuery: userText };
  }
  return { userText, retrievalQuery: `${context}\n${userText}` };
}
