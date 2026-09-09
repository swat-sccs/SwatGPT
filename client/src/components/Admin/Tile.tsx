import type { TAdminUsageSummary } from 'librechat-data-provider';
import { formatCompact, formatMs, formatRate, ratio } from './format';
import { useLocalize } from '~/hooks';

type TileProps = { label: string; value: string; hint?: string };

export function Tile({ label, value, hint }: TileProps) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-primary-alt p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}

export function Tiles({ summary }: { summary: TAdminUsageSummary }) {
  const localize = useLocalize();
  const tiles: TileProps[] = [
    {
      label: localize('com_admin_kpi_requests'),
      value: formatCompact(summary.requests),
      hint: localize('com_admin_kpi_conversations_hint', {
        0: formatCompact(summary.conversations),
      }),
    },
    {
      label: localize('com_admin_kpi_error_rate'),
      value: formatRate(ratio(summary.errors, summary.requests)),
      hint: localize('com_admin_kpi_errors_hint', {
        0: formatCompact(summary.errors),
        1: formatCompact(summary.aborted),
      }),
    },
    { label: localize('com_admin_kpi_unique_users'), value: formatCompact(summary.uniqueUsers) },
    { label: localize('com_admin_kpi_prompt_tokens'), value: formatCompact(summary.promptTokens) },
    {
      label: localize('com_admin_kpi_completion_tokens'),
      value: formatCompact(summary.completionTokens),
      hint:
        summary.outputTokensPerSec == null
          ? undefined
          : localize('com_admin_kpi_tokens_per_sec', { 0: summary.outputTokensPerSec.toFixed(1) }),
    },
    { label: localize('com_admin_kpi_ttft_p50'), value: formatMs(summary.ttftMs.p50) },
    { label: localize('com_admin_kpi_duration_p95'), value: formatMs(summary.durationMs.p95) },
    {
      label: localize('com_admin_kpi_rag_hit_rate'),
      value: formatRate(summary.ragHitRate),
      hint: localize('com_admin_kpi_tool_rate_hint', { 0: formatRate(summary.toolCallRate) }),
    },
    { label: localize('com_admin_kpi_flagged'), value: formatCompact(summary.flagged) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <Tile key={tile.label} {...tile} />
      ))}
    </div>
  );
}
