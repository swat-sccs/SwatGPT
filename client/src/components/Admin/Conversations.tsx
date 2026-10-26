import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Label, Input, Button, Switch, Table, TableBody, TableHeader } from '@librechat/client';
import type { FormEvent } from 'react';
import type { TAdminConversationsQuery } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { ConversationHeadRow, ConversationRow } from './Rows';
import { fromLocalInput, toDateInput } from './format';
import { Loading, ErrorState, Empty } from './States';
import { AdminCapability, Require } from './access';
import { useAdminConversations } from '~/data-provider';
import { useLocalize } from '~/hooks';

type Filters = Omit<TAdminConversationsQuery, 'cursor'>;
type FilterField = 'userId' | 'range';
type FilterErrors = Partial<Record<FilterField, TranslationKeys>>;

const PAGE_SIZE = 25;
const MIN_SEARCH_LENGTH = 2;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

const initialFilters: Filters = { limit: PAGE_SIZE, sort: 'updatedAt' };

const errorIds: Record<FilterField, string> = {
  userId: 'admin-convo-user-error',
  range: 'admin-convo-range-error',
};

const isOn = (value: string | null): true | undefined =>
  value === '1' || value === 'true' ? true : undefined;

/** The shareable subset of the filters: who, and whether only flagged or errored threads. */
export const filtersFromParams = (params: URLSearchParams): Filters => ({
  ...initialFilters,
  userId: params.get('userId') || undefined,
  flagged: isOn(params.get('flagged')),
  errors: isOn(params.get('errors')),
});

export const paramsFromFilters = (filters: Filters): URLSearchParams => {
  const params = new URLSearchParams();
  if (filters.userId) {
    params.set('userId', filters.userId);
  }
  if (filters.flagged) {
    params.set('flagged', '1');
  }
  if (filters.errors) {
    params.set('errors', '1');
  }
  return params;
};

/** Server-side rules mirrored here so a predictable 400 never replaces the list with an error. */
export const validateFilters = (draft: Filters): FilterErrors => {
  const errors: FilterErrors = {};
  if (draft.userId && !OBJECT_ID.test(draft.userId)) {
    errors.userId = 'com_admin_filter_user_id_invalid';
  }
  if (draft.from && draft.to && draft.from > draft.to) {
    errors.range = 'com_admin_filter_range_invalid';
  }
  return errors;
};

/** The search is trimmed and dropped below the server minimum instead of being rejected. */
export const normalizeFilters = (draft: Filters): Filters => {
  const search = draft.search?.trim();
  return { ...draft, search: search && search.length >= MIN_SEARCH_LENGTH ? search : undefined };
};

function FieldError({ id, labelKey }: { id: string; labelKey?: TranslationKeys }) {
  const localize = useLocalize();
  if (!labelKey) {
    return null;
  }
  return (
    <p id={id} role="alert" className="text-xs text-text-destructive">
      {localize(labelKey)}
    </p>
  );
}

function Content() {
  const localize = useLocalize();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Filters>(() => filtersFromParams(params));
  const [filters, setFilters] = useState<Filters>(draft);
  const [errors, setErrors] = useState<FilterErrors>({});
  const query = useAdminConversations(filters);

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validateFilters(draft);
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) {
      return;
    }
    const next = normalizeFilters(draft);
    setFilters(next);
    setParams(paramsFromFilters(next), { replace: true });
  };

  const update = (patch: Partial<Filters>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
  };

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
            aria-invalid={errors.userId != null}
            aria-describedby={errors.userId && errorIds.userId}
            className="w-56 font-mono text-xs"
          />
          <FieldError id={errorIds.userId} labelKey={errors.userId} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-convo-from">{localize('com_admin_filter_from')}</Label>
          <Input
            id="admin-convo-from"
            type="datetime-local"
            value={toDateInput(draft.from)}
            onChange={(event) => update({ from: fromLocalInput(event.target.value) })}
            aria-invalid={errors.range != null}
            aria-describedby={errors.range && errorIds.range}
          />
          <FieldError id={errorIds.range} labelKey={errors.range} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-convo-to">{localize('com_admin_filter_to')}</Label>
          <Input
            id="admin-convo-to"
            type="datetime-local"
            value={toDateInput(draft.to)}
            onChange={(event) => update({ to: fromLocalInput(event.target.value) })}
            aria-invalid={errors.range != null}
            aria-describedby={errors.range && errorIds.range}
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
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
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
