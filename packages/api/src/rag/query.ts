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

/** Upper bound on characters sent to TEI and Qdrant per query (~250 tokens, well under the 8192-token TEI limit). */
const MAX_QUERY_CHARS = 1000;
/** Strips the partial word a tail cut lands in, unless that "word" is a long unbroken run. */
const LEADING_PARTIAL_WORD = /^\S{0,40}\s+/;

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

/** The queries one KB retrieval runs: Qdrant is searched with each `search` query, the merged pool is reranked against `rerank`. */
export interface KbRetrievalQueries {
  search: string[];
  rerank: string;
}

/**
 * Bounds a query to its last {@link MAX_QUERY_CHARS} characters, starting on a word
 * boundary. The tail is kept because a question pasted after a long document
 * (a syllabus, an essay) is what retrieval should match.
 */
export function capQuery(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_QUERY_CHARS) {
    return trimmed;
  }
  const tail = trimmed.slice(-(MAX_QUERY_CHARS + 1));
  const aligned = tail.replace(LEADING_PARTIAL_WORD, '');
  return (aligned.length <= MAX_QUERY_CHARS ? aligned : tail.slice(1)).trim();
}

/**
 * Resolves what one KB retrieval searches for. A follow-up searches with both the
 * current turn alone and the turn combined with the previous one, so a topic switch
 * ("ok, and how do I set up eduroam?") still surfaces the new topic's chunks while an
 * elliptical follow-up ("what about weekends?") keeps the entity it refers to; the
 * merged pool is reranked against the combined query. All queries are length-capped.
 */
export function resolveRetrievalQueries(queries: string | KbQueries): KbRetrievalQueries {
  const { userText, retrievalQuery } =
    typeof queries === 'string' ? { userText: queries, retrievalQuery: queries } : queries;
  const rerank = capQuery(retrievalQuery);
  const current = capQuery(userText);
  const search = current && current !== rerank ? [current, rerank] : [rerank];
  return { search, rerank };
}
