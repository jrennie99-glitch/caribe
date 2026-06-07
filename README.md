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
- **Real QR + camera scanning** — Receive/Request shows a real scannable QR
  (`caribe:pay?to=…`); Scan & Pay uses the device camera via the BarcodeDetector API,
  with a graceful saved-payee fallback where camera/format isn't supported.
- **Merchant accounts** — register a business (separate onboarding + real KYC fields),
  get a merchant dashboard: live balance, today's net / sales count / fees, recent
  sales, a Request-Payment QR for any amount, and cash-out. Merchants absorb the 1% fee.
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

## Revenue model (fees)

Every transaction can carry a fee that lands in the **Caribe revenue account**
(`app_revenue`), collected via real double-entry in the *same atomic transaction* as the
payment — you never get a payment without its fee, or a fee without its payment.

All pricing lives in one file: `server/fees.js`. Defaults:

| Action | Fee | Who pays |
|--------|-----|----------|
| Send (P2P) | **free** | — (viral growth engine, never taxed) |
| Gift envelope | **free** | — |
| Pay a merchant | **1% · max B$5** | merchant absorbs it (customer pays exact amount) |
| Pay a bill | **B$0.35 flat** | sender |
| Cash in | **free** | — (funding is free to drive adoption) |
| Cash out | **1% · min B$0.25 · max B$3** | sender |

Strategy: M-Pesa model on a CBDC inclusion rail — keep money moving in-network cheap/free,
earn on merchant volume + cash-out, and on float / SaaS / lending / cross-island FX later.
Each fee is `clamp(amount*bps/10000 + flat, min, cap)`. Change any number in `FEE_SCHEDULE`
to reprice; set a `bps` on cash-in if you ever want to charge it.
The fee is shown to the user in the keypad *before* they confirm (e.g. "Caribe fee B$0.50
· total B$100.50"). `GET /api/health` reports total revenue collected (`revenueCents`).

## Caribbean network (multi-island)

Caribe is a network of island nodes sharing one platform core. `server/islands.js` is the
registry of every Caribbean territory (currency, symbol, FX reference rate, rail). Each
account belongs to an island and holds its currency; each currency has its own treasury
and revenue accounts, so every island's books balance independently.

**Cross-island transfers** convert through USD at the registry rates, with a transparent
**FX margin** (`FX_SPREAD_BPS`, default 1.5%) booked to that currency's revenue account.
The whole thing is one atomic transaction (`ledger.postCrossBorder`): the source currency
leg and destination currency leg both net to zero, so **per-currency conservation** always
holds (`GET /api/health` → `conservation`).

Example (verified): a Bahamas wallet sends **B$100** to a Jamaica wallet → recipient gets
**J$15,464.50** at 1 BSD = 157 JMD, Caribe earns **J$235.50** FX margin, and both BSD and
JMD ledgers net to exactly 0.

Each island's connection to its *local* production rail (its CBDC / bank) needs that
country's credentials — the same honest boundary as the Bahamas Sand Dollar. The network
engine itself is real and live for all islands now. `GET /api/islands` lists them.

## Architecture

```
server/
  server.js  ← HTTP server (Node built-in), serves PWA + JSON API
  db.js      ← SQLite schema + seed (node:sqlite, zero deps)
  auth.js    ← scrypt PIN hashing + HMAC tokens
  ledger.js  ← double-entry accounting (atomic, idempotent, reconcilable)
  fees.js    ← revenue model: fee schedule per transaction type
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
