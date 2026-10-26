import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TAdminGeneration,
  TMessageContentParts,
  TAdminGenerationStatus,
  TAdminConversationMessage,
} from 'librechat-data-provider';
import type { TFeedbackTagKey } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { ReactNode } from 'react';
import { formatDate, formatInt, formatMs } from './format';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import Pill from './Pill';

const textOf = (part: TMessageContentParts): string | null => {
  if (part.type !== ContentTypes.TEXT) {
    return null;
  }
  if (typeof part.text === 'string') {
    return part.text;
  }
  return part.text?.value ?? null;
};

/** Text body: prefers explicit content parts, falling back to the legacy `text` field. */
const bodyOf = (message: TAdminConversationMessage): string => {
  const parts = message.content?.map(textOf).filter((text): text is string => text != null) ?? [];
  return parts.length > 0 ? parts.join('\n\n') : message.text;
};

type TMetaEntry = { term: TranslationKeys; value: ReactNode };

const feedbackTagKey = (key: TFeedbackTagKey): TranslationKeys => `com_ui_feedback_tag_${key}`;

const statusKeys: Record<Exclude<TAdminGenerationStatus, 'ok'>, TranslationKeys> = {
  error: 'com_admin_generation_error',
  aborted: 'com_admin_generation_aborted',
};

function Meta({ generation }: { generation: TAdminGeneration }) {
  const localize = useLocalize();
  const entries: TMetaEntry[] = [
    { term: 'com_ui_model', value: generation.model },
    {
      term: 'com_admin_col_tokens',
      value: localize('com_admin_meta_tokens', {
        0: formatInt(generation.promptTokens),
        1: formatInt(generation.completionTokens),
      }),
    },
    {
      term: 'com_admin_meta_ttft_term',
      value: localize('com_admin_meta_ttft', { 0: formatMs(generation.ttftMs) }),
    },
    {
      term: 'com_admin_meta_duration_term',
      value: localize('com_admin_meta_duration', { 0: formatMs(generation.durationMs) }),
    },
  ];
  if (generation.toolCalls.length > 0) {
    entries.push({
      term: 'com_admin_meta_tools_term',
      value: localize('com_admin_meta_tools', { 0: generation.toolCalls.join(', ') }),
    });
  }
  if (generation.ragChunks > 0) {
    entries.push({
      term: 'com_admin_meta_rag_term',
      value: localize('com_admin_meta_rag', { 0: formatInt(generation.ragChunks) }),
    });
  }
  if (generation.status !== 'ok') {
    const status = localize(statusKeys[generation.status]);
    entries.push({
      term: 'com_admin_col_status',
      value: (
        <Pill tone="destructive">
          {generation.errorType ? `${status}: ${generation.errorType}` : status}
        </Pill>
      ),
    });
  }
  return (
    <dl
      aria-label={localize('com_admin_meta_label')}
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary"
    >
      {entries.map((entry) => (
        <div key={entry.term} className="tabular-nums">
          <dt className="sr-only">{localize(entry.term)}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Message({ message }: { message: TAdminConversationMessage }) {
  const localize = useLocalize();
  const roleKey = message.isCreatedByUser ? 'com_ui_user' : 'com_ui_assistant';
  const FeedbackIcon = message.feedback?.rating === 'thumbsUp' ? ThumbsUp : ThumbsDown;
  const feedbackTag = message.feedback?.tag && localize(feedbackTagKey(message.feedback.tag.key));

  return (
    <article
      aria-label={localize(roleKey)}
      className={cn(
        'rounded-lg border p-4',
        message.isCreatedByUser
          ? 'border-border-light bg-surface-primary-alt'
          : 'border-border-medium bg-surface-primary',
      )}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <Pill>{localize(roleKey)}</Pill>
        <span>{message.sender}</span>
        <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
        {message.error && <Pill tone="destructive">{localize('com_ui_error')}</Pill>}
        {message.feedback && (
          <span
            role="img"
            aria-label={localize(
              message.feedback.rating === 'thumbsUp'
                ? 'com_admin_feedback_up'
                : 'com_admin_feedback_down',
            )}
            title={feedbackTag || undefined}
            className="ml-auto inline-flex items-center gap-1"
          >
            <FeedbackIcon className="size-4" aria-hidden="true" />
            {feedbackTag && <span className="text-text-tertiary">{feedbackTag}</span>}
            {message.feedback.text && (
              <span className="text-text-tertiary">{message.feedback.text}</span>
            )}
          </span>
        )}
      </header>
      <p className="whitespace-pre-wrap break-words text-sm text-text-primary">{bodyOf(message)}</p>
      {message.generation && <Meta generation={message.generation} />}
    </article>
  );
}
