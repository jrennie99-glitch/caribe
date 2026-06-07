// fees.js — Caribe's revenue model. One place controls all pricing.
//
// Every fee is collected into the REVENUE_ACCOUNT via real double-entry, inside the
// same atomic transaction as the payment. Fees are integer cents, computed in basis
// points (bps) so the math never drifts (1% = 100 bps), with optional flat add-on,
// minimum, and cap.
//
//   fee = clamp( floor(amount * bps / 10000) + flat , min , cap )
//   (a type with bps:0 and flat:0 is genuinely free — min never forces a fee)
//
// `payer` decides who absorbs the fee:
//   'sender'    → payer pays amount + fee (P2P send, bills, cash-out)
//   'recipient' → merchant absorbs it; customer pays exactly the amount, merchant
//                 receives amount − fee  (the standard card "merchant discount rate")
//
// STRATEGY (M-Pesa model, tuned for a CBDC inclusion rail):
//   - P2P send + cash-in are FREE → grow the network, never tax loading money.
//   - Merchant pay is a low % the merchant absorbs (undercut cards' 2.6–3.5%).
//   - Cash-out + merchant volume are the revenue. Float / SaaS / lending / FX come later.

export const REVENUE_ACCOUNT = 'app_revenue';

// amounts in cents. min/cap of 0 means "none".
export const FEE_SCHEDULE = {
  transfer: { bps: 0,   flat: 0,  min: 0,  cap: 0,   payer: 'sender',    label: 'free' },
  gift:     { bps: 0,   flat: 0,  min: 0,  cap: 0,   payer: 'sender',    label: 'free' },
  payment:  { bps: 100, flat: 0,  min: 0,  cap: 500, payer: 'recipient', label: '1% · max B$5' },
  bill:     { bps: 0,   flat: 35, min: 0,  cap: 0,   payer: 'sender',    label: 'B$0.35' },
  cashin:   { bps: 0,   flat: 0,  min: 0,  cap: 0,   payer: 'sender',    label: 'free' },
  cashout:  { bps: 100, flat: 0,  min: 25, cap: 300, payer: 'sender',    label: '1% · min B$0.25 · max B$3' },
};

export function feeFor(kind, amountCents) {
  const r = FEE_SCHEDULE[kind] || { bps: 0, flat: 0, min: 0, cap: 0, payer: 'sender' };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { cents: 0, payer: r.payer };
  let cents = Math.floor((amountCents * r.bps) / 10000) + (r.flat || 0);
  if (cents <= 0) return { cents: 0, payer: r.payer };   // free stays free
  if (r.min) cents = Math.max(cents, r.min);
  if (r.cap) cents = Math.min(cents, r.cap);
  return { cents: Math.max(0, cents), payer: r.payer };
}
