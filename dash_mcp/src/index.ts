import { writeFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { DEFAULT_PID_FILE } from './healthcheck.js';
import { SwatHttpServer } from './http.js';
import { metrics } from './metrics.js';
import { PollScheduler } from './scheduler.js';
import { SwatService } from './service.js';
import { PgStore } from './storage/store.js';
import { DashClient } from './upstream/client.js';
import { RegistryDiscovery } from './upstream/discovery.js';
import { log, setLogLevel } from './util.js';

/** Longest a graceful shutdown may take before the process exits regardless. */
const SHUTDOWN_DEADLINE_MS = 8_000;

async function main() {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  const store = new PgStore(config.databaseUrl);
  const client = new DashClient(config);
  const discovery = new RegistryDiscovery(client);
  const service = new SwatService(config, client, discovery, store);
  const scheduler = new PollScheduler(config, service);
  const http = new SwatHttpServer(config, service);
  metrics.observeSnapshots((domain) => service.snapshotObservedAt(domain));

  await service.initialize();
  await http.listen();
  await recordPid();
  scheduler.start();

  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      log('error', 'Shutdown exceeded its deadline; exiting', { deadlineMs: SHUTDOWN_DEADLINE_MS });
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    deadline.unref();
    shutdown(signal, scheduler, http, store).then(
      (code) => process.exit(code),
      (error) => {
        log('error', 'Shutdown failed', { error: describe(error) });
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

/** Stops polling and the listener together, then the pool once no job can still use it. */
async function shutdown(signal: string, scheduler: PollScheduler, http: SwatHttpServer, store: PgStore): Promise<number> {
  log('info', 'Shutting down', { signal });
  const steps = await Promise.allSettled([scheduler.stop(), http.close()]);
  steps.push(...await Promise.allSettled([store.close()]));
  const failures = steps.filter((step): step is PromiseRejectedResult => step.status === 'rejected');
  for (const failure of failures) log('error', 'Shutdown step failed', { error: describe(failure.reason) });
  return failures.length ? 1 : 0;
}

/** Lets the container watchdog target the server itself instead of the unkillable PID 1. */
async function recordPid(): Promise<void> {
  try {
    await writeFile(DEFAULT_PID_FILE, String(process.pid), 'utf8');
  } catch (error) {
    log('warn', 'Could not write the PID file; the watchdog will fall back to signalling PID 1', {
      path: DEFAULT_PID_FILE, error: describe(error),
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

main().catch((error) => {
  log('error', 'Fatal startup error', { error: describe(error) });
  process.exit(1);
});
