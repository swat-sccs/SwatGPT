import type { Config } from './config.js';
import type { SwatService } from './service.js';
import { log } from './util.js';

export class PollScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopped = false;

  constructor(private readonly config: Config, private readonly service: SwatService) {}

  start() {
    if (!this.config.pollingEnabled) {
      log('info', 'Background polling is disabled');
      return;
    }
    this.schedule('alerts', this.config.alertPollMs, () => this.service.getAlerts(100).then(() => undefined));
    this.schedule('realtime', this.config.realtimePollMs, () => this.service.syncRealtime());
    this.schedule('content', this.config.contentPollMs, () => this.service.syncContent());
    this.schedule('configuration', this.config.configPollMs, async () => { await this.service.refreshRegistry(); });
    this.schedule('retention', 86_400_000, async () => {
      const deleted = await this.service.store.pruneObservations(this.config.observationRetentionDays);
      log('info', 'Pruned old high-frequency observations', { deleted });
    });
  }

  stop() {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(name: string, intervalMs: number, task: () => Promise<void>) {
    const run = async () => {
      if (this.stopped) return;
      try {
        const acquired = await this.service.store.withJobLock(name, async () => task());
        if (!acquired) log('debug', 'Skipped poll because another instance owns the lock', { job: name });
      } catch (error) {
        log('error', 'Polling job failed', { job: name, error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!this.stopped) {
          const jitter = Math.floor(Math.random() * Math.min(5_000, intervalMs * 0.05));
          const timer = setTimeout(run, intervalMs + jitter);
          this.timers.set(name, timer);
        }
      }
    };
    const initialDelay = name === 'configuration' ? intervalMs : 250 + Math.floor(Math.random() * 1_000);
    const timer = setTimeout(run, initialDelay);
    this.timers.set(name, timer);
  }
}
