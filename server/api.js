// api.js — request handlers. Pure functions returning {status, body}.
import { db, uuid, now } from './db.js';
import { hashPin, verifyPin, issueToken } from './auth.js';
import { rail } from './rail.js';
import { postTransfer, balanceOf, historyFor, reconcile, LedgerError } from './ledger.js';

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
    handle: '@' + u.name.split(' ')[0].toLowerCase(),
    kycTier: u.kyc_tier, railAccountId: u.rail_account_id,
    balance: acct.balance_cents,
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
export async function register({ name, phone, pin }) {
  name = (name || '').trim(); phone = (phone || '').trim(); pin = String(pin || '').trim();
  if (!name) return err(400, 'name_required', 'Name is required');
  if (!phone) return err(400, 'phone_required', 'Phone is required');
  if (!/^\d{4}$/.test(pin)) return err(400, 'bad_pin', 'PIN must be 4 digits');
  if (userByPhone.get(phone)) return err(409, 'phone_taken', 'That phone is already registered');

  const accountId = 'acct_' + uuid().slice(0, 12);
  const userId = 'usr_' + uuid().slice(0, 12);
  const prov = await rail.provision({ phone });
  const t = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO accounts (id,name,kind,handle,color,emoji,balance_cents,allow_negative,created_at)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(accountId, name, 'user', '@' + name.split(' ')[0].toLowerCase(), '#16a7c9', null, 0, 0, t);
    db.prepare(`INSERT INTO users (id,account_id,name,phone,pin_hash,kyc_tier,rail_account_id,created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(userId, accountId, name, phone, hashPin(pin), 1, prov.railAccountId, t);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  const u = userById.get(userId);
  return ok({ token: issueToken(userId), user: publicUser(u) });
}

export async function login({ phone, pin }) {
  const u = userByPhone.get((phone || '').trim());
  if (!u || !verifyPin(String(pin || ''), u.pin_hash)) return err(401, 'bad_credentials', 'Wrong phone or PIN');
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
    `SELECT a.id, a.name, a.handle, a.color FROM accounts a
       WHERE a.kind='user' AND a.id != ? ORDER BY a.created_at`).all(u.account_id);
  const merchants = db.prepare(
    `SELECT id,name,category,color,emoji FROM accounts WHERE kind='merchant' ORDER BY name`).all();
  const billers = db.prepare(
    `SELECT id,name,color,emoji FROM accounts WHERE kind='biller' ORDER BY name`).all();
  return ok({ contacts, merchants, billers });
}

export async function transactions(userId) {
  const u = userById.get(userId);
  return ok({ transactions: historyFor(u.account_id, 100), balance: balanceOf(u.account_id) });
}

export async function health() {
  const problems = reconcile();
  return ok({ ok: problems.length === 0, ledgerSound: problems.length === 0, problems });
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
  if (!accountById.get(toId)) return err(404, 'no_payee', 'Payee not found');
  const limited = enforceSendLimit(u, amountCents);
  if (limited) return limited;
  try {
    const txn = postTransfer({ fromId: u.account_id, toId, amountCents, kind, memo, idempotencyKey, railRef: 'SD-TX-' + uuid().slice(0,8).toUpperCase() });
    return ok({ txn: { id: txn.id, ref: txn.rail_ref, amount: txn.amount_cents }, balance: balanceOf(u.account_id) });
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
  // Bridge external Sand Dollar funds in, then credit the wallet from treasury (real double-entry).
  const r = await rail.cashIn(u.rail_account_id, amountCents);
  if (!r.ok) return err(502, 'rail_error', 'Sand Dollar cash-in failed');
  const txn = postTransfer({ fromId: 'treasury', toId: u.account_id, amountCents, kind: 'cashin', memo: 'Cash in · Sand Dollar', railRef: r.ref, idempotencyKey });
  return ok({ txn: { id: txn.id, ref: txn.rail_ref }, balance: balanceOf(u.account_id) });
}

export async function cashout(userId, { amountCents, idempotencyKey }) {
  const u = userById.get(userId);
  if (!u) return err(401, 'no_user');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return err(400, 'bad_amount');
  try {
    const txn = postTransfer({ fromId: u.account_id, toId: 'treasury', amountCents, kind: 'cashout', memo: 'Cash out · Sand Dollar', idempotencyKey });
    const r = await rail.cashOut(u.rail_account_id, amountCents);
    if (!r.ok) throw new Error('rail cashout failed');
    return ok({ txn: { id: txn.id, ref: txn.rail_ref }, balance: balanceOf(u.account_id) });
  } catch (e) {
    if (e instanceof LedgerError && e.code === 'INSUFFICIENT_FUNDS') return err(402, 'insufficient_funds', 'Not enough balance');
    throw e;
  }
}
