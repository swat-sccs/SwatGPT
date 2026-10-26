import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHealthcheck, terminateServer } from '../src/healthcheck.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('container health watchdog', () => {
  it('terminates PID 1 only after the configured consecutive failure threshold', async () => {
    const failureFile = await temporaryFailureFile();
    const killProcess = vi.fn();
    const options = {
      failureFile,
      failureThreshold: 3,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused')),
      killProcess,
      log: vi.fn(),
    };

    expect(await runHealthcheck(options)).toBe(1);
    expect(await runHealthcheck(options)).toBe(1);
    expect(killProcess).not.toHaveBeenCalled();
    expect(await runHealthcheck(options)).toBe(1);
    expect(killProcess).toHaveBeenCalledOnce();
  });

  it('clears the consecutive failure counter after a successful probe', async () => {
    const failureFile = await temporaryFailureFile();
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    const options = { failureFile, failureThreshold: 3, fetchImpl: failing, killProcess: vi.fn(), log: vi.fn() };

    await runHealthcheck(options);
    await runHealthcheck({
      ...options,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 })),
    });
    await expect(readFile(failureFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function temporaryFailureFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'swatgpt-healthcheck-'));
  temporaryDirectories.push(directory);
  return join(directory, 'failures');
}

describe('watchdog kill target', () => {
  it('sends SIGKILL to the PID recorded by the server', async () => {
    const pidFile = await temporaryFailureFile();
    await writeFile(pidFile, '4242\n', 'utf8');
    const kill = vi.fn();
    const options = {
      failureFile: `${pidFile}.failures`, pidFile, failureThreshold: 1, kill, log: vi.fn(),
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused')),
    };

    expect(await runHealthcheck(options)).toBe(1);
    expect(kill).toHaveBeenCalledExactlyOnceWith(4242, 'SIGKILL');
  });

  it('falls back to a SIGTERM for the container init when no PID file exists', async () => {
    const kill = vi.fn();
    const log = vi.fn();
    await terminateServer('/nonexistent/swatgpt-mcp.pid', kill, log);
    expect(kill).toHaveBeenCalledExactlyOnceWith(1, 'SIGTERM');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SIGTERM to PID 1'));
  });

  it('never targets PID 1 with SIGKILL even if the file says so', async () => {
    const pidFile = await temporaryFailureFile();
    await writeFile(pidFile, '1', 'utf8');
    const kill = vi.fn();
    await terminateServer(pidFile, kill, vi.fn());
    expect(kill).toHaveBeenCalledExactlyOnceWith(1, 'SIGTERM');
  });
});
