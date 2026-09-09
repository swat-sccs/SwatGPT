import { useState } from 'react';
import { Label, Input, Button, Switch, Table, TableBody, TableHeader } from '@librechat/client';
import type { FormEvent } from 'react';
import type { TAdminConversationsQuery } from 'librechat-data-provider';
import { ConversationHeadRow, ConversationRow } from './Rows';
import { fromLocalInput, toDateInput } from './format';
import { Loading, ErrorState, Empty } from './States';
import { AdminCapability, Require } from './access';
import { useAdminConversations } from '~/data-provider';
import { useLocalize } from '~/hooks';

type Filters = Omit<TAdminConversationsQuery, 'cursor'>;

const PAGE_SIZE = 25;

const initialFilters: Filters = { limit: PAGE_SIZE, sort: 'updatedAt' };

function Content() {
  const localize = useLocalize();
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const query = useAdminConversations(filters);

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(draft);
  };

  const update = (patch: Partial<Filters>) => setDraft((current) => ({ ...current, ...patch }));

  const items = query.data?.pages.flatMap((page) => page.conversations) ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{localize('com_admin_nav_conversations')}</h2>

      <form
        onSubmit={apply}
        aria-label={localize('com_admin_filters_label')}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border-light p-3"
      >
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="admin-convo-search">{localize('com_admin_filter_search')}</Label>
          <Input
            id="admin-convo-search"
            type="search"
            value={draft.search ?? ''}
            onChange={(event) => update({ search: event.target.value || undefined })}
            placeholder={localize('com_admin_filter_search_placeholder')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-convo-user">{localize('com_admin_filter_user_id')}</Label>
          <Input
            id="admin-convo-user"
            value={draft.userId ?? ''}
            onChange={(event) => update({ userId: event.target.value || undefined })}
            className="w-56 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-convo-from">{localize('com_admin_filter_from')}</Label>
          <Input
            id="admin-convo-from"
            type="datetime-local"
            value={toDateInput(draft.from)}
            onChange={(event) => update({ from: fromLocalInput(event.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-convo-to">{localize('com_admin_filter_to')}</Label>
          <Input
            id="admin-convo-to"
            type="datetime-local"
            value={toDateInput(draft.to)}
            onChange={(event) => update({ to: fromLocalInput(event.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="admin-convo-flagged"
            aria-labelledby="admin-convo-flagged-label"
            checked={draft.flagged === true}
            onCheckedChange={(checked) => update({ flagged: checked || undefined })}
          />
          <Label id="admin-convo-flagged-label" htmlFor="admin-convo-flagged">
            {localize('com_admin_filter_flagged')}
          </Label>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="admin-convo-errors"
            aria-labelledby="admin-convo-errors-label"
            checked={draft.errors === true}
            onCheckedChange={(checked) => update({ errors: checked || undefined })}
          />
          <Label id="admin-convo-errors-label" htmlFor="admin-convo-errors">
            {localize('com_admin_filter_errors')}
          </Label>
        </div>
        <Button type="submit" variant="outline">
          {localize('com_admin_filter_apply')}
        </Button>
      </form>

      <section aria-busy={query.isFetching}>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {query.data && items.length === 0 && <Empty />}
        {items.length > 0 && (
          <Table>
            <TableHeader>
              <ConversationHeadRow />
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <ConversationRow key={item.conversationId} item={item} />
              ))}
            </TableBody>
          </Table>
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

export default function Conversations() {
  return (
    <Require capability={AdminCapability.CONVERSATIONS}>
      <Content />
    </Require>
  );
}
