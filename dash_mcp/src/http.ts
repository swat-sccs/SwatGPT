import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { isInitializeRequest, type McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { createMcpServer } from './mcp/tools.js';
import type { SwatService } from './service.js';
import { log } from './util.js';

interface Session {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
}

export class SwatHttpServer {
  private readonly sessions = new Map<string, Session>();
  private httpServer?: HttpServer;

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

    app.all('/mcp', async (req, res) => {
      try {
        const sessionId = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
        if (sessionId) {
          const session = this.sessions.get(sessionId);
          if (!session) {
            res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown MCP session' }, id: null });
            return;
          }
          await session.transport.handleRequest(req, res, req.body);
          return;
        }
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'MCP initialization required' }, id: null });
          return;
        }

        let transport!: NodeStreamableHTTPServerTransport;
        const mcpServer = createMcpServer(this.service);
        transport = new NodeStreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id) => {
            this.sessions.set(id, { transport, server: mcpServer });
            log('info', 'MCP session initialized', { sessionId: id });
          },
          onsessionclosed: async (id) => {
            this.sessions.delete(id);
            await mcpServer.close().catch(() => undefined);
            log('info', 'MCP session closed', { sessionId: id });
          },
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        log('error', 'MCP HTTP request failed', { error: error instanceof Error ? error.message : String(error) });
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer = app.listen(this.config.port, this.config.host, (error?: Error) => error ? reject(error) : resolve());
      this.httpServer.once('error', reject);
    });
    log('info', 'SwatGPT MCP server listening', { host: this.config.host, port: this.config.port });
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map(async ({ transport, server }) => {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }));
    this.sessions.clear();
    if (this.httpServer) await new Promise<void>((resolve, reject) => this.httpServer!.close((error) => error ? reject(error) : resolve()));
  }
}
