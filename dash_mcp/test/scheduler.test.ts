import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { metrics } from '../src/metrics.js';
import { PollScheduler } from '../src/scheduler.js';
import type { SwatService } from '../src/service.js';

const ALERT_INTERVAL_MS = 1_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PollScheduler', () => {
  it('reschedules a job after its task throws', async () => {
    const { scheduler, service } = build(vi.fn().mockRejectedValue(new Error('Dash offline')));
    scheduler.start();

    await vi.advanceTimersByTimeAsync(250);
    expect(service.getAlerts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ALERT_INTERVAL_MS);
    expect(service.getAlerts).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it('observes each run in the poll latency histogram', async () => {
    const { scheduler } = build(vi.fn().mockResolvedValue(undefined));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(250);
    await scheduler.stop();

    expect(await metrics.render()).toMatch(/swatgpt_mcp_poll_duration_seconds_count\{kind="alerts"\} [1-9]/);
  });

  it('stop() waits for the job that is executing', async () => {
    let finish!: () => void;
    const inFlight = new Promise<void>((resolve) => { finish = resolve; });
    const { scheduler } = build(vi.fn().mockReturnValue(inFlight));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(scheduler.activeJobs).toBe(1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => { stopped = true; });
    await vi.advanceTimersByTimeAsync(10);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);
    expect(scheduler.activeJobs).toBe(0);
  });

  it('never reschedules once stopped, even for a job that finished after stop()', async () => {
    let finish!: () => void;
    const inFlight = new Promise<void>((resolve) => { finish = resolve; });
    const getAlerts = vi.fn().mockReturnValueOnce(inFlight).mockResolvedValue(undefined);
    const { scheduler, service } = build(getAlerts);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(250);

    const stopping = scheduler.stop();
    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(ALERT_INTERVAL_MS * 10);

    expect(service.getAlerts).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

function build(getAlerts: ReturnType<typeof vi.fn>) {
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', POLLING_ENABLED: 'true',
    ALERT_POLL_INTERVAL_SECONDS: String(ALERT_INTERVAL_MS / 1000),
  });
  const service = {
    store: { withJobLock: vi.fn(async (_job: string, task: (runId: string) => Promise<void>) => { await task('1'); return true; }) },
    registry: () => ({ hashes: ['test'] }),
    getAlerts,
    syncRealtime: vi.fn().mockResolvedValue(undefined),
    syncContent: vi.fn().mockResolvedValue(undefined),
    refreshRegistry: vi.fn().mockResolvedValue(undefined),
    pruneHistory: vi.fn().mockResolvedValue(undefined),
  } as unknown as SwatService;
  return { scheduler: new PollScheduler(config, service), service };
}
