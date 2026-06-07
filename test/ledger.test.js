// Ledger tests against an in-memory DB (npm test sets DB_PATH=:memory:).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, seed, systemAccounts, uuid, now } from '../server/db.js';
import { postTransfer, postCrossBorder, balanceOf, currencyConservation, LedgerError } from '../server/ledger.js';

seed();

function mkAccount(currency = 'BSD') {
  const id = 'acct_' + uuid().slice(0, 10);
  db.prepare(`INSERT INTO accounts (id,name,kind,handle,color,emoji,category,balance_cents,allow_negative,currency,island,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'Test', 'user', null, null, null, null, 0, 0, currency, currency === 'BSD' ? 'BS' : 'JM', now());
  return id;
}
function fund(accountId, cents, currency = 'BSD') {
  postTransfer({ fromId: systemAccounts(currency).treasury, toId: accountId, amountCents: cents, kind: 'cashin' });
}

test('transfer moves money and conserves per currency', () => {
  const a = mkAccount(), b = mkAccount();
  fund(a, 1000);
  postTransfer({ fromId: a, toId: b, amountCents: 300, kind: 'transfer' });
  assert.equal(balanceOf(a), 700);
  assert.equal(balanceOf(b), 300);
  assert.equal(currencyConservation().conserved, true);
});

test('overdraft is rejected and leaves balances untouched', () => {
  const a = mkAccount(), b = mkAccount();
  fund(a, 500);
  assert.throws(() => postTransfer({ fromId: a, toId: b, amountCents: 999999, kind: 'transfer' }),
    (e) => e instanceof LedgerError && e.code === 'INSUFFICIENT_FUNDS');
  assert.equal(balanceOf(a), 500);
  assert.equal(balanceOf(b), 0);
});

test('idempotency: same key never double-charges', () => {
  const a = mkAccount(), b = mkAccount();
  fund(a, 1000);
  const key = 'idem-' + uuid();
  postTransfer({ fromId: a, toId: b, amountCents: 200, kind: 'transfer', idempotencyKey: key });
  postTransfer({ fromId: a, toId: b, amountCents: 200, kind: 'transfer', idempotencyKey: key });
  assert.equal(balanceOf(a), 800);
  assert.equal(balanceOf(b), 200);
});

test('fee leg lands in revenue and conserves', () => {
  const a = mkAccount(), b = mkAccount();
  fund(a, 10000);
  const sys = systemAccounts('BSD');
  const before = balanceOf(sys.revenue);
  postTransfer({ fromId: a, toId: b, amountCents: 5000, kind: 'payment', feeCents: 50, feePayer: b, feeAccount: sys.revenue });
  assert.equal(balanceOf(b), 4950);                 // received minus fee
  assert.equal(balanceOf(sys.revenue), before + 50);
  assert.equal(currencyConservation().conserved, true);
});

test('cross-island FX: both currency ledgers net to zero', () => {
  const bs = mkAccount('BSD'), jm = mkAccount('JMD');
  fund(bs, 10000);
  const sysB = systemAccounts('BSD'), sysJ = systemAccounts('JMD');
  const dstMid = 1570000, spread = Math.floor(dstMid * 150 / 10000), dstOffered = dstMid - spread;
  postCrossBorder({
    fromId: bs, toId: jm, srcCents: 10000, dstMidCents: dstMid, dstOfferedCents: dstOffered,
    spreadCents: spread, srcTreasury: sysB.treasury, dstTreasury: sysJ.treasury, dstRevenue: sysJ.revenue,
  });
  assert.equal(balanceOf(bs), 0);
  assert.equal(balanceOf(jm), dstOffered);
  const c = currencyConservation();
  assert.equal(c.conserved, true);
  assert.equal(c.byCurrency.BSD.net, 0);
  assert.equal(c.byCurrency.JMD.net, 0);
});
