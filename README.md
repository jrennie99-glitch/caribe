# Caribe 🌊

**The everything app for the islands.** A WeChat-style super-app, starting in the Bahamas,
built to run on the **Sand Dollar** (the Bahamian central bank digital currency, B$1 = US$1).

This is **real software** — real backend, real database, real double-entry ledger, real
authentication, real money movement that persists and works across multiple users and
devices. Not a simulation.

The one thing that is *not* live is the connection to the actual Central Bank Sand Dollar
network — that requires authorization and credentials only the Central Bank of The Bahamas
issues to a licensed operator. That single boundary is isolated behind one adapter
(`server/rail.js`). The day you have credentials, you implement one class and go live.
Everything behind it is production-shaped.

## Run it

No dependencies to install — the backend uses Node's built-in SQLite. Requires Node ≥ 22.5
(built and tested on Node 25).

```bash
cd ~/caribe
npm start
# → http://localhost:8080
```

Open it on your laptop, or on your phone at `http://<your-laptop-ip>:8080` (same wifi) and
"Add to Home Screen" — it installs as a real app.

Reset all data: `npm run reset`

## What's real and working

- **Auth** — register / login, PINs hashed with scrypt, stateless signed (HMAC) tokens.
- **Accounts & balances** — persisted in SQLite, survive restart.
- **Double-entry ledger** — every transfer = one transaction + two ledger entries + two
  balance updates, in one atomic SQL transaction. Overdraft-protected, idempotent
  (safe retries), KYC daily/holding limits enforced server-side.
- **Money** — send to people (with 🧧 gift-envelope mode), pay merchants, pay bills,
  cash in / cash out.
- **Integrity** — `GET /api/health` reconciles every account (sum of ledger entries must
  equal stored balance) and reports any mismatch.
- **Frontend** — installable mobile PWA, reads only real server data.

### Verified (automated)
- register → cash in B$500 → send B$123.45 → balances update correctly
- idempotent retry does **not** double-charge
- overdraft → `insufficient_funds`, balance untouched (atomic rollback)
- daily send limit (Tier 1 B$300/day) → `daily_limit`
- duplicate phone, bad PIN, wrong login all rejected
- full UI flow: login → send B$5.00 → DB balance 37655 → 37155 (exact)
- ledger reconciles: `ledgerSound: true`

## Architecture

```
server/
  server.js  ← HTTP server (Node built-in), serves PWA + JSON API
  db.js      ← SQLite schema + seed (node:sqlite, zero deps)
  auth.js    ← scrypt PIN hashing + HMAC tokens
  ledger.js  ← double-entry accounting (atomic, idempotent, reconcilable)
  api.js     ← request handlers + KYC limits
  rail.js    ← THE SAND DOLLAR SEAM  ← swap mock → real CBDC here, one file
js/
  api.js     ← client API wrapper
  store.js   ← client cache of server data
  ui.js      ← screens + interactions
  app.js     ← bootstrap + service worker
```

### Going live on the real Sand Dollar
Implement `SandDollarRail` in `server/rail.js` (the stub is there with the method
signatures) against the Central Bank API, then change the last line to:
```js
export const rail = new SandDollarRail({ baseUrl: process.env.SD_BASE_URL, apiKey: process.env.SD_API_KEY });
```
Nothing else changes. To add another island, add another adapter — the core is
country-agnostic. That's the "core + per-country adapter → network" design.

## Not yet (before real-money production)
- Authorized Sand Dollar integration (Central Bank credentials)
- Real KYC/AML vendor for identity verification
- HTTPS, rate limiting, audit logging, security review
- Hosted database + backups
