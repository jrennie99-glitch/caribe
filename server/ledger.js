// ledger.js — real double-entry accounting. Atomic, idempotent, overdraft-safe.
//
// Every money movement = one transactions row + exactly two ledger_entries (a debit
// and a credit of equal amount) + two balance updates, all inside ONE SQL transaction.
// If anything fails, the whole thing rolls back. No partial money.

import { db, uuid, now } from './db.js';

export class LedgerError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const getAccount = db.prepare(`SELECT * FROM accounts WHERE id = ?`);
const insTxn = db.prepare(
  `INSERT INTO transactions (id,idempotency_key,from_account,to_account,amount_cents,kind,memo,rail_ref,created_at)
   VALUES (?,?,?,?,?,?,?,?,?)`);
const insEntry = db.prepare(
  `INSERT INTO ledger_entries (id,txn_id,account_id,direction,amount_cents,created_at) VALUES (?,?,?,?,?,?)`);
const updBal = db.prepare(`UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?`);
const findByKey = db.prepare(`SELECT * FROM transactions WHERE idempotency_key = ?`);

/**
 * Post a transfer between two accounts.
 * @returns {object} the transaction row
 * @throws  {LedgerError} BAD_AMOUNT | NO_SUCH_ACCOUNT | INSUFFICIENT_FUNDS
 */
export function postTransfer({ fromId, toId, amountCents, kind = 'transfer', memo = null, railRef = null, idempotencyKey = null }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new LedgerError('BAD_AMOUNT', 'Amount must be a positive integer (cents)');
  if (fromId === toId) throw new LedgerError('BAD_AMOUNT', 'Cannot transfer to the same account');

  // Idempotency: a repeated key returns the original txn, never double-charges.
  if (idempotencyKey) {
    const existing = findByKey.get(idempotencyKey);
    if (existing) return existing;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const from = getAccount.get(fromId);
    const to = getAccount.get(toId);
    if (!from) throw new LedgerError('NO_SUCH_ACCOUNT', 'Sender account not found');
    if (!to) throw new LedgerError('NO_SUCH_ACCOUNT', 'Recipient account not found');
    if (!from.allow_negative && from.balance_cents < amountCents) {
      throw new LedgerError('INSUFFICIENT_FUNDS', 'Not enough balance');
    }

    const t = now();
    const txnId = uuid();
    insTxn.run(txnId, idempotencyKey, fromId, toId, amountCents, kind, memo, railRef, t);
    insEntry.run(uuid(), txnId, fromId, 'debit', amountCents, t);
    insEntry.run(uuid(), txnId, toId, 'credit', amountCents, t);
    updBal.run(-amountCents, fromId);
    updBal.run(amountCents, toId);

    db.exec('COMMIT');
    return getTxn(txnId);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const getTxn = (id) => db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
export const balanceOf = (accountId) => getAccount.get(accountId)?.balance_cents ?? 0;

/** Transactions involving an account, newest first, shaped for the UI. */
export function historyFor(accountId, limit = 100) {
  const rows = db.prepare(
    `SELECT t.*, af.name AS from_name, at.name AS to_name
       FROM transactions t
       JOIN accounts af ON af.id = t.from_account
       JOIN accounts at ON at.id = t.to_account
      WHERE t.from_account = ? OR t.to_account = ?
      ORDER BY t.created_at DESC LIMIT ?`).all(accountId, accountId, limit);
  return rows.map(r => {
    const incoming = r.to_account === accountId;
    return {
      id: r.id,
      dir: incoming ? 'in' : 'out',
      party: incoming ? r.from_name : r.to_name,
      amount: r.amount_cents,
      memo: r.memo,
      ref: r.rail_ref || r.id,
      kind: r.kind,
      ts: r.created_at,
    };
  });
}

/**
 * Integrity check: for every account, sum(credits) - sum(debits) MUST equal the stored
 * balance. Returns the list of any mismatches (empty = ledger is sound).
 */
export function reconcile() {
  const accounts = db.prepare(`SELECT id, name, balance_cents FROM accounts`).all();
  const sumEntries = db.prepare(
    `SELECT
        COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents ELSE 0 END),0) AS credits,
        COALESCE(SUM(CASE WHEN direction='debit'  THEN amount_cents ELSE 0 END),0) AS debits
     FROM ledger_entries WHERE account_id = ?`);
  const problems = [];
  for (const a of accounts) {
    const { credits, debits } = sumEntries.get(a.id);
    const derived = credits - debits;
    if (derived !== a.balance_cents) {
      problems.push({ account: a.id, name: a.name, stored: a.balance_cents, derived });
    }
  }
  return problems;
}
