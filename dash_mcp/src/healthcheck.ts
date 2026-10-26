import { readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Where the server records its own PID so the watchdog can target it rather than the container init. */
export const DEFAULT_PID_FILE = '/tmp/swatgpt-mcp.pid';

type KillSignal = (pid: number, signal: NodeJS.Signals) => void;

interface HealthcheckOptions {
  endpoint?: string;
  timeoutMs?: number;
  failureThreshold?: number;
  failureFile?: string;
  pidFile?: string;
  fetchImpl?: typeof fetch;
  kill?: KillSignal;
  killProcess?: () => void | Promise<void>;
  log?: (message: string) => void;
}

export async function runHealthcheck(options: HealthcheckOptions = {}): Promise<number> {
  const endpoint = options.endpoint ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}/healthz`;
  const timeoutMs = options.timeoutMs ?? positiveInt(process.env.HEALTHCHECK_PROBE_TIMEOUT_MS, 4_000);
  const failureThreshold = options.failureThreshold ?? positiveInt(process.env.HEALTHCHECK_FAILURE_THRESHOLD, 3);
  const failureFile = options.failureFile ?? '/tmp/swatgpt-mcp-health-failures';
  const pidFile = options.pidFile ?? DEFAULT_PID_FILE;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((message) => process.stderr.write(`${message}\n`));
  const kill = options.kill ?? ((pid, signal) => process.kill(pid, signal));
  const killProcess = options.killProcess ?? (() => terminateServer(pidFile, kill, log));

  try {
    const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`health endpoint returned HTTP ${response.status}`);
    await rm(failureFile, { force: true });
    return 0;
  } catch (error) {
    const failures = await incrementFailures(failureFile);
    const reason = error instanceof Error ? error.message : String(error);
    log(`SwatGPT MCP health probe failed (${failures}/${failureThreshold}): ${reason}`);
    if (failures >= failureThreshold) {
      log('SwatGPT MCP remained unresponsive; terminating the server so Docker can restart the container');
      await killProcess();
    }
    return 1;
  }
}

/**
 * SIGKILL goes to the server PID recorded at startup; the kernel ignores a SIGKILL aimed at
 * PID 1 of a PID namespace, so without a PID file the fallback is a SIGTERM to the container
 * init, which forwards it to the server when the service runs with `init: true`.
 */
export async function terminateServer(pidFile: string, kill: KillSignal, log: (message: string) => void): Promise<void> {
  const pid = await readPid(pidFile);
  if (pid === undefined) {
    log(`No server PID recorded at ${pidFile}; sending SIGTERM to PID 1`);
    kill(1, 'SIGTERM');
    return;
  }
  log(`Sending SIGKILL to server PID ${pid}`);
  kill(pid, 'SIGKILL');
}

async function readPid(path: string): Promise<number | undefined> {
  try {
    const pid = Number.parseInt(await readFile(path, 'utf8'), 10);
    return Number.isInteger(pid) && pid > 1 ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function incrementFailures(path: string): Promise<number> {
  let failures = 0;
  try {
    failures = Number.parseInt(await readFile(path, 'utf8'), 10);
    if (!Number.isFinite(failures)) failures = 0;
  } catch {
    // A missing counter is the normal first-failure case.
  }
  failures += 1;
  await writeFile(path, String(failures), 'utf8');
  return failures;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runHealthcheck().then((code) => process.exit(code));
}
