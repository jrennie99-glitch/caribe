// api.js — request handlers. Pure functions returning {status, body}.
import { db, uuid, now, systemAccounts } from './db.js';
import { hashPin, verifyPin, issueToken, isAdmin } from './auth.js';
import { rail } from './rail.js';
import { postTransfer, postCrossBorder, balanceOf, historyFor, reconcile, summaryFor, currencyConservation, LedgerError } from './ledger.js';
import { feeFor, FEE_SCHEDULE } from './fees.js';
import { ISLANDS, islandByCode, symbolFor, fxConvertCents, rate, FX_SPREAD_BPS } from './islands.js';
import { settlementStats } from './rail.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(dirname(fileURLToPath(import.meta.url)), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// real age check from an ISO date string (YYYY-MM-DD)
function ageFrom(dobStr) {
  const d = new Date(dobStr); if (isNaN(d)) return null;
  const now = new Date(); let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

// KYC tier limits (cents)
const TIER = {
  1: { holdMax: 50000,  sendPerDay: 30000 },   // hold B$500, send B$300/day
  2: { holdMax: 1000000, sendPerDay: 500000 },  // hold B$10k, send B$5k/day
};
const ok  = (body) => ({ status: 200, body });
const err = (status, code, message) => ({ status, body: { error: code, message: message || code } });

const userByPhone = db.prepare(`SELECT * FROM users WHERE phone = ?`);
const userById    = db.prepare(`SELECT * FROM users WHERE id = ?`);
const accountById = db.prepare(`SELECT * FROM accounts WHERE id = ?`);

function publicUser(u) {
  const acct = accountById.get(u.account_id);
  return {
    id: u.id, accountId: u.account_id, name: u.name, phone: u.phone,
    handle: acct.handle || ('@' + u.name.split(' ')[0].toLowerCase()),
    kycTier: u.kyc_tier, kycStatus: u.kyc_status, railAccountId: u.rail_account_id,
    balance: acct.balance_cents,
    accountKind: acct.kind,                 // 'user' or 'merchant'
    businessName: acct.kind === 'merchant' ? acct.name : null,
    category: acct.category || null,
    currency: acct.currency, symbol: symbolFor(acct.currency),
    island: acct.island, islandName: islandByCode(acct.island)?.name || acct.island,
  };
}

function spentTodayCents(accountId) {
  const start = new Date(); start.setHours(0,0,0,0);
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) s FROM transactions
      WHERE from_account = ? AND created_at >= ? AND kind IN ('transfer','gift','payment','bill','cashout')`
  ).get(accountId, start.getTime());
  return row.s;
}

// ---------- auth ----------
export async function register({ name, phone, pin, role, business, category, dob, idNumber, island }) {
  name = (name || '').trim(); phone = (phone || '').trim(); pin = String(pin || '').trim();
  const isle = islandByCode(island) || islandByCode('BS');
  if (island && !islandByCode(island)) return err(400, 'bad_island', 'Unknown island');
  if (island && !isle.live) return err(403, 'island_not_live', `${isle.name} is not live yet`);
  const isMerchant = role === 'merchant';
  business = (business || '').trim(); category = (category || '').trim();
  dob = (dob || '').trim(); idNumber = (idNumber || '').trim();

  if (!name) return err(400, 'name_required', 'Name is required');
  if (isMerchant && !business) return err(400, 'business_required', 'Business name is required');
  if (!phone) return err(400, 'phone_required', 'Phone is required');
  if (!/^\d{4}$/.test(pin)) return err(400, 'bad_pin', 'PIN must be 4 digits');
  if (!dob) return err(400, 'dob_required', 'Date of birth is required');
  if (!idNumber) return err(400, 'id_required', 'ID / NIB number is required');
  const age = ageFrom(dob);
  if (age === null) return err(400, 'bad_dob', 'Enter a valid date of birth');
  if (age < 18) return err(403, 'underage', 'You must be 18 or older to open a wallet');
  if (idNumber.replace(/\s/g, '').length < 5) return err(400, 'bad_id', 'Enter a valid ID / NIB number');
  if (userByPhone.get(phone)) return err(409, 'phone_taken', 'That phone is already registered');

  const accountId = 'acct_' + uuid().slice(0, 12);
  const userId = 'usr_' + uuid().slice(0, 12);
  const acctKind = isMerchant ? 'merchant' : 'user';
  const acctName = isMerchant ? business : name;
  const handle = '@' + acctName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const tier = isMerchant ? 2 : 1;                       // businesses get higher limits
  const prov = await rail.provision({ phone, accountId });
  const t = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO accounts (id,name,kind,handle,color,emoji,category,balance_cents,allow_negative,currency,island,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(accountId, acctName, acctKind, handle, isMerchant ? '#ff6f61' : '#16a7c9',
           isMerchant ? '🏪' : null, isMerchant ? (category || 'Shop') : null, 0, 0, isle.currency, isle.code, t);
    db.prepare(`INSERT INTO users (id,account_id,name,phone,pin_hash,kyc_tier,rail_account_id,dob,id_number,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, accountId, name, phone, hashPin(pin), tier, prov.railAccountId, dob, idNumber, t);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  const u = userById.get(userId);
  return ok({ token: issueToken(userId), user: publicUser(u) });
}

