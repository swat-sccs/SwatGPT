import type { Config } from './config.js';
import type { SwatService } from './service.js';
import { metrics } from './metrics.js';
import { log } from './util.js';

export class PollScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<Promise<void>>();
  private stopped = false;

  constructor(private readonly config: Config, private readonly service: SwatService) {}

  start() {
    if (!this.config.pollingEnabled) {
      log('info', 'Background polling is disabled');
      return;
    }
    this.schedule('alerts', this.config.alertPollMs, () => this.service.getAlerts(100, true).then(() => undefined));
    this.schedule('realtime', this.config.realtimePollMs, () => this.service.syncRealtime());
    this.schedule('content', this.config.contentPollMs, () => this.service.syncContent());
    this.schedule('configuration', this.config.configPollMs, async () => { await this.service.refreshRegistry(); });
    this.schedule('retention', 86_400_000, () => this.service.pruneHistory());
  }

  /** Jobs currently executing. */
  get activeJobs(): number {
    return this.running.size;
  }

  /** Cancels every future run and resolves once the jobs already executing have finished. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.running]);
  }

  private schedule(name: string, intervalMs: number, task: () => Promise<void>) {
    const run = () => {
      if (this.stopped) return;
      const job: Promise<void> = this.execute(name, task).finally(() => {
        this.running.delete(job);
        if (this.stopped) return;
        const jitter = Math.floor(Math.random() * Math.min(5_000, intervalMs * 0.05));
        this.timers.set(name, setTimeout(run, intervalMs + jitter));
      });
      this.running.add(job);
    };
    let initialDelay = 250 + Math.floor(Math.random() * 1_000);
    if (name === 'configuration') {
      try {
        this.service.registry();
        initialDelay = intervalMs;
      } catch {
        // Startup remains available from PostgreSQL; retry missing discovery promptly.
      }
    }
    this.timers.set(name, setTimeout(run, initialDelay));
  }

  private async execute(name: string, task: () => Promise<void>): Promise<void> {
    const started = performance.now();
    const elapsedSeconds = () => (performance.now() - started) / 1000;
    try {
      const acquired = await this.service.store.withJobLock(name, async () => task());
      metrics.recordPoll(name, acquired ? 'success' : 'skipped', elapsedSeconds());
      if (!acquired) log('debug', 'Skipped poll because another instance owns the lock', { job: name });
    } catch (error) {
      metrics.recordPoll(name, 'error', elapsedSeconds());
      log('error', 'Polling job failed', { job: name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
