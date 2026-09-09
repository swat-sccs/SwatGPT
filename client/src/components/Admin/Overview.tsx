import { Table, TableRow, TableBody, TableCell, TableHead, TableHeader } from '@librechat/client';
import type { TAdminUsageModel } from 'librechat-data-provider';
import {
  useAdminUsageModels,
  useAdminUsageSummary,
  useAdminUsageTimeseries,
} from '~/data-provider';
import { Loading, ErrorState, Empty } from './States';
import { formatInt, formatMs } from './format';
import { RangePicker, useRange } from './Range';
import { AdminCapability, Require } from './access';
import { useLocalize } from '~/hooks';
import { Tiles } from './Tile';
import Chart from './Chart';

function Models({ models }: { models: TAdminUsageModel[] }) {
  const localize = useLocalize();
  if (models.length === 0) {
    return <Empty />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{localize('com_ui_model')}</TableHead>
          <TableHead className="text-right">{localize('com_admin_col_requests')}</TableHead>
          <TableHead className="text-right">{localize('com_admin_col_prompt_tokens')}</TableHead>
          <TableHead className="text-right">
            {localize('com_admin_col_completion_tokens')}
          </TableHead>
          <TableHead className="text-right">{localize('com_admin_kpi_ttft_p50')}</TableHead>
          <TableHead className="text-right">{localize('com_admin_kpi_duration_p95')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((row) => (
          <TableRow key={row.model}>
            <TableCell className="font-medium text-text-primary">{row.model}</TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(row.requests)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatInt(row.promptTokens)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatInt(row.completionTokens)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMs(row.ttftMs.p50)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMs(row.durationMs.p95)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Content() {
  const localize = useLocalize();
  const { preset, setPreset, range, bucket } = useRange();
  const summary = useAdminUsageSummary(range);
  const series = useAdminUsageTimeseries({ ...range, bucket });
  const models = useAdminUsageModels(range);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{localize('com_admin_nav_overview')}</h2>
        <RangePicker preset={preset} setPreset={setPreset} />
      </header>

      <section aria-labelledby="admin-kpis" aria-busy={summary.isFetching}>
        <h3 id="admin-kpis" className="sr-only">
          {localize('com_admin_section_kpis')}
        </h3>
        {summary.isLoading && <Loading />}
        {summary.isError && <ErrorState onRetry={() => summary.refetch()} />}
        {summary.data && <Tiles summary={summary.data} />}
      </section>

      <section aria-busy={series.isFetching}>
        {series.isLoading && <Loading />}
        {series.isError && <ErrorState onRetry={() => series.refetch()} />}
        {series.data && <Chart points={series.data.points} bucket={series.data.bucket} />}
      </section>

      <section aria-labelledby="admin-models" aria-busy={models.isFetching}>
        <h3 id="admin-models" className="mb-2 text-sm font-medium text-text-secondary">
          {localize('com_admin_section_models')}
        </h3>
        {models.isLoading && <Loading />}
        {models.isError && <ErrorState onRetry={() => models.refetch()} />}
        {models.data && <Models models={models.data} />}
      </section>
    </div>
  );
}

export default function Overview() {
  return (
    <Require capability={AdminCapability.USAGE}>
      <Content />
    </Require>
  );
}
