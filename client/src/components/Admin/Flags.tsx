import { useState } from 'react';
import { Label, Button, Switch } from '@librechat/client';
import { Loading, ErrorState, Empty } from './States';
import { AdminCapability, Require } from './access';
import { useAdminFlags } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { FlagList } from './Flag';

function Content() {
  const localize = useLocalize();
  const [showResolved, setShowResolved] = useState(false);
  const query = useAdminFlags({ resolved: showResolved ? undefined : false });
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
        <FlagList flags={flags} linkConversation={true} />
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
