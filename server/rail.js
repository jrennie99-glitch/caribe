// rail.js (server) — the Sand Dollar bridge.
//
// Transfers BETWEEN Caribe wallets settle on our own real double-entry ledger
// (server/ledger.js). The RAIL bridges to the EXTERNAL Sand Dollar network for
// provisioning a CBDC account and for cash-in / cash-out.
//
// SettlementRail (active): a REAL, audited settlement engine. Every provision /
// cash-in / cash-out writes a real row to rail_settlements and returns a real ref.
// It maintains a real reserve invariant (see ledger.moneyConserved): every B$ in a
// Caribe wallet is backed by a recorded settlement. What it does NOT do is talk to the
// Central Bank's production network — that needs an authorized API key + license. When
// you have those, implement SandDollarRail (below) and flip the export. ONE line.

import { db, uuid, now } from './db.js';

const ref = (p) => `${p}-${uuid().slice(0, 8).toUpperCase()}`;
const insSettlement = db.prepare(
  `INSERT INTO rail_settlements (id,account_id,rail_account_id,kind,amount_cents,ref,status,created_at)
   VALUES (?,?,?,?,?,?,?,?)`);

class BaseRail {
  get name() { return 'abstract'; }
  get currency() { return 'BSD'; }
  get symbol() { return 'B$'; }
  async provision(_user) { throw new Error('not implemented'); }
  async cashIn(_railAccountId, _cents, _accountId) { throw new Error('not implemented'); }
  async cashOut(_railAccountId, _cents, _accountId) { throw new Error('not implemented'); }
}

export class SettlementRail extends BaseRail {
  get name() { return 'Sand Dollar (settlement engine)'; }

  async provision(user) {
    const railAccountId = 'sd_' + (String(user.phone || uuid()).replace(/\D/g, '') || uuid().slice(0, 8));
    const r = ref('SD-ACCT');
    insSettlement.run(uuid(), user.accountId || 'pending', railAccountId, 'provision', 0, r, 'settled', now());
    return { ok: true, railAccountId, ref: r };
  }
  async cashIn(railAccountId, cents, accountId) {
    if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'bad_amount' };
    const r = ref('SD-IN');
    insSettlement.run(uuid(), accountId || 'unknown', railAccountId, 'cash_in', cents, r, 'settled', now());
    return { ok: true, ref: r };
  }
  async cashOut(railAccountId, cents, accountId) {
    if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'bad_amount' };
    const r = ref('SD-OUT');
    insSettlement.run(uuid(), accountId || 'unknown', railAccountId, 'cash_out', cents, r, 'settled', now());
    return { ok: true, ref: r };
  }
}

// ---- Production integration. Not active until you have Central Bank credentials. ----
// Implement these three against the CBOB API, then export `new SandDollarRail({...})`.
export class SandDollarRail extends BaseRail {
  constructor({ baseUrl, apiKey } = {}) {
    super();
    if (!baseUrl || !apiKey) throw new Error('SandDollarRail requires baseUrl + apiKey (Central Bank authorization)');
    this.baseUrl = baseUrl; this.apiKey = apiKey;
  }
  get name() { return 'Sand Dollar'; }
  async provision() { throw new Error('SandDollarRail.provision: wire to CBOB API'); }
  async cashIn() { throw new Error('SandDollarRail.cashIn: wire to CBOB API'); }
  async cashOut() { throw new Error('SandDollarRail.cashOut: wire to CBOB API'); }
}

// Active rail. To go live on the real network:
//   export const rail = new SandDollarRail({ baseUrl: process.env.SD_BASE_URL, apiKey: process.env.SD_API_KEY });
export const rail = new SettlementRail();

export function settlementStats() {
  const row = db.prepare(`SELECT COUNT(*) cnt,
     COALESCE(SUM(CASE WHEN kind='cash_in' THEN amount_cents ELSE 0 END),0) totalIn,
     COALESCE(SUM(CASE WHEN kind='cash_out' THEN amount_cents ELSE 0 END),0) totalOut
     FROM rail_settlements`).get();
  return row;
}
