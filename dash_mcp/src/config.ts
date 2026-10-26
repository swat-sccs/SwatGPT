import { z } from 'zod';

const bool = (fallback: boolean) => z.enum(['true', 'false', '1', '0']).default(fallback ? 'true' : 'false')
  .transform((value) => value === 'true' || value === '1');
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const nonNegativeInt = (fallback: number) => z.coerce.number().int().min(0).default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_ALLOWED_HOSTS: z.string().default('swatgpt-mcp,localhost,127.0.0.1'),
  MCP_TOOL_TIMEOUT_MS: positiveInt(5_000),
  MCP_SESSION_IDLE_SECONDS: positiveInt(1_800),
  MCP_MAX_SESSIONS: positiveInt(256),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DASH_BASE_URL: z.string().url().default('https://dash.swarthmore.edu'),
  UPSTREAM_TIMEOUT_MS: positiveInt(10_000),
  UPSTREAM_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  UPSTREAM_CONCURRENCY: positiveInt(6),
  POLLING_ENABLED: bool(true),
  ALERT_POLL_INTERVAL_SECONDS: positiveInt(60),
  REALTIME_POLL_INTERVAL_SECONDS: positiveInt(300),
  CONTENT_POLL_INTERVAL_SECONDS: positiveInt(900),
  CONFIG_POLL_INTERVAL_SECONDS: positiveInt(3600),
  OBSERVATION_RETENTION_DAYS: positiveInt(30),
  ARCHIVE_RETENTION_DAYS: nonNegativeInt(0),
  SYNC_RUN_RETENTION_DAYS: positiveInt(30),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    allowedHosts: parsed.MCP_ALLOWED_HOSTS.split(',').map((value) => value.trim()).filter(Boolean),
    mcpToolTimeoutMs: parsed.MCP_TOOL_TIMEOUT_MS,
    mcpSessionIdleMs: parsed.MCP_SESSION_IDLE_SECONDS * 1000,
    mcpMaxSessions: parsed.MCP_MAX_SESSIONS,
    databaseUrl: parsed.DATABASE_URL,
    dashBaseUrl: parsed.DASH_BASE_URL.replace(/\/$/, ''),
    upstreamTimeoutMs: parsed.UPSTREAM_TIMEOUT_MS,
    upstreamRetries: parsed.UPSTREAM_RETRIES,
    upstreamConcurrency: parsed.UPSTREAM_CONCURRENCY,
    pollingEnabled: parsed.POLLING_ENABLED,
    alertPollMs: parsed.ALERT_POLL_INTERVAL_SECONDS * 1000,
    realtimePollMs: parsed.REALTIME_POLL_INTERVAL_SECONDS * 1000,
    contentPollMs: parsed.CONTENT_POLL_INTERVAL_SECONDS * 1000,
    configPollMs: parsed.CONFIG_POLL_INTERVAL_SECONDS * 1000,
    observationRetentionDays: parsed.OBSERVATION_RETENTION_DAYS,
    /** Days of record history to keep; 0 keeps the archive forever. */
    archiveRetentionDays: parsed.ARCHIVE_RETENTION_DAYS,
    syncRunRetentionDays: parsed.SYNC_RUN_RETENTION_DAYS,
    logLevel: parsed.LOG_LEVEL,
  } as const;
}
