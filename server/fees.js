// fees.js — Caribe's revenue model. One place controls all pricing.
//
// Every fee is collected into the REVENUE_ACCOUNT via real double-entry, inside the
// same atomic transaction as the payment itself. Fees are integer cents, computed in
// basis points (bps) so the math never drifts (1% = 100 bps).
//
// `payer` decides who absorbs the fee:
//   'sender'    → payer pays amount + fee (used for P2P send, bills, cash-out)
//   'recipient' → merchant absorbs it; customer pays exactly the amount, merchant
//                 receives amount − fee  (the standard card "merchant discount rate")

export const REVENUE_ACCOUNT = 'app_revenue';

export const FEE_SCHEDULE = {
  transfer: { bps: 50,  flat: 0,  payer: 'sender',    label: '0.5%' },        // P2P send
  gift:     { bps: 50,  flat: 0,  payer: 'sender',    label: '0.5%' },        // gift envelope
  payment:  { bps: 150, flat: 0,  payer: 'recipient', label: '1.5%' },        // pay a merchant
  bill:     { bps: 100, flat: 0,  payer: 'sender',    label: '1%' },          // pay a bill
  cashin:   { bps: 0,   flat: 0,  payer: 'sender',    label: 'free' },        // funding is free (drives adoption)
  cashout:  { bps: 100, flat: 25, payer: 'sender',    label: '1% + B$0.25' }, // withdrawal
};

export function feeFor(kind, amountCents) {
  const r = FEE_SCHEDULE[kind] || { bps: 0, flat: 0, payer: 'sender' };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { cents: 0, payer: r.payer };
  const cents = Math.floor((amountCents * r.bps) / 10000) + r.flat;
  return { cents: Math.max(0, cents), payer: r.payer };
}
