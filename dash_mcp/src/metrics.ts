import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { domains } from './types.js';
import type { Domain } from './types.js';

export type ToolCallResult = 'success' | 'error' | 'timeout';
export type PollResult = 'success' | 'error' | 'skipped';
export type SnapshotObservedAt = (domain: Domain) => Promise<string | undefined>;

export class SwatMetrics {
  readonly registry = new Registry();
  private readonly toolCalls: Counter<'tool' | 'result'>;
  private readonly upstreamPolls: Counter<'kind' | 'result'>;
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
    this.snapshotAge = new Gauge({
      name: 'swatgpt_mcp_snapshot_age_seconds',
      help: 'Seconds since the newest PostgreSQL snapshot for each data domain was observed',
      labelNames: ['domain'] as const,
      registers: [this.registry],
      collect: () => this.refreshSnapshotAges(),
    });
  }

  recordToolCall(tool: string, result: ToolCallResult): void {
    this.toolCalls.inc({ tool, result });
  }

  recordPoll(kind: string, result: PollResult): void {
    this.upstreamPolls.inc({ kind, result });
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
