import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Label, Button, Switch } from '@librechat/client';
import { Loading, ErrorState, Empty } from './States';
import { AdminCapability, Require } from './access';
import { useAdminFlags, useResolveFlag } from '~/data-provider';
import { conversationPath } from './Rows';
import { formatDate } from './format';
import { useLocalize } from '~/hooks';
import Pill from './Pill';

function Content() {
  const localize = useLocalize();
  const [showResolved, setShowResolved] = useState(false);
  const query = useAdminFlags({ resolved: showResolved });
  const resolve = useResolveFlag();
  const flags = query.data?.pages.flatMap((page) => page.flags) ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{localize('com_admin_nav_flags')}</h2>
        <div className="flex items-center gap-2">
          <Switch
            id="admin-flags-resolved"
            aria-labelledby="admin-flags-resolved-label"
            checked={showResolved}
            onCheckedChange={setShowResolved}
          />
          <Label id="admin-flags-resolved-label" htmlFor="admin-flags-resolved">
            {localize('com_admin_flags_show_resolved')}
          </Label>
        </div>
      </header>

      <section aria-busy={query.isFetching}>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {query.data && flags.length === 0 && <Empty message={localize('com_admin_flags_empty')} />}
        {flags.length > 0 && (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li
                key={flag.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-light p-3 text-sm"
              >
                <Pill tone={flag.resolvedAt ? 'neutral' : 'warning'}>
                  {localize(
                    flag.source === 'manual' ? 'com_admin_flag_manual' : 'com_admin_flag_keyword',
                  )}
                </Pill>
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary">{flag.reason}</p>
                  <Link
                    to={conversationPath(flag.conversationId)}
                    className="text-xs text-text-secondary hover:underline"
                  >
                    {localize('com_admin_flag_open_conversation')}
                  </Link>
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
                    onClick={() => resolve.mutate(flag.id)}
                  >
                    {localize('com_admin_flag_resolve')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {localize('com_ui_load_more')}
        </Button>
      )}
    </div>
  );
}

export default function Flags() {
  return (
    <Require capability={AdminCapability.CONVERSATIONS}>
      <Content />
    </Require>
  );
}
