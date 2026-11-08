import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { HostMessage, WebviewMessage } from '../shared/ipc';

export interface HubServerOptions {
  port: number;
  staticDir: string;
  onMessage: (message: WebviewMessage) => void | Promise<void>;
  onClientConnected?: () => void;
}

/**
 * El servidor ejecuta comandos en tu máquina: solo se aceptan peticiones de la propia interfaz.
 * `Host` frena el DNS rebinding; `Origin`, a cualquier web abierta en el navegador.
 */
export function isTrustedRequest(headers: http.IncomingHttpHeaders, port: number): boolean {
  const allowed = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!allowed.includes(headers.host ?? '')) return false;
  const origin = headers.origin;
  return !origin || allowed.some((host) => origin === `http://${host}`);
}

export class HubServer {
  private server?: http.Server;
  private sseClients = new Set<http.ServerResponse>();
  private currentPort: number;

  constructor(private readonly options: HubServerOptions) {
    this.currentPort = options.port;
  }

  public get port(): number {
    return this.currentPort;
  }

  public get url(): string {
    // IP y no `localhost`: en Windows resuelve a ::1 y acabaría en otro servidor del mismo puerto.
    return `http://127.0.0.1:${this.currentPort}`;
  }

  public get clientCount(): number {
    return this.sseClients.size;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (port: number, attemptsLeft: number) => {
        const server = http.createServer((req, res) => {
          if (!isTrustedRequest(req.headers, port)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('AgentHub: origen no permitido');
            return;
          }

          const url = new URL(req.url ?? '/', `http://localhost:${port}`);

          // Health / Status endpoint
          if (url.pathname === '/api/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'running', port, clients: this.sseClients.size }));
            return;
          }

          // SSE endpoint
          if (url.pathname === '/events' && req.method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive'
            });
            res.write(': connected\n\n');
            this.sseClients.add(res);

            req.on('close', () => {
              this.sseClients.delete(res);
            });

            this.options.onClientConnected?.();
            return;
          }

          // API message endpoint
          if (url.pathname === '/api/message' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const message = JSON.parse(body) as WebviewMessage;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                await this.options.onMessage(message);
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
              }
            });
            return;
          }

          // Static files
          this.serveStatic(url.pathname, res);
        });

        server.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
            server.close();
            tryListen(port + 1, attemptsLeft - 1);
          } else {
            reject(err);
          }
        });

        // Solo esta máquina: en 0.0.0.0 cualquiera de la red podría mandar comandos.
        server.listen(port, '127.0.0.1', () => {
          this.server = server;
          this.currentPort = port;
          resolve(port);
        });
      };

      tryListen(this.options.port, 10);
    });
  }

  public broadcast(message: HostMessage): void {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try {
          client.end();
        } catch {}
      }
      this.sseClients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    const root = path.resolve(this.options.staticDir);
    let decoded = 'index.html';
    try {
      if (pathname !== '/') decoded = decodeURIComponent(pathname);
    } catch {}
    let filePath = path.join(root, decoded);

    if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(this.options.staticDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('AgentHub: static files not found in ' + this.options.staticDir);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }
}