const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
export async function login({ phone, pin }) {
  const u = userByPhone.get((phone || '').trim());
  if (!u) return err(401, 'bad_credentials', 'Wrong phone or PIN');
  if (u.locked_until && u.locked_until > now()) {
    const mins = Math.ceil((u.locked_until - now()) / 60000);
    return err(423, 'locked', `Too many attempts. Try again in ${mins} min.`);
  }
  if (!verifyPin(String(pin || ''), u.pin_hash)) {
    const fails = (u.failed_attempts || 0) + 1;
    const lock = fails >= MAX_FAILS ? now() + LOCK_MS : null;
    db.prepare(`UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?`).run(fails, lock, u.id);
    return err(401, 'bad_credentials', lock ? 'Locked for 15 min after too many attempts' : 'Wrong phone or PIN');
  }
  if (u.failed_attempts) db.prepare(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?`).run(u.id);
  return ok({ token: issueToken(u.id), user: publicUser(u) });
}

// ---------- read ----------
export async function me(userId) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  return ok({ user: publicUser(u) });
}

export async function directory(userId) {
  const u = userById.get(userId);
  const contacts = db.prepare(
    `SELECT a.id, a.name, a.handle, a.color, a.currency, a.island FROM accounts a
       WHERE a.kind='user' AND a.id != ? ORDER BY a.created_at`).all(u.account_id);
  const merchants = db.prepare(
    `SELECT id,name,category,color,emoji,currency,island FROM accounts WHERE kind='merchant' ORDER BY name`).all();
  const billers = db.prepare(
    `SELECT id,name,color,emoji FROM accounts WHERE kind='biller' ORDER BY name`).all();
  return ok({ contacts, merchants, billers });
}

export async function transactions(userId) {
  const u = userById.get(userId);
  return ok({ transactions: historyFor(u.account_id, 100), balance: balanceOf(u.account_id) });
}

export async function summary(userId) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  return ok(summaryFor(u.account_id));
}

export async function health() {
  const problems = reconcile();
  const cc = currencyConservation();
  return ok({
    ok: problems.length === 0 && cc.conserved,
    ledgerSound: problems.length === 0, problems,
    revenueCents: balanceOf('app_revenue'),
    moneyConserved: cc.conserved, conservation: cc.byCurrency,
    settlements: settlementStats(),
  });
}

export async function fees() { return ok({ schedule: FEE_SCHEDULE }); }

export async function islands() {
  return ok({
    islands: ISLANDS.map(i => ({ code: i.code, name: i.name, currency: i.currency, symbol: i.symbol, usdPer: i.usdPer, rail: i.rail, live: i.live })),
    fxSpreadBps: FX_SPREAD_BPS,
  });
}

// ---------- KYC (real: capture → review → tier upgrade) ----------
export async function kycDocument(userId, { imageBase64 } = {}) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  if (!imageBase64 || typeof imageBase64 !== 'string') return err(400, 'no_image', 'Document image required');
  const m = imageBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) return err(400, 'bad_image', 'Image must be PNG, JPG or WebP');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 1024) return err(400, 'bad_image', 'Image looks empty');
  if (buf.length > 6 * 1024 * 1024) return err(413, 'too_large', 'Image too large (max 6MB)');
  const fname = `kyc_${u.id}_${now()}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, fname), buf);
  db.prepare(`UPDATE users SET id_doc_path=?, kyc_status='pending_review' WHERE id=?`).run(fname, u.id);
  return ok({ status: 'pending_review' });
}

