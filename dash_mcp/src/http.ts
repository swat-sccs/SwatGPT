import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, ServerResponse } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { isInitializeRequest, type McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { createMcpServer } from './mcp/tools.js';
import { metrics } from './metrics.js';
import type { SwatService } from './service.js';
import { log } from './util.js';

interface Session {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  lastSeen: number;
  /** Requests still open on this session, such as LibreChat's long-lived GET event stream. */
  openRequests: number;
}

const SESSION_SWEEP_INTERVAL_MS = 60_000;

export class SwatHttpServer {
  private readonly sessions = new Map<string, Session>();
  private httpServer?: HttpServer;
  private sweeper?: NodeJS.Timeout;

  constructor(private readonly config: Config, private readonly service: SwatService) {}

  async listen(): Promise<void> {
    const app = createMcpExpressApp({
      host: this.config.host,
      allowedHosts: this.config.allowedHosts,
      jsonLimit: '256kb',
    });

    app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
    app.get('/readyz', async (_req, res) => {
      const database = await this.service.store.ping();
      let registry = false;
      try { registry = this.service.registry().hashes.length > 0; } catch { registry = false; }
      res.status(database ? 200 : 503).json({ status: database ? 'ready' : 'not-ready', database, registry });
    });

    app.get('/metrics', async (_req, res) => {
      try {
        res.type(metrics.registry.contentType).send(await metrics.render());
      } catch (error) {
        log('error', 'Metrics collection failed', { error: error instanceof Error ? error.message : String(error) });
        if (!res.headersSent) res.status(500).type('text/plain').send('metrics unavailable');
      }
    });

    app.all('/mcp', async (req, res) => {
      try {
        const sessionId = headerString(req.headers['mcp-session-id']);
        if (sessionId) {
          const session = this.sessions.get(sessionId);
          if (!session) {
            res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown MCP session' }, id: null });
            return;
          }
          this.track(session, res);
          await session.transport.handleRequest(req, res, req.body);
          return;
        }
        if (req.method !== 'POST' || !isMcpInitializeRequest(req.body)) {
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'MCP initialization required' }, id: null });
          return;
        }
        if (!this.makeRoomForSession()) {
          res.status(503).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many active MCP sessions' }, id: null });
          return;
        }

        const nextSessionId = randomUUID();
        const mcpServer = createMcpServer(this.service);
        const transport = new NodeStreamableHTTPServerTransport({
          sessionIdGenerator: () => nextSessionId,
          onsessioninitialized: (id) => {
            const session: Session = { transport, server: mcpServer, lastSeen: Date.now(), openRequests: 0 };
            this.sessions.set(id, session);
            this.track(session, res);
            log('info', 'MCP session initialized', { sessionId: id });
          },
          onsessionclosed: async (id) => {
            await this.closeSession(id);
            log('info', 'MCP session closed', { sessionId: id });
          },
        });
        try {
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          this.sessions.delete(nextSessionId);
          await closeQuietly(transport, mcpServer);
          throw error;
        }
        if (!this.sessions.has(nextSessionId)) await closeQuietly(transport, mcpServer);
      } catch (error) {
        log('error', 'MCP HTTP request failed', { error: error instanceof Error ? error.message : String(error) });
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer = app.listen(this.config.port, this.config.host, (error?: Error) => error ? reject(error) : resolve());
      this.httpServer.once('error', reject);
    });
    this.sweeper = setInterval(() => void this.sweepIdleSessions(), SESSION_SWEEP_INTERVAL_MS);
    this.sweeper.unref();
    log('info', 'SwatGPT MCP server listening', { host: this.config.host, port: this.config.port });
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Closes sessions with no open request that have been idle longer than the configured TTL.
   * Clients that vanish without a DELETE (crash, network loss) are reclaimed this way; a swept
   * client that comes back gets 404, which tells it to re-initialize.
   */
  async sweepIdleSessions(now = Date.now()): Promise<number> {
    const idle = [...this.sessions.entries()]
      .filter(([, session]) => session.openRequests === 0 && now - session.lastSeen > this.config.mcpSessionIdleMs)
      .map(([id]) => id);
    await Promise.all(idle.map((id) => this.closeSession(id)));
    if (idle.length) log('info', 'Closed idle MCP sessions', { closed: idle.length, remaining: this.sessions.size });
    return idle.length;
  }

  private track(session: Session, res: ServerResponse): void {
    session.lastSeen = Date.now();
    session.openRequests += 1;
    res.once('close', () => {
      session.openRequests -= 1;
      session.lastSeen = Date.now();
    });
  }

  /** Keeps the map under the cap by evicting the least recently seen idle session. */
  private makeRoomForSession(): boolean {
    if (this.sessions.size < this.config.mcpMaxSessions) return true;
    const oldest = [...this.sessions.entries()]
      .filter(([, session]) => session.openRequests === 0)
      .reduce<[string, Session] | undefined>((best, entry) => !best || entry[1].lastSeen < best[1].lastSeen ? entry : best, undefined);
    if (!oldest) return false;
    void this.closeSession(oldest[0]);
    log('warn', 'Evicted the least recently used MCP session to stay under the session cap', { sessionId: oldest[0] });
    return true;
  }

  private async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    await closeQuietly(session.transport, session.server);
  }

  async close(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
    await Promise.all([...this.sessions.keys()].map((id) => this.closeSession(id)));
    if (this.httpServer) await new Promise<void>((resolve, reject) => this.httpServer!.close((error) => error ? reject(error) : resolve()));
  }
}

async function closeQuietly(transport: NodeStreamableHTTPServerTransport, server: McpServer): Promise<void> {
  await transport.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) return value.find((item) => typeof item === 'string' && item.length > 0);
  return undefined;
}

function isMcpInitializeRequest(body: unknown): boolean {
  if (isInitializeRequest(body)) return true;
  return Boolean(body && typeof body === 'object' && (body as { method?: unknown }).method === 'initialize');
}
