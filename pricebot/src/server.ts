import { createServer } from 'node:http';

export function createApp(health: () => unknown) {
  return createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health()));
  });
}
