import { useParams } from 'react-router-dom';
import { Table, TableBody, TableHeader } from '@librechat/client';
import { Loading, ErrorState, Empty } from './States';
import { RangePicker, useRange } from './Range';
import { AdminCapability, Require, useAdminAccess } from './access';
import { ConversationHeadRow, ConversationRow } from './Rows';
import { useAdminUsageUser } from '~/data-provider';
import { useLocalize } from '~/hooks';
import Moderation from './Moderation';
import { Tiles } from './Tile';
import Chart from './Chart';
import Pill from './Pill';

function Content({ userId }: { userId: string }) {
  const localize = useLocalize();
  const { has } = useAdminAccess();
  const { preset, setPreset, range, bucket } = useRange('7d');
  const query = useAdminUsageUser(userId, range);
  const detail = query.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {detail ? detail.user.name || detail.user.username : localize('com_ui_user')}
            {detail?.user.banned && (
              <Pill tone="destructive">{localize('com_admin_status_banned')}</Pill>
            )}
          </h2>
          {detail && (
            <p className="text-sm text-text-secondary">
              {detail.user.email}
              {' · '}
              {detail.user.role}
            </p>
          )}
        </div>
        <RangePicker preset={preset} setPreset={setPreset} />
      </header>

      {query.isLoading && <Loading />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}
      {detail && (
        <div className="space-y-6" aria-busy={query.isFetching}>
          <Tiles summary={detail.summary} />
          <Chart points={detail.timeseries.points} bucket={bucket} />
          <section aria-labelledby="admin-user-conversations">
            <h3
              id="admin-user-conversations"
              className="mb-2 text-sm font-medium text-text-secondary"
            >
              {localize('com_admin_section_recent_conversations')}
            </h3>
            {detail.recentConversations.length === 0 ? (
              <Empty />
            ) : (
              <Table>
                <TableHeader>
                  <ConversationHeadRow showOwner={false} />
                </TableHeader>
                <TableBody>
                  {detail.recentConversations.map((item) => (
                    <ConversationRow key={item.conversationId} item={item} showOwner={false} />
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}

      {has(AdminCapability.CONTROLS) && <Moderation userId={userId} />}
    </div>
  );
}

export default function User() {
  const { userId = '' } = useParams<{ userId: string }>();
  return (
    <Require capability={AdminCapability.USAGE}>
      <Content userId={userId} />
    </Require>
  );
}
