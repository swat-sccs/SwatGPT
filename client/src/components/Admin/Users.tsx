import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, Download } from 'lucide-react';
import {
  Table,
  Input,
  Button,
  TableRow,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@librechat/client';
import type { TAdminUsageUser, TAdminUsageUserSort } from 'librechat-data-provider';
import type { FormEvent, ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import type { TRangePreset } from './format';
import { Loading, ErrorState, Empty } from './States';
import { RangePicker, useRange } from './Range';
import { AdminCapability, Require } from './access';
import { useAdminUsageUsers } from '~/data-provider';
import { formatInt, toCsv } from './format';
import { triggerDownload } from '~/utils';
import { useLocalize } from '~/hooks';
import { ADMIN_ROOT } from './Nav';
import When from './When';
import Pill from './Pill';

const PAGE_SIZE = 25;

const sortColumns: { sort: TAdminUsageUserSort; labelKey: TranslationKeys }[] = [
  { sort: 'requests', labelKey: 'com_admin_col_requests' },
  { sort: 'tokens', labelKey: 'com_admin_col_tokens' },
  { sort: 'errors', labelKey: 'com_admin_col_errors' },
  { sort: 'lastActive', labelKey: 'com_admin_col_last_active' },
];

const CSV_COLUMNS = [
  'id',
  'name',
  'username',
  'email',
  'role',
  'requests',
  'errors',
  'promptTokens',
  'completionTokens',
  'conversations',
  'flagged',
  'lastActiveAt',
  'banned',
] as const satisfies ReadonlyArray<keyof TAdminUsageUser>;

export const usersCsv = (users: TAdminUsageUser[]): string =>
  toCsv([CSV_COLUMNS, ...users.map((user) => CSV_COLUMNS.map((column) => user[column]))]);

const cellFor: Record<TAdminUsageUserSort, (user: TAdminUsageUser) => ReactNode> = {
  requests: (user) => formatInt(user.requests),
  tokens: (user) => formatInt(user.promptTokens + user.completionTokens),
  errors: (user) => formatInt(user.errors),
  lastActive: (user) => <When iso={user.lastActiveAt} />,
};

export function UserRow({ user }: { user: TAdminUsageUser }) {
  const localize = useLocalize();
  return (
    <TableRow>
      <TableCell>
        <Link
          to={`${ADMIN_ROOT}/users/${encodeURIComponent(user.id)}`}
          className="block hover:underline"
        >
          <span className="font-medium text-text-primary">{user.name || user.username}</span>
          <span className="block text-xs text-text-secondary">{user.email}</span>
        </Link>
      </TableCell>
      {sortColumns.map((column) => (
        <TableCell key={column.sort} className="text-right tabular-nums">
          {cellFor[column.sort](user)}
        </TableCell>
      ))}
      <TableCell className="text-right tabular-nums">{formatInt(user.flagged)}</TableCell>
      <TableCell>
        {user.banned && <Pill tone="destructive">{localize('com_admin_status_banned')}</Pill>}
      </TableCell>
    </TableRow>
  );
}

function Content() {
  const localize = useLocalize();
  const { preset, setPreset, range, retry } = useRange('7d');
  const [sort, setSort] = useState<TAdminUsageUserSort>('tokens');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useAdminUsageUsers({
    ...range,
    sort,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(draft.trim());
    setOffset(0);
  };

  const changeSort = (next: TAdminUsageUserSort) => {
    setSort(next);
    setOffset(0);
  };

  const changePreset = (next: TRangePreset) => {
    setPreset(next);
    setOffset(0);
  };

  const total = query.data?.total ?? 0;
  const users = query.data?.users ?? [];
  const shownOffset = query.data?.offset ?? offset;
  const end = Math.min(shownOffset + users.length, total);
  const paging = query.isFetching;

  const download = () => {
    const blob = new Blob([usersCsv(users)], { type: 'text/csv;charset=utf-8' });
    const name = `swatgpt-users-${preset}-${shownOffset + 1}-${end}.csv`;
    triggerDownload(URL.createObjectURL(blob), name);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{localize('com_admin_nav_users')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker preset={preset} setPreset={changePreset} />
          <Button
            variant="outline"
            size="sm"
            disabled={paging || users.length === 0}
            onClick={download}
          >
            <Download className="size-4" aria-hidden="true" />
            {localize('com_admin_users_download_csv')}
          </Button>
        </div>
      </header>

      <form role="search" onSubmit={submitSearch} className="flex max-w-md gap-2">
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={localize('com_admin_users_search_placeholder')}
          aria-label={localize('com_admin_users_search_placeholder')}
        />
        <Button type="submit" variant="outline">
          {localize('com_ui_search')}
        </Button>
      </form>

      <section aria-busy={query.isFetching}>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorState error={query.error} onRetry={() => retry(query.refetch)} />}
        {query.data && users.length === 0 && <Empty />}
        {users.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{localize('com_ui_user')}</TableHead>
                {sortColumns.map((column) => (
                  <TableHead
                    key={column.sort}
                    className="text-right"
                    aria-sort={column.sort === sort ? 'descending' : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(column.sort)}
                      className="inline-flex items-center gap-1 hover:text-text-primary"
                    >
                      {localize(column.labelKey)}
                      {column.sort === sort && <ArrowDown className="size-3" aria-hidden="true" />}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="text-right">{localize('com_admin_col_flagged')}</TableHead>
                <TableHead>{localize('com_admin_col_status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {total > 0 && (
        <footer className="flex items-center justify-between text-sm text-text-secondary">
          <span className="tabular-nums">
            {localize('com_admin_pagination_range', {
              0: formatInt(shownOffset + 1),
              1: formatInt(end),
              2: formatInt(total),
            })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paging || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {localize('com_admin_pagination_prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={paging || end >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {localize('com_admin_pagination_next')}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function Users() {
  return (
    <Require capability={AdminCapability.USAGE}>
      <Content />
    </Require>
  );
}
