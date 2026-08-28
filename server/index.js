/**
 * HTTP + WebSocket сервер «Коридора».
 * Ноль внешних зависимостей: раздача статики + собственный WS.
 *
 *   node server/index.js            → http://localhost:8080
 *   PORT=3000 node server/index.js
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws.js';
import { Hub } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const hub = new Hub();

/* ------------------------------------------------------------------ */

function safeJoin(base, target) {
  const p = path.resolve(base, '.' + path.posix.normalize('/' + target));
  return p.startsWith(base) ? p : null;
}

async function serveFile(res, filePath, req) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
    ETag: etag,
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  }).catch(() => res.end());
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health' || pathname === '/api/stats') {
    const body = JSON.stringify({ ok: true, ...hub.stats(), uptime: Math.round(process.uptime()) });
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  // общий код правил лежит вне public/ — отдаём по префиксу /shared/
  if (pathname.startsWith('/shared/')) {
    const file = safeJoin(SHARED, pathname.slice('/shared'.length));
    if (file && await serveFile(res, file, req)) return;
    res.writeHead(404).end('Not found');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const file = safeJoin(PUBLIC, pathname);
  if (file && await serveFile(res, file, req)) return;

  // SPA-фолбэк: любые маршруты вида /r/CODE отдают index.html
  const index = path.join(PUBLIC, 'index.html');
  if (!path.extname(pathname) && await serveFile(res, index, req)) return;

  res.writeHead(404, { 'Content-Type': MIME['.txt'] });
  res.end('404 — страница не найдена');
});

attachWebSocket(server, (conn) => hub.attach(conn), { path: '/ws' });

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`\n  КОРИДОР — сервер запущен`);
  console.log(`  http://${shown}:${PORT}`);
  console.log(`  ws://${shown}:${PORT}/ws\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n  Останавливаюсь…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
