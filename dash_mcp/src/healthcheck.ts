import { readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

interface HealthcheckOptions {
  endpoint?: string;
  timeoutMs?: number;
  failureThreshold?: number;
  failureFile?: string;
  fetchImpl?: typeof fetch;
  killProcess?: () => void;
  log?: (message: string) => void;
}

export async function runHealthcheck(options: HealthcheckOptions = {}): Promise<number> {
  const endpoint = options.endpoint ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}/healthz`;
  const timeoutMs = options.timeoutMs ?? positiveInt(process.env.HEALTHCHECK_PROBE_TIMEOUT_MS, 4_000);
  const failureThreshold = options.failureThreshold ?? positiveInt(process.env.HEALTHCHECK_FAILURE_THRESHOLD, 3);
  const failureFile = options.failureFile ?? '/tmp/swatgpt-mcp-health-failures';
  const fetchImpl = options.fetchImpl ?? fetch;
  const killProcess = options.killProcess ?? (() => process.kill(1, 'SIGKILL'));
  const log = options.log ?? ((message) => process.stderr.write(`${message}\n`));

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
      log('SwatGPT MCP remained unresponsive; terminating PID 1 so Docker can restart it');
      killProcess();
    }
    return 1;
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
