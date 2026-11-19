import { createServer, type Server, type ServerResponse } from 'node:http';
import { parseQuery, resolveLatency } from './resolve.ts';
import type { Store } from './store.ts';

const HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

function send(res: ServerResponse, status: number, body: unknown, head = false): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...HEADERS, 'content-length': Buffer.byteLength(text) });
  res.end(head ? undefined : text);
}

export type ServerDeps = { store: Store; health: () => unknown };

export function createApp({ store, health }: ServerDeps): Server {
  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        ...HEADERS,
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': '*',
      });
      res.end();
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
    const head = method === 'HEAD';
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return send(res, 400, { error: 'bad request' }, head);
    }
    if (url.pathname === '/health') return send(res, 200, health(), head);
    if (url.pathname !== '/latency') return send(res, 404, { error: 'not found' }, head);

    const q = parseQuery(url.searchParams);
    if (!q.ok) return send(res, 400, { error: q.error }, head);
    const latency = resolveLatency(store, q.chainId, q.orderId);
    if (!latency) return send(res, 404, { error: 'unknown' }, head);
    send(res, 200, latency, head);
  });
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });
  return server;
}
