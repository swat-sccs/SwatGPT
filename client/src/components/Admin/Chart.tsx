import { useState } from 'react';
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import {
  Table,
  Button,
  TableRow,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from '@librechat/client';
import type { TooltipProps } from 'recharts';
import type { TAdminUsageBucket, TAdminUsagePoint } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { formatCompact, formatDate, formatInt, formatTick } from './format';
import { useLocalize } from '~/hooks';
import { Empty } from './States';

type SeriesKey = 'requests' | 'errors' | 'promptTokens' | 'completionTokens';
type SeriesMark = 'bar' | 'line';
type Series = { key: SeriesKey; labelKey: TranslationKeys; color: string; mark: SeriesMark };

const SURFACE = 'rgb(var(--surface-primary))';
const GRID = 'rgb(var(--border-light))';
const AXIS = 'rgb(var(--text-tertiary))';

const ACCENT = 'rgb(var(--surface-submit))';
const SECOND = 'rgb(var(--brand-purple))';
const STATUS_ERROR = 'rgb(var(--text-destructive))';

const requestSeries: Series[] = [
  { key: 'requests', labelKey: 'com_admin_series_requests', color: ACCENT, mark: 'bar' },
  { key: 'errors', labelKey: 'com_admin_series_errors', color: STATUS_ERROR, mark: 'line' },
];

const tokenSeries: Series[] = [
  { key: 'promptTokens', labelKey: 'com_admin_series_prompt_tokens', color: ACCENT, mark: 'bar' },
  {
    key: 'completionTokens',
    labelKey: 'com_admin_series_completion_tokens',
    color: SECOND,
    mark: 'bar',
  },
];

const tableColumns: { key: SeriesKey; labelKey: TranslationKeys }[] = [
  ...requestSeries,
  ...tokenSeries,
];

const tickStyle = { fill: AXIS, fontSize: 11, fontVariantNumeric: 'tabular-nums' } as const;

function Legend({ series }: { series: Series[] }) {
  const localize = useLocalize();
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-text-secondary">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              item.mark === 'bar' ? 'inline-block h-3 w-3 rounded-sm' : 'inline-block h-0.5 w-4'
            }
            style={{ backgroundColor: item.color }}
          />
          {localize(item.labelKey)}
        </li>
      ))}
    </ul>
  );
}

function Tip({
  active,
  payload,
  label,
  series,
}: TooltipProps<number, string> & { series: Series[] }) {
  const localize = useLocalize();
  if (!active || !payload?.length || typeof label !== 'string') {
    return null;
  }
  const byKey = new Map(payload.map((entry) => [entry.dataKey, entry.value]));
  return (
    <div className="rounded-lg border border-border-light bg-surface-dialog p-2 text-xs shadow-lg">
      <p className="mb-1 text-text-secondary">{formatDate(label)}</p>
      {series.map((item) => (
        <p key={item.key} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-3"
            style={{ backgroundColor: item.color }}
          />
          <span className="font-semibold tabular-nums text-text-primary">
            {formatInt(byKey.get(item.key) ?? null)}
          </span>
          <span className="text-text-secondary">{localize(item.labelKey)}</span>
        </p>
      ))}
    </div>
  );
}

function Panel({
  title,
  series,
  points,
  bucket,
}: {
  title: string;
  series: Series[];
  points: TAdminUsagePoint[];
  bucket: TAdminUsageBucket;
}) {
  return (
    <figure className="rounded-lg border border-border-light bg-surface-primary-alt p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <Legend series={series} />
      </figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis
              dataKey="t"
              tickFormatter={(value: string) => formatTick(value, bucket)}
              tick={tickStyle}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value)}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgb(var(--surface-hover))', opacity: 0.4 }}
              content={<Tip series={series} />}
            />
            {series.map((item) =>
              item.mark === 'bar' ? (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  stackId="stack"
                  fill={item.color}
                  stroke={SURFACE}
                  strokeWidth={1}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stroke={item.color}
                  strokeWidth={2}
                  dot={{ r: 4, fill: item.color, stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function DataTable({ points, bucket }: { points: TAdminUsagePoint[]; bucket: TAdminUsageBucket }) {
  const localize = useLocalize();
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9">{localize('com_admin_col_time')}</TableHead>
          {tableColumns.map((column) => (
            <TableHead key={column.key} className="h-9 text-right">
              {localize(column.labelKey)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((point) => (
          <TableRow key={point.t}>
            <TableCell className="p-2">{formatTick(point.t, bucket)}</TableCell>
            {tableColumns.map((column) => (
              <TableCell key={column.key} className="p-2 text-right tabular-nums">
                {formatInt(point[column.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Chart({
  points,
  bucket,
}: {
  points: TAdminUsagePoint[];
  bucket: TAdminUsageBucket;
}) {
  const localize = useLocalize();
  const [showTable, setShowTable] = useState(false);

  if (points.length === 0) {
    return <Empty message={localize('com_admin_chart_empty')} />;
  }

  return (
    <section aria-label={localize('com_admin_chart_label')} className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title={localize('com_admin_chart_requests')}
          series={requestSeries}
          points={points}
          bucket={bucket}
        />
        <Panel
          title={localize('com_admin_chart_tokens')}
          series={tokenSeries}
          points={points}
          bucket={bucket}
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={showTable}
        onClick={() => setShowTable((value) => !value)}
      >
        {localize(showTable ? 'com_admin_chart_hide_table' : 'com_admin_chart_show_table')}
      </Button>
      {showTable && <DataTable points={points} bucket={bucket} />}
    </section>
  );
}
