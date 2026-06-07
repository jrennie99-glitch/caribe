// server.js — real HTTP server (Node built-in http). Serves the PWA + JSON API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { seed } from './db.js';
import { verifyToken } from './auth.js';
import * as api from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');           // project root (serves index.html etc.)
const PORT = process.env.PORT || 8080;

seed();

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.png':'image/png', '.ico':'image/x-icon',
};

const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});

// route table: [method, path, handler, requiresAuth]
const ROUTES = [
  ['POST', '/api/register',     (uid, b) => api.register(b),       false],
  ['POST', '/api/login',        (uid, b) => api.login(b),          false],
  ['GET',  '/api/me',           (uid)    => api.me(uid),           true ],
  ['GET',  '/api/directory',    (uid)    => api.directory(uid),    true ],
  ['GET',  '/api/transactions', (uid)    => api.transactions(uid), true ],
  ['GET',  '/api/health',       ()       => api.health(),          false],
  ['GET',  '/api/fees',         ()       => api.fees(),            false],
  ['POST', '/api/transfer',     (uid, b) => api.transfer(uid, b),  true ],
  ['POST', '/api/pay',          (uid, b) => api.pay(uid, b),       true ],
  ['POST', '/api/bill',         (uid, b) => api.bill(uid, b),      true ],
  ['POST', '/api/cashin',       (uid, b) => api.cashin(uid, b),    true ],
  ['POST', '/api/cashout',      (uid, b) => api.cashout(uid, b),   true ],
];

async function handleApi(req, res, url) {
  const route = ROUTES.find(r => r[0] === req.method && r[1] === url.pathname);
  if (!route) return send(res, 404, { error: 'not_found' });
  const [, , handler, needsAuth] = route;
  let uid = null;
  if (needsAuth) {
    const auth = req.headers['authorization'] || '';
    uid = verifyToken(auth.replace(/^Bearer\s+/i, ''));
    if (!uid) return send(res, 401, { error: 'unauthorized', message: 'Please log in again' });
  }
  const body = req.method === 'POST' ? await readBody(req) : {};
  try {
    const { status, body: out } = await handler(uid, body);
    send(res, status, out);
  } catch (e) {
    console.error('[api error]', url.pathname, e);
    send(res, 500, { error: 'server_error', message: 'Something went wrong' });
  }
}

async function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // prevent path traversal
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`\n  🌊 Caribe running — real backend, real ledger`);
  console.log(`  → http://localhost:${PORT}\n`);
});