export async function kycPending(_uid, _b, _q, headers) {
  if (!isAdmin(headers && headers['x-admin-key'])) return err(403, 'forbidden', 'Admin key required');
  const rows = db.prepare(
    `SELECT id,name,phone,kyc_tier,kyc_status,id_doc_path,dob,id_number FROM users WHERE kyc_status='pending_review' ORDER BY created_at`
  ).all();
  return ok({ pending: rows });
}

export async function kycReview(_uid, { userId, approve } = {}, _q, headers) {
  if (!isAdmin(headers && headers['x-admin-key'])) return err(403, 'forbidden', 'Admin key required');
  const target = userById.get(userId);
  if (!target) return err(404, 'no_user');
  if (approve) {
    db.prepare(`UPDATE users SET kyc_tier=MAX(kyc_tier,2), kyc_status='verified_full', kyc_reviewed_at=? WHERE id=?`).run(now(), userId);
    return ok({ userId, status: 'verified_full', tier: 2 });
  }
  db.prepare(`UPDATE users SET kyc_status='rejected', kyc_reviewed_at=? WHERE id=?`).run(now(), userId);
  return ok({ userId, status: 'rejected' });
}

// ---------- money ----------
function enforceSendLimit(u, amountCents) {
  const lim = TIER[u.kyc_tier] || TIER[1];
  if (spentTodayCents(u.account_id) + amountCents > lim.sendPerDay) {
    return err(403, 'daily_limit', `Daily send limit reached (Tier ${u.kyc_tier}). Raise your KYC tier.`);
  }
  return null;
}

async function move(userId, { toId, amountCents, memo, kind, idempotencyKey }) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err(400, 'bad_amount', 'Enter a valid amount');
  const payee = accountById.get(toId);
  if (!payee) return err(404, 'no_payee', 'Payee not found');
  const limited = enforceSendLimit(u, amountCents);
  if (limited) return limited;
  const srcCur = accountById.get(u.account_id).currency;
  const dstCur = payee.currency;
  try {
    if (srcCur !== dstCur) {
      // ---- cross-island transfer with FX ----
      const dstMid = fxConvertCents(amountCents, srcCur, dstCur);
      if (dstMid == null) return err(400, 'no_rate', 'No FX rate between these islands');
      const spread = Math.floor((dstMid * FX_SPREAD_BPS) / 10000);
      const dstOffered = dstMid - spread;
      const sysS = systemAccounts(srcCur), sysD = systemAccounts(dstCur);
      const r = rate(srcCur, dstCur);
      const txn = postCrossBorder({
        fromId: u.account_id, toId, srcCents: amountCents,
        dstMidCents: dstMid, dstOfferedCents: dstOffered, spreadCents: spread,
        srcTreasury: sysS.treasury, dstTreasury: sysD.treasury, dstRevenue: sysD.revenue,
        memo: memo || `→ ${symbolFor(dstCur)}${(dstOffered/100).toFixed(2)} ${dstCur}`,
        railRef: 'SD-FX-' + uuid().slice(0, 8).toUpperCase(), idempotencyKey, kind: 'xborder',
      });
      return ok({ txn: { id: txn.id, ref: txn.rail_ref, amount: amountCents }, crossBorder: true,
        srcCurrency: srcCur, dstCurrency: dstCur, dstAmount: dstOffered, rate: r, fee: spread,
        balance: balanceOf(u.account_id) });
    }
    // ---- same-currency ----
    const fee = feeFor(kind, amountCents);
    const feePayer = fee.payer === 'recipient' ? toId : u.account_id;
    const txn = postTransfer({ fromId: u.account_id, toId, amountCents, kind, memo, idempotencyKey,
      railRef: 'SD-TX-' + uuid().slice(0,8).toUpperCase(),
      feeCents: fee.cents, feePayer, feeAccount: systemAccounts(srcCur).revenue });
    return ok({ txn: { id: txn.id, ref: txn.rail_ref, amount: txn.amount_cents },
      fee: fee.cents, feePayer: fee.payer, balance: balanceOf(u.account_id) });
  } catch (e) {
    if (e instanceof LedgerError) {
      if (e.code === 'INSUFFICIENT_FUNDS') return err(402, 'insufficient_funds', 'Not enough balance');
      return err(400, e.code.toLowerCase(), e.message);
    }
    throw e;
  }
}

