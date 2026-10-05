import { describe, expect, it } from 'vitest';
import { SwatMetrics } from '../src/metrics.js';

describe('SwatMetrics', () => {
  it('counts tool calls and upstream polls by label', async () => {
    const metrics = new SwatMetrics();
    metrics.recordToolCall('get_weather', 'success');
    metrics.recordToolCall('get_weather', 'timeout');
    metrics.recordPoll('content', 'error');
    metrics.recordPoll('content', 'skipped');
    metrics.recordPoll('content', 'success');

    const rendered = await metrics.render();
    expect(rendered).toMatch(/swatgpt_mcp_tool_calls_total\{tool="get_weather",result="success"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_tool_calls_total\{tool="get_weather",result="timeout"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="content",result="error"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="content",result="skipped"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="content",result="success"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_process_cpu_seconds_total/);
  });

  it('zero-fills every poll result for a kind on its first record so failing kinds still expose a success series', async () => {
    const metrics = new SwatMetrics();
    metrics.recordPoll('realtime', 'error');

    const rendered = await metrics.render();
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="realtime",result="error"\} 1/);
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="realtime",result="success"\} 0/);
    expect(rendered).toMatch(/swatgpt_mcp_upstream_polls_total\{kind="realtime",result="skipped"\} 0/);
    expect(rendered).not.toMatch(/swatgpt_mcp_upstream_last_success_timestamp_seconds\{kind="realtime"\}/);
  });

  it('stamps the last successful poll per kind and leaves it untouched by later failures', async () => {
    const metrics = new SwatMetrics();
    const before = Date.now() / 1000;
    metrics.recordPoll('content', 'success');
    const after = Date.now() / 1000;
    const stampOf = async () => Number((await metrics.render())
      .match(/swatgpt_mcp_upstream_last_success_timestamp_seconds\{kind="content"\} ([\d.e+]+)/)?.[1]);

    const stamped = await stampOf();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);

    metrics.recordPoll('content', 'error');
    metrics.recordPoll('content', 'skipped');
    expect(await stampOf()).toBe(stamped);
  });

  it('computes snapshot age per domain at scrape time and drops domains without data', async () => {
    const metrics = new SwatMetrics();
    const observed = new Date(Date.now() - 90_000).toISOString();
    metrics.observeSnapshots(async (domain) => {
      if (domain === 'dining') return observed;
      if (domain === 'weather') throw new Error('database down');
      return undefined;
    });

    const rendered = await metrics.render();
    const age = Number(rendered.match(/swatgpt_mcp_snapshot_age_seconds\{domain="dining"\} ([\d.]+)/)?.[1]);
    expect(age).toBeGreaterThanOrEqual(90);
    expect(age).toBeLessThan(100);
    expect(rendered).not.toMatch(/swatgpt_mcp_snapshot_age_seconds\{domain="weather"\}/);
    expect(rendered).not.toMatch(/swatgpt_mcp_snapshot_age_seconds\{domain="events"\}/);
  });

  it('renders no snapshot ages before a lookup is registered', async () => {
    const rendered = await new SwatMetrics().render();
    expect(rendered).toMatch(/# TYPE swatgpt_mcp_snapshot_age_seconds gauge/);
    expect(rendered).not.toMatch(/swatgpt_mcp_snapshot_age_seconds\{/);
  });
});
