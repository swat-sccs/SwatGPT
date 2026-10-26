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
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log('info', 'Shutting down', { signal });
    scheduler.stop();
    await http.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/** Lets the container watchdog target the server itself instead of the unkillable PID 1. */
async function recordPid(): Promise<void> {
  try {
    await writeFile(DEFAULT_PID_FILE, String(process.pid), 'utf8');
  } catch (error) {
    log('warn', 'Could not write the PID file; the watchdog will fall back to signalling PID 1', {
      path: DEFAULT_PID_FILE, error: error instanceof Error ? error.message : String(error),
    });
  }
}

main().catch((error) => {
  log('error', 'Fatal startup error', { error: error instanceof Error ? error.stack ?? error.message : String(error) });
  process.exit(1);
});
