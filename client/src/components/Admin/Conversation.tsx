import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flag, Download } from 'lucide-react';
import { Button } from '@librechat/client';
import { adminConversationExport } from 'librechat-data-provider';
import type { TAdminFlag } from 'librechat-data-provider';
import { AdminCapability, Require, useAdminAccess } from './access';
import { useAdminConversation, useResolveFlag } from '~/data-provider';
import { formatDate, formatInt } from './format';
import { Loading, ErrorState } from './States';
import { useLocalize } from '~/hooks';
import FlagDialog from './Flag';
import { userPath } from './Rows';
import Message from './Message';
import Pill from './Pill';

export function FlagList({ flags }: { flags: TAdminFlag[] }) {
  const localize = useLocalize();
  const resolve = useResolveFlag();

  if (flags.length === 0) {
    return null;
  }
  return (
    <ul aria-label={localize('com_admin_nav_flags')} className="space-y-2">
      {flags.map((flag) => (
        <li
          key={flag.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border-medium p-3 text-sm"
        >
          <Pill tone={flag.resolvedAt ? 'neutral' : 'warning'}>
            {localize(
              flag.source === 'manual' ? 'com_admin_flag_manual' : 'com_admin_flag_keyword',
            )}
          </Pill>
          <span className="flex-1 text-text-primary">{flag.reason}</span>
          <span className="text-xs text-text-tertiary">{formatDate(flag.createdAt)}</span>
          {flag.resolvedAt ? (
            <span className="text-xs text-text-secondary">
              {localize('com_admin_flag_resolved_at', { 0: formatDate(flag.resolvedAt) })}
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={resolve.isLoading}
              onClick={() => resolve.mutate(flag.id)}
            >
              {localize('com_admin_flag_resolve')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Content({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const { has } = useAdminAccess();
  const query = useAdminConversation(conversationId);
  const [flagOpen, setFlagOpen] = useState(false);

  if (query.isLoading) {
    return <Loading />;
  }
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  const { conversation, messages, flags } = query.data;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {conversation.title || localize('com_admin_untitled')}
            {conversation.flagged && (
              <Pill tone="warning">{localize('com_admin_status_flagged')}</Pill>
            )}
          </h2>
          <div className="flex gap-2">
            {has(AdminCapability.EXPORT) && (
              <Button asChild variant="outline" size="sm">
                <a href={adminConversationExport(conversationId)} download>
                  <Download className="size-4" aria-hidden="true" />
                  {localize('com_admin_export')}
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setFlagOpen(true)}>
              <Flag className="size-4" aria-hidden="true" />
              {localize('com_admin_flag')}
            </Button>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          <div>
            <dt className="sr-only">{localize('com_admin_col_owner')}</dt>
            <dd>
              <Link to={userPath(conversation.user.id)} className="hover:underline">
                {conversation.user.name}
                {' · '}
                {conversation.user.email}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="sr-only">{localize('com_ui_model')}</dt>
            <dd>{conversation.model}</dd>
          </div>
          <div className="tabular-nums">
            <dt className="sr-only">{localize('com_admin_col_tokens')}</dt>
            <dd>
              {localize('com_admin_meta_tokens', {
                0: formatInt(conversation.promptTokens),
                1: formatInt(conversation.completionTokens),
              })}
            </dd>
          </div>
          <div>
            <dt className="sr-only">{localize('com_admin_col_created')}</dt>
            <dd>{localize('com_admin_created_at', { 0: formatDate(conversation.createdAt) })}</dd>
          </div>
          <div>
            <dt className="sr-only">{localize('com_admin_col_updated')}</dt>
            <dd>{localize('com_admin_updated_at', { 0: formatDate(conversation.updatedAt) })}</dd>
          </div>
        </dl>
      </header>

      <FlagList flags={flags} />

      <section aria-label={localize('com_admin_section_messages')} className="space-y-3">
        {messages.map((message) => (
          <Message key={message.messageId} message={message} />
        ))}
      </section>

      <FlagDialog conversationId={conversationId} open={flagOpen} onOpenChange={setFlagOpen} />
    </div>
  );
}

export default function Conversation() {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  return (
    <Require capability={AdminCapability.CONVERSATIONS}>
      <Content conversationId={conversationId} />
    </Require>
  );
}
