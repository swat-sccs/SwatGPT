import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { domains } from './types.js';
import type { Domain } from './types.js';

export type ToolCallResult = 'success' | 'error' | 'timeout';
export type PollResult = 'success' | 'error' | 'skipped';
export type SnapshotObservedAt = (domain: Domain) => Promise<string | undefined>;

const pollResults: readonly PollResult[] = ['success', 'error', 'skipped'];
/** Tool calls are bounded by the 5 s tool timeout; most snapshot reads finish within tens of milliseconds. */
const TOOL_DURATION_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
/** Polls fan out to many upstream requests and may take tens of seconds. */
const POLL_DURATION_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120];

export class SwatMetrics {
  readonly registry = new Registry();
  private readonly toolCalls: Counter<'tool' | 'result'>;
  private readonly upstreamPolls: Counter<'kind' | 'result'>;
  private readonly lastPollSuccess: Gauge<'kind'>;
  private readonly toolDuration: Histogram<'tool'>;
  private readonly pollDuration: Histogram<'kind'>;
  private readonly pollKinds = new Set<string>();
  private readonly snapshotAge: Gauge<'domain'>;
  private snapshotObservedAt?: SnapshotObservedAt;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'swatgpt_mcp_' });
    this.toolCalls = new Counter({
      name: 'swatgpt_mcp_tool_calls_total',
      help: 'MCP tool calls by tool name and result',
      labelNames: ['tool', 'result'] as const,
      registers: [this.registry],
    });
    this.upstreamPolls = new Counter({
      name: 'swatgpt_mcp_upstream_polls_total',
      help: 'Background Dash polling jobs by job kind and result',
      labelNames: ['kind', 'result'] as const,
      registers: [this.registry],
    });
    this.lastPollSuccess = new Gauge({
      name: 'swatgpt_mcp_upstream_last_success_timestamp_seconds',
      help: 'Unix time of the last successful background Dash polling job by job kind',
      labelNames: ['kind'] as const,
      registers: [this.registry],
    });
    this.toolDuration = new Histogram({
      name: 'swatgpt_mcp_tool_duration_seconds',
      help: 'Wall time of MCP tool calls by tool name, including timed-out and failed calls',
      labelNames: ['tool'] as const,
      buckets: TOOL_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.pollDuration = new Histogram({
      name: 'swatgpt_mcp_poll_duration_seconds',
      help: 'Wall time of background Dash polling jobs by job kind, including failed and skipped runs',
      labelNames: ['kind'] as const,
      buckets: POLL_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.snapshotAge = new Gauge({
      name: 'swatgpt_mcp_snapshot_age_seconds',
      help: 'Seconds since the newest PostgreSQL snapshot for each data domain was observed',
      labelNames: ['domain'] as const,
      registers: [this.registry],
      collect: () => this.refreshSnapshotAges(),
    });
  }

  recordToolCall(tool: string, result: ToolCallResult, durationSeconds?: number): void {
    this.toolCalls.inc({ tool, result });
    if (durationSeconds !== undefined) this.toolDuration.observe({ tool }, durationSeconds);
  }

  /** Zero-fills every result for a new kind so `increase()` and `unless` see the series before its first change. */
  recordPoll(kind: string, result: PollResult, durationSeconds?: number): void {
    if (!this.pollKinds.has(kind)) {
      this.pollKinds.add(kind);
      for (const each of pollResults) this.upstreamPolls.inc({ kind, result: each }, 0);
    }
    this.upstreamPolls.inc({ kind, result });
    if (result === 'success') this.lastPollSuccess.set({ kind }, Date.now() / 1000);
    if (durationSeconds !== undefined) this.pollDuration.observe({ kind }, durationSeconds);
  }

  /** Registers the lookup used at scrape time to compute snapshot ages; unset means the gauge stays empty. */
  observeSnapshots(observedAt: SnapshotObservedAt | undefined): void {
    this.snapshotObservedAt = observedAt;
    this.snapshotAge.reset();
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  private async refreshSnapshotAges(): Promise<void> {
    const observedAt = this.snapshotObservedAt;
    if (!observedAt) return;
    const now = Date.now();
    await Promise.all(domains.map(async (domain) => {
      const seen = await observedAt(domain).catch(() => undefined);
      const seenMs = seen ? new Date(seen).getTime() : Number.NaN;
      if (Number.isNaN(seenMs)) {
        this.snapshotAge.remove({ domain });
        return;
      }
      this.snapshotAge.set({ domain }, Math.max(0, (now - seenMs) / 1000));
    }));
  }
}

export const metrics = new SwatMetrics();
