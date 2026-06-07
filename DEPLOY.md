# Deploying Caribe

Two honest layers of "production-ready":

1. **The software** (this repo) — hardened and deployable: env secrets, rate limiting,
   account lockout, security headers (CSP/HSTS/etc.), graceful shutdown, health checks,
   per-currency conservation, Docker + automatic HTTPS. ✅ Done.
2. **Licensed to take real money** — additionally requires a money-transmitter license,
   live Sand Dollar credentials, a KYC vendor contract, a third-party security audit, and
   a bank holding the safeguarded reserve. These are legal/credential steps, not code.
   Until they're in place, run it as a **pilot/sandbox** (the internal settlement engine).

---

## 1. Generate secrets

```bash
cp .env.example .env
echo "TOKEN_SECRET=$(openssl rand -hex 48)"  # paste into .env
echo "ADMIN_KEY=$(openssl rand -hex 24)"     # paste into .env
# set DOMAIN=your.domain in .env, point its DNS A record at the server's IP
```

## 2. Deploy with Docker (recommended — auto HTTPS via Caddy)

On any Linux VPS with Docker installed:

```bash
git clone <your repo> caribe && cd caribe
# create .env as above
docker compose up -d --build
```

Caddy automatically provisions a Let's Encrypt TLS certificate for `$DOMAIN`. Visit
`https://your.domain` — installable PWA, camera QR scanning works (HTTPS = secure context).

- Logs: `docker compose logs -f app`
- Update: `git pull && docker compose up -d --build`
- Data (DB + KYC uploads) persists in the `caribe-data` volume. **Back it up** (see below).

## 3. Run locally in production mode (no Docker)

```bash
NODE_ENV=production \
TOKEN_SECRET=$(openssl rand -hex 48) \
ADMIN_KEY=$(openssl rand -hex 24) \
PORT=8080 npm start
```
Put it behind a TLS reverse proxy (Caddy/nginx/Cloudflare) and set `TRUST_PROXY=true`.

## 4. Going live on the real Sand Dollar network

When the Central Bank authorizes you, set in `.env`:
```
SD_BASE_URL=https://<central-bank-api>
SD_API_KEY=<your key>
```
…and implement the three methods in `server/rail.js → SandDollarRail`. The app auto-selects
the live rail when both are present. Nothing else changes. Repeat per island as each goes live.

## What's hardened

- Secrets from env (prod refuses to boot without them)
- Per-IP rate limiting (login/register/uploads + global) → HTTP 429
- Account lockout after 5 bad PINs (15 min)
- CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (camera=self)
- Path-traversal-safe static serving; server code/db/secrets never served
- Atomic double-entry ledger, idempotent transfers, per-currency conservation invariant
- Graceful shutdown (drains requests, closes DB), `/healthz` liveness + Docker healthcheck
- Image upload size cap (6 MB) and body cap (12 MB)

## Backups (do this)

```bash
# DB is SQLite (WAL). Safe online backup:
docker compose exec app sh -c 'cp /data/caribe.db /data/backup-$(date +%F).db'
# copy the volume off-box on a schedule (cron + rsync/S3). Back up KYC uploads too.
```

## Scale note

SQLite (WAL) comfortably handles a single-node pilot. For multi-node / high volume,
migrate to Postgres (the ledger is standard SQL) and move the rate limiter to Redis.
