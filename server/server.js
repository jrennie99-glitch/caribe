// server.js — hardened HTTP server (Node built-in http). Serves the PWA + JSON API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { config, isProd } from './config.js';
import { db, seed } from './db.js';
import { verifyToken, adminKey } from './auth.js';
import { rail } from './rail.js';
import * as api from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = config.port;

seed();

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2',
};

// long-cache fingerprintable static assets; HTML/SW always revalidate
const cacheControl = (p) =>
  /\.(woff2|png|svg)$/.test(p) ? 'public, max-age=31536000, immutable'
  : /\.(js|css)$/.test(p) ? 'public, max-age=3600'
  : 'no-cache';

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
    "media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};
const applyHeaders = (res) => { for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v); };

const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 1.2e7) { req.destroy(); reject(new Error('too_large')); } });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  req.on('error', reject);
});

// real client IP (trust the proxy's X-Forwarded-For only when configured)
const clientIp = (req) => {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

// ---- in-memory rate limiter (per IP per bucket). Single-node; use Redis for multi-node. ----
const buckets = new Map();
function rateLimit(ip, bucket, max, windowMs) {
  const key = bucket + ':' + ip, t = Date.now();
  let e = buckets.get(key);
  if (!e || e.resetAt < t) { e = { count: 0, resetAt: t + windowMs }; buckets.set(key, e); }
  e.count++;
  return e.count <= max ? null : Math.ceil((e.resetAt - t) / 1000);
}
setInterval(() => { const t = Date.now(); for (const [k, e] of buckets) if (e.resetAt < t) buckets.delete(k); }, 60000).unref();
const LIMITS = {
  '/api/login':    { max: 8,   windowMs: 60000 },
  '/api/register': { max: 5,   windowMs: 60000 },
  '/api/kyc/document': { max: 10, windowMs: 60000 },
  '/api/demo':     { max: 6,   windowMs: 60000 },
  _global:         { max: 240, windowMs: 60000 },
};

const ROUTES = [
  ['POST', '/api/register',     (uid, b) => api.register(b),       false],
  ['POST', '/api/login',        (uid, b) => api.login(b),          false],
  ['GET',  '/api/me',           (uid)    => api.me(uid),           true ],
  ['GET',  '/api/directory',    (uid)    => api.directory(uid),    true ],
  ['GET',  '/api/transactions', (uid)    => api.transactions(uid), true ],
  ['GET',  '/api/summary',      (uid)    => api.summary(uid),      true ],
  ['GET',  '/api/health',       ()       => api.health(),          false],
  ['GET',  '/api/fees',         ()       => api.fees(),            false],
  ['GET',  '/api/islands',      ()       => api.islands(),         false],
  ['POST', '/api/demo',         ()       => api.demo(),            false],
  ['POST', '/api/kyc/document', (uid,b)     => api.kycDocument(uid, b),       true ],
  ['GET',  '/api/kyc/pending',  (uid,b,q,h) => api.kycPending(uid, b, q, h),  false],
  ['POST', '/api/kyc/review',   (uid,b,q,h) => api.kycReview(uid, b, q, h),   false],
  ['POST', '/api/transfer',     (uid, b) => api.transfer(uid, b),  true ],
  ['POST', '/api/pay',          (uid, b) => api.pay(uid, b),       true ],
  ['POST', '/api/bill',         (uid, b) => api.bill(uid, b),      true ],
  ['POST', '/api/cashin',       (uid, b) => api.cashin(uid, b),    true ],
  ['POST', '/api/cashout',      (uid, b) => api.cashout(uid, b),   true ],
];

async function handleApi(req, res, url, ip) {
  const path = url.pathname;
  // rate limit: per-route then global
  const rl = LIMITS[path];
  const retry = (rl && rateLimit(ip, path, rl.max, rl.windowMs)) || rateLimit(ip, '_g', LIMITS._global.max, LIMITS._global.windowMs);
  if (retry) { res.setHeader('retry-after', retry); return send(res, 429, { error: 'rate_limited', message: 'Too many requests, slow down.' }); }

  const route = ROUTES.find(r => r[0] === req.method && r[1] === path);
  if (!route) return send(res, 404, { error: 'not_found' });
  const [, , handler, needsAuth] = route;
  let uid = null;
  if (needsAuth) {
    const auth = req.headers['authorization'] || '';
    uid = verifyToken(auth.replace(/^Bearer\s+/i, ''));
    if (!uid) return send(res, 401, { error: 'unauthorized', message: 'Please log in again' });
  }
  let body = {};
  if (req.method === 'POST') { try { body = await readBody(req); } catch { return send(res, 413, { error: 'too_large' }); } }
  try {
    const { status, body: out } = await handler(uid, body, url.searchParams, req.headers);
    send(res, status, out);
  } catch (e) {
    console.error(JSON.stringify({ lvl: 'error', path, msg: e.message }));
    send(res, 500, { error: 'server_error', message: 'Something went wrong' });
  }
}

async function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT + '/') && full !== ROOT) { res.writeHead(403); return res.end('forbidden'); }
  if (full.includes('/server/') ) { res.writeHead(403); return res.end('forbidden'); } // never serve server code/db/secrets
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream', 'cache-control': cacheControl(full) });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const ip = clientIp(req);
  applyHeaders(res);
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { error: 'bad_request' }); }

  res.on('finish', () => {
    if (isProd) console.log(JSON.stringify({ lvl: 'info', m: req.method, p: url.pathname, s: res.statusCode, ms: Date.now() - t0 }));
  });

  if (url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, ip);
  return handleStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`\n  🌊 Caribe — ${isProd ? 'PRODUCTION' : 'development'} | rail: ${rail.name}`);
  console.log(`  → http://localhost:${PORT}`);
  if (!isProd) console.log(`  KYC admin key: ${adminKey()}  (header x-admin-key)`);
  if (isProd && rail.name.includes('settlement')) console.log('  ⚠  Using internal settlement rail — set SD_BASE_URL + SD_API_KEY for the live Sand Dollar network.');
  console.log('');
});

// graceful shutdown: stop accepting, drain, close DB
let shutting = false;
function shutdown(sig) {
  if (shutting) return; shutting = true;
  console.log(`\n  ${sig} received — shutting down gracefully…`);
  server.close(() => { try { db.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error(JSON.stringify({ lvl: 'error', msg: 'unhandledRejection', err: String(e) })));
