// Pure-logic tests: fees, FX, auth. No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeFor } from '../server/fees.js';
import { fxConvertCents, rate, symbolFor } from '../server/islands.js';
import { hashPin, verifyPin, issueToken, verifyToken } from '../server/auth.js';

test('fees: free types stay free', () => {
  assert.equal(feeFor('transfer', 10000).cents, 0);
  assert.equal(feeFor('gift', 10000).cents, 0);
  assert.equal(feeFor('cashin', 10000).cents, 0);
});

test('fees: merchant 1% capped at B$5, recipient pays', () => {
  assert.deepEqual(feeFor('payment', 10000), { cents: 100, payer: 'recipient' });   // 1%
  assert.equal(feeFor('payment', 100000).cents, 500);                                // capped at B$5
});

test('fees: cashout 1% with min B$0.25 and cap B$3', () => {
  assert.equal(feeFor('cashout', 100).cents, 25);     // min
  assert.equal(feeFor('cashout', 40000).cents, 300);  // cap (1% would be 400)
  assert.equal(feeFor('cashout', 10000).cents, 100);  // 1%
});

test('fees: bill is a flat B$0.35', () => {
  assert.equal(feeFor('bill', 5000).cents, 35);
  assert.equal(feeFor('bill', 999999).cents, 35);
});

test('fx: BSD->JMD at 157, and round-trip sanity', () => {
  assert.equal(fxConvertCents(10000, 'BSD', 'JMD'), 1570000); // B$100 -> J$15,700 mid
  assert.equal(fxConvertCents(5000, 'USD', 'USD'), 5000);     // same currency unchanged
  assert.equal(Math.round(rate('BSD', 'JMD')), 157);
  assert.equal(symbolFor('JMD'), 'J$');
});

test('auth: scrypt hash verifies and rejects wrong pin', () => {
  const h = hashPin('2424');
  assert.equal(verifyPin('2424', h), true);
  assert.equal(verifyPin('0000', h), false);
});

test('auth: token round-trips and rejects tampering', () => {
  const t = issueToken('usr_abc');
  assert.equal(verifyToken(t), 'usr_abc');
  assert.equal(verifyToken(t + 'x'), null);
  assert.equal(verifyToken('garbage'), null);
});
