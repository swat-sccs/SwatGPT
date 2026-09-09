import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TAdminConversationMessage,
  TAdminGeneration,
  TMessageContentParts,
} from 'librechat-data-provider';
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

function Meta({ generation }: { generation: TAdminGeneration }) {
  const localize = useLocalize();
  const entries: string[] = [
    generation.model,
    localize('com_admin_meta_tokens', {
      0: formatInt(generation.promptTokens),
      1: formatInt(generation.completionTokens),
    }),
    localize('com_admin_meta_ttft', { 0: formatMs(generation.ttftMs) }),
    localize('com_admin_meta_duration', { 0: formatMs(generation.durationMs) }),
  ];
  if (generation.toolCalls.length > 0) {
    entries.push(localize('com_admin_meta_tools', { 0: generation.toolCalls.join(', ') }));
  }
  if (generation.ragChunks > 0) {
    entries.push(localize('com_admin_meta_rag', { 0: formatInt(generation.ragChunks) }));
  }
  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
      {entries.map((entry) => (
        <dd key={entry} className="tabular-nums">
          {entry}
        </dd>
      ))}
      {generation.status !== 'ok' && (
        <dd>
          <Pill tone="destructive">
            {generation.errorType
              ? `${generation.status}: ${generation.errorType}`
              : generation.status}
          </Pill>
        </dd>
      )}
    </dl>
  );
}

export default function Message({ message }: { message: TAdminConversationMessage }) {
  const localize = useLocalize();
  const roleKey = message.isCreatedByUser ? 'com_ui_user' : 'com_ui_assistant';
  const FeedbackIcon = message.feedback?.rating === 'thumbsUp' ? ThumbsUp : ThumbsDown;

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
            title={message.feedback.tag?.key ?? undefined}
            className="ml-auto inline-flex items-center gap-1"
          >
            <FeedbackIcon className="size-4" aria-hidden="true" />
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
