import { loadConfig } from './config.js';
import { SwatHttpServer } from './http.js';
import { PollScheduler } from './scheduler.js';
import { SwatService } from './service.js';
import { PgStore } from './storage/store.js';
import { DashClient } from './upstream/client.js';
import { RegistryDiscovery } from './upstream/discovery.js';
import { log } from './util.js';

async function main() {
  const config = loadConfig();
  const store = new PgStore(config.databaseUrl);
  const client = new DashClient(config);
  const discovery = new RegistryDiscovery(client);
  const service = new SwatService(config, client, discovery, store);
  const scheduler = new PollScheduler(config, service);
  const http = new SwatHttpServer(config, service);

  await service.initialize();
  await http.listen();
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

main().catch((error) => {
  log('error', 'Fatal startup error', { error: error instanceof Error ? error.stack ?? error.message : String(error) });
  process.exit(1);
});
