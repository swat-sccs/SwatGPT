import { useState } from 'react';
import { Label, Button, Switch } from '@librechat/client';
import type { TAdminFlag, TAdminFlagSource } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { Loading, ErrorState, Empty } from './States';
import { AdminCapability, Require } from './access';
import { useAdminFlags } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { FlagList } from './Flag';
import { cn } from '~/utils';

type SourceChoice = 'all' | TAdminFlagSource;
type SourceCounts = Record<SourceChoice, number>;

const sourceChoices: { value: SourceChoice; labelKey: TranslationKeys }[] = [
  { value: 'all', labelKey: 'com_admin_flag_source_all' },
  { value: 'manual', labelKey: 'com_admin_flag_source_manual' },
  { value: 'keyword', labelKey: 'com_admin_flag_source_keyword' },
];

/** Counts the loaded pages once; the chips filter client-side so paging stays server-driven. */
export const countBySource = (flags: TAdminFlag[]): SourceCounts => {
  const counts: SourceCounts = { all: flags.length, manual: 0, keyword: 0 };
  for (const flag of flags) {
    counts[flag.source] += 1;
  }
  return counts;
};

function SourceChips({
  source,
  counts,
  onChange,
}: {
  source: SourceChoice;
  counts: SourceCounts;
  onChange: (source: SourceChoice) => void;
}) {
  const localize = useLocalize();
  return (
    <div
      role="group"
      aria-label={localize('com_admin_flag_source_label')}
      className="inline-flex rounded-lg border border-border-light p-0.5"
    >
      {sourceChoices.map((choice) => (
        <Button
          key={choice.value}
          variant="ghost"
          size="sm"
          aria-pressed={choice.value === source}
          onClick={() => onChange(choice.value)}
          className={cn('h-8', choice.value === source && 'bg-surface-active text-text-primary')}
        >
          {localize(choice.labelKey, { 0: counts[choice.value] })}
        </Button>
      ))}
    </div>
  );
}

function Content() {
  const localize = useLocalize();
  const [showResolved, setShowResolved] = useState(false);
  const [source, setSource] = useState<SourceChoice>('all');
  const query = useAdminFlags({ resolved: showResolved ? undefined : false });
  const flags = query.data?.pages.flatMap((page) => page.flags) ?? [];
  const shown = source === 'all' ? flags : flags.filter((flag) => flag.source === source);
  const emptyKey = flags.length === 0 ? 'com_admin_flags_empty' : 'com_admin_flags_empty_source';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{localize('com_admin_nav_flags')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          <SourceChips source={source} counts={countBySource(flags)} onChange={setSource} />
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
        </div>
      </header>

      <section aria-busy={query.isFetching}>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data && shown.length === 0 && <Empty message={localize(emptyKey)} />}
        <FlagList flags={shown} linkConversation={true} />
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