export const transfer = (userId, b) => move(userId, { ...b, kind: b.envelope ? 'gift' : 'transfer' });
export const pay      = (userId, b) => move(userId, { ...b, kind: 'payment' });
export const bill     = (userId, b) => move(userId, { toId: b.billerId, amountCents: b.amountCents, memo: b.memo, kind: 'bill', idempotencyKey: b.idempotencyKey });

export async function cashin(userId, { amountCents, idempotencyKey }) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err(400, 'bad_amount', 'Enter a valid amount');
  const lim = TIER[u.kyc_tier] || TIER[1];
  if (balanceOf(u.account_id) + amountCents > lim.holdMax) {
    return err(403, 'hold_limit', `Wallet hold limit is B$${(lim.holdMax/100).toFixed(0)} on Tier ${u.kyc_tier}.`);
  }
  // Bridge external funds in, then credit the wallet from that currency's treasury.
  const r = await rail.cashIn(u.rail_account_id, amountCents, u.account_id);
  if (!r.ok) return err(502, 'rail_error', 'Cash-in failed');
  const sys = systemAccounts(accountById.get(u.account_id).currency);
  const fee = feeFor('cashin', amountCents);
  const txn = postTransfer({ fromId: sys.treasury, toId: u.account_id, amountCents, kind: 'cashin', memo: 'Cash in', railRef: r.ref, idempotencyKey,
    feeCents: fee.cents, feePayer: u.account_id, feeAccount: sys.revenue });
  return ok({ txn: { id: txn.id, ref: txn.rail_ref }, fee: fee.cents, balance: balanceOf(u.account_id) });
}

export async function cashout(userId, { amountCents, idempotencyKey }) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err(400, 'bad_amount');
  try {
    const sys = systemAccounts(accountById.get(u.account_id).currency);
    const fee = feeFor('cashout', amountCents);
    const txn = postTransfer({ fromId: u.account_id, toId: sys.treasury, amountCents, kind: 'cashout', memo: 'Cash out', idempotencyKey,
      feeCents: fee.cents, feePayer: u.account_id, feeAccount: sys.revenue });
    const r = await rail.cashOut(u.rail_account_id, amountCents, u.account_id);
    if (!r.ok) throw new Error('rail cashout failed');
    return ok({ txn: { id: txn.id, ref: txn.rail_ref }, fee: fee.cents, balance: balanceOf(u.account_id) });
  } catch (e) {
    if (e instanceof LedgerError && e.code === 'INSUFFICIENT_FUNDS') return err(402, 'insufficient_funds', 'Not enough balance');
    throw e;
  }
}
