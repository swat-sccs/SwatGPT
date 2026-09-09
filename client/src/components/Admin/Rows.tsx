import { Link } from 'react-router-dom';
import { TableRow, TableCell, TableHead } from '@librechat/client';
import type { TAdminConversationListItem } from 'librechat-data-provider';
import { formatDate, formatInt } from './format';
import { useLocalize } from '~/hooks';
import { ADMIN_ROOT } from './Nav';
import Pill from './Pill';

export const conversationPath = (conversationId: string) =>
  `${ADMIN_ROOT}/conversations/${encodeURIComponent(conversationId)}`;

export const userPath = (userId: string) => `${ADMIN_ROOT}/users/${encodeURIComponent(userId)}`;

export function ConversationHeadRow({ showOwner = true }: { showOwner?: boolean }) {
  const localize = useLocalize();
  return (
    <TableRow>
      <TableHead>{localize('com_admin_col_title')}</TableHead>
      {showOwner && <TableHead>{localize('com_admin_col_owner')}</TableHead>}
      <TableHead>{localize('com_ui_model')}</TableHead>
      <TableHead className="text-right">{localize('com_admin_col_messages')}</TableHead>
      <TableHead className="text-right">{localize('com_admin_col_tokens')}</TableHead>
      <TableHead className="text-right">{localize('com_admin_col_errors')}</TableHead>
      <TableHead>{localize('com_admin_col_status')}</TableHead>
      <TableHead>{localize('com_admin_col_updated')}</TableHead>
    </TableRow>
  );
}

export function ConversationRow({
  item,
  showOwner = true,
}: {
  item: TAdminConversationListItem;
  showOwner?: boolean;
}) {
  const localize = useLocalize();
  return (
    <TableRow>
      <TableCell>
        <Link
          to={conversationPath(item.conversationId)}
          className="font-medium text-text-primary hover:underline"
        >
          {item.title || localize('com_admin_untitled')}
        </Link>
      </TableCell>
      {showOwner && (
        <TableCell>
          <Link to={userPath(item.user.id)} className="hover:underline">
            <span className="block">{item.user.name}</span>
            <span className="block text-xs text-text-secondary">{item.user.email}</span>
          </Link>
        </TableCell>
      )}
      <TableCell className="text-text-secondary">{item.model}</TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(item.messageCount)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatInt(item.promptTokens + item.completionTokens)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(item.errors)}</TableCell>
      <TableCell>
        {item.flagged && <Pill tone="warning">{localize('com_admin_status_flagged')}</Pill>}
      </TableCell>
      <TableCell className="whitespace-nowrap text-text-secondary">
        {formatDate(item.updatedAt)}
      </TableCell>
    </TableRow>
  );
}
