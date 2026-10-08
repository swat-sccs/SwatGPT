import { useState } from 'react';
import { Link } from 'react-router-dom';
import { OGDialog, OGDialogTemplate, Label, Button, Textarea } from '@librechat/client';
import type { TAdminFlag } from 'librechat-data-provider';
import { useFlagConversation, useResolveFlag } from '~/data-provider';
import { ActionError, useActionFailedToast } from './States';
import { conversationPath } from './Rows';
import { formatDate } from './format';
import { useLocalize } from '~/hooks';
import Pill from './Pill';

type TResolveFlag = ReturnType<typeof useResolveFlag>;

function FlagItem({
  flag,
  resolve,
  onResolve,
  linkConversation,
}: {
  flag: TAdminFlag;
  resolve: TResolveFlag;
  onResolve: (flagId: string) => void;
  linkConversation: boolean;
}) {
  const localize = useLocalize();
  const failed = resolve.isError && resolve.variables === flag.id;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border-light p-3 text-sm">
      <Pill tone={flag.resolvedAt ? 'neutral' : 'warning'}>
        {localize(flag.source === 'manual' ? 'com_admin_flag_manual' : 'com_admin_flag_keyword')}
      </Pill>
      <div className="min-w-0 flex-1">
        <p className="text-text-primary">{flag.reason}</p>
        {linkConversation && (
          <Link
            to={conversationPath(flag.conversationId)}
            className="text-xs text-text-secondary hover:underline"
          >
            {localize('com_admin_flag_open_conversation')}
          </Link>
        )}
      </div>
      <time dateTime={flag.createdAt} className="text-xs text-text-tertiary">
        {formatDate(flag.createdAt)}
      </time>
      {flag.resolvedAt ? (
        <span className="text-xs text-text-secondary">
          {localize('com_admin_flag_resolved_at', { 0: formatDate(flag.resolvedAt) })}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={resolve.isLoading}
          onClick={() => onResolve(flag.id)}
        >
          {localize('com_admin_flag_resolve')}
        </Button>
      )}
      {failed && <ActionError />}
    </li>
  );
}

export function FlagList({
  flags,
  linkConversation = false,
}: {
  flags: TAdminFlag[];
  linkConversation?: boolean;
}) {
  const localize = useLocalize();
  const resolve = useResolveFlag();
  const actionFailed = useActionFailedToast();

  if (flags.length === 0) {
    return null;
  }

  const onResolve = (flagId: string) => resolve.mutate(flagId, { onError: actionFailed });

  return (
    <ul aria-label={localize('com_admin_nav_flags')} className="space-y-2">
      {flags.map((flag) => (
        <FlagItem
          key={flag.id}
          flag={flag}
          resolve={resolve}
          onResolve={onResolve}
          linkConversation={linkConversation}
        />
      ))}
    </ul>
  );
}

export default function FlagDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const localize = useLocalize();
  const flag = useFlagConversation();
  const [reason, setReason] = useState('');

  const changeOpen = (next: boolean) => {
    if (!next) {
      flag.reset();
    }
    onOpenChange(next);
  };

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    flag.mutate(
      { conversationId, payload: { reason: trimmed } },
      {
        onSuccess: () => {
          setReason('');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <OGDialog open={open} onOpenChange={changeOpen}>
      <OGDialogTemplate
        title={localize('com_admin_flag_title')}
        description={localize('com_admin_flag_description')}
        className="max-w-lg"
        main={
          <div className="space-y-2">
            <Label htmlFor="admin-flag-reason">{localize('com_admin_flag_reason')}</Label>
            <Textarea
              id="admin-flag-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
            {flag.isError && <ActionError />}
          </div>
        }
        selection={
          <Button onClick={submit} disabled={flag.isLoading || reason.trim().length === 0}>
            {localize('com_admin_flag_submit')}
          </Button>
        }
      />
    </OGDialog>
  );
}
