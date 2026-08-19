import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHealthcheck } from '../src/healthcheck.js';

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
