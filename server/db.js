// db.js — real SQLite database (Node built-in node:sqlite). No external deps.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { islandByCurrency } from './islands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(join(__dirname, 'caribe.db'));

// Pragmas for integrity + concurrency.
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);
db.exec(`PRAGMA busy_timeout = 5000;`);

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('user','merchant','treasury','biller')),
  handle       TEXT,
  color        TEXT,
  emoji        TEXT,
  category     TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  allow_negative INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  pin_hash    TEXT NOT NULL,
  kyc_tier    INTEGER NOT NULL DEFAULT 1,
  rail_account_id TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  from_account    TEXT NOT NULL REFERENCES accounts(id),
  to_account      TEXT NOT NULL REFERENCES accounts(id),
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  kind            TEXT NOT NULL,
  memo            TEXT,
  rail_ref        TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           TEXT PRIMARY KEY,
  txn_id       TEXT NOT NULL REFERENCES transactions(id),
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  direction    TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_account ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_accounts ON transactions(from_account, to_account, created_at DESC);
`);

export const now = () => Date.now();
export const uuid = () => randomUUID();

/**
 * Treasury + revenue accounts for a currency, created on demand. BSD reuses the original
 * 'treasury' / 'app_revenue' accounts; every other currency gets its own pair so each
 * island's books balance independently.
 */
export function systemAccounts(currency) {
  if (currency === 'BSD') return { treasury: 'treasury', revenue: 'app_revenue' };
  const treasury = 'treasury_' + currency, revenue = 'app_revenue_' + currency;
  const island = islandByCurrency(currency)?.code || 'BS';
  const t = now();
  const ins = db.prepare(`INSERT OR IGNORE INTO accounts
    (id,name,kind,handle,color,emoji,category,balance_cents,allow_negative,currency,island,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run(treasury, currency + ' Treasury', 'treasury', null, '#1fb87a', '🏦', null, 0, 1, currency, island, t);
  ins.run(revenue,  currency + ' Revenue',  'treasury', null, '#7c5cff', '📈', null, 0, 0, currency, island, t);
  return { treasury, revenue };
}

// ---- migrations: additive, idempotent (safe on existing databases) ----
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}
function migrate() {
  if (!hasColumn('transactions', 'fee_cents'))   db.exec(`ALTER TABLE transactions ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0`);
  if (!hasColumn('transactions', 'fee_account')) db.exec(`ALTER TABLE transactions ADD COLUMN fee_account TEXT`);
  if (!hasColumn('transactions', 'fee_payer'))   db.exec(`ALTER TABLE transactions ADD COLUMN fee_payer TEXT`);
  if (!hasColumn('users', 'dob'))                db.exec(`ALTER TABLE users ADD COLUMN dob TEXT`);
  if (!hasColumn('users', 'id_number'))          db.exec(`ALTER TABLE users ADD COLUMN id_number TEXT`);
  if (!hasColumn('users', 'kyc_status'))         db.exec(`ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'verified_basic'`);
  if (!hasColumn('users', 'id_doc_path'))        db.exec(`ALTER TABLE users ADD COLUMN id_doc_path TEXT`);
  if (!hasColumn('users', 'kyc_reviewed_at'))    db.exec(`ALTER TABLE users ADD COLUMN kyc_reviewed_at INTEGER`);
  if (!hasColumn('accounts', 'currency'))        db.exec(`ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'BSD'`);
  if (!hasColumn('accounts', 'island'))          db.exec(`ALTER TABLE accounts ADD COLUMN island TEXT NOT NULL DEFAULT 'BS'`);
  // Caribe's revenue account — where all fees land. Exists on every database.
  db.prepare(`INSERT OR IGNORE INTO accounts (id,name,kind,handle,color,emoji,category,balance_cents,allow_negative,created_at)
              VALUES ('app_revenue','Caribe Revenue','treasury',NULL,'#7c5cff','📈',NULL,0,0,?)`).run(now());
  // Real settlement ledger for the Sand Dollar rail bridge (cash-in / cash-out audit trail).
  db.exec(`CREATE TABLE IF NOT EXISTS rail_settlements (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, rail_account_id TEXT,
    kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'settled', created_at INTEGER NOT NULL)`);
}
migrate();

// ---- seed: real rows, created once. Treasury is the Sand Dollar issuer mirror. ----
export function seed() {
  // Gate on the treasury specifically — migrate() may have already created app_revenue,
  // so a plain "is the table empty?" check would wrongly skip seeding.
  if (db.prepare(`SELECT 1 FROM accounts WHERE id='treasury'`).get()) return;
  const ins = db.prepare(
    `INSERT INTO accounts (id,name,kind,handle,color,emoji,category,balance_cents,allow_negative,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const t = now();
  // Issuer / treasury — mirrors funds that enter from the Sand Dollar rail. May go negative.
  ins.run('treasury', 'Sand Dollar Treasury', 'treasury', null, '#1fb87a', '🏦', null, 0, 1, t);
  // Merchants (real accounts that can receive + hold real balances)
  ins.run('m_conch',  "Goldie's Conch Shack", 'merchant', null, '#ff6b5e', '🐚', 'Food',    0, 0, t);
  ins.run('m_fresh',  'Fresh Market Nassau',  'merchant', null, '#1fb87a', '🛒', 'Grocery', 0, 0, t);
  ins.run('m_jitney', 'Bay St. Jitney',       'merchant', null, '#f5b53d', '🚌', 'Transit', 0, 0, t);
  ins.run('m_solomon',"Solomon's Pharmacy",   'merchant', null, '#16a7c9', '💊', 'Health',  0, 0, t);
  // Billers / mini-app payees
  ins.run('biller_bpl',   'BPL (Power)',            'biller', null, '#f5b53d', '⚡', 'Bill', 0, 0, t);
  ins.run('biller_water', 'Water & Sewerage',       'biller', null, '#16a7c9', '💧', 'Bill', 0, 0, t);
  ins.run('biller_cable', 'Cable Bahamas',          'biller', null, '#7c4dff', '📺', 'Bill', 0, 0, t);
  ins.run('biller_gov',   'Gov. Services',          'biller', null, '#06384f', '🏛️', 'Bill', 0, 0, t);
  ins.run('biller_school','School Fees',            'biller', null, '#ff6b5e', '🎒', 'Bill', 0, 0, t);
  ins.run('biller_ferry', 'Inter-island Ferry',     'biller', null, '#2fd9c5', '⛴️', 'Bill', 0, 0, t);
  ins.run('topup',        'Phone Top-up',           'biller', null, '#22c3d6', '📱', 'Bill', 0, 0, t);
  console.log('[db] seeded base accounts');
}
