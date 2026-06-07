// rail.js (server) — the Sand Dollar adapter seam.
//
// Transfers BETWEEN Caribe wallets settle on our own real ledger (server/ledger.js).
// The RAIL represents the EXTERNAL Sand Dollar network — used to provision a CBDC
// account for a verified user and to bridge cash-in / cash-out to the central bank.
//
// MockSandDollarRail: a working stand-in so the whole system runs today.
// SandDollarRail:     the real integration. Implement the same 3 methods against the
//                     Central Bank of The Bahamas API once authorized. ONE file changes.

import { randomUUID } from 'node:crypto';
const ref = (p) => `${p}-${randomUUID().slice(0, 8).toUpperCase()}`;

class BaseRail {
  get name() { return 'abstract'; }
  get currency() { return 'BSD'; }
  get symbol() { return 'B$'; }
  async provision(_user) { throw new Error('not implemented'); }
  async cashIn(_railAccountId, _cents) { throw new Error('not implemented'); }
  async cashOut(_railAccountId, _cents) { throw new Error('not implemented'); }
}

export class MockSandDollarRail extends BaseRail {
  get name() { return 'Sand Dollar (sandbox)'; }
  async provision(user) {
    return { ok: true, railAccountId: 'sd_' + (user.phone || randomUUID()).replace(/\D/g, '') , ref: ref('SD-ACCT') };
  }
  async cashIn(_railAccountId, cents) {
    if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'bad_amount' };
    return { ok: true, ref: ref('SD-IN') };
  }
  async cashOut(_railAccountId, cents) {
    if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'bad_amount' };
    return { ok: true, ref: ref('SD-OUT') };
  }
}

// ---- Real integration goes here. Not active until credentials exist. ----
export class SandDollarRail extends BaseRail {
  constructor({ baseUrl, apiKey } = {}) {
    super();
    if (!baseUrl || !apiKey) throw new Error('SandDollarRail requires baseUrl + apiKey (Central Bank authorization)');
    this.baseUrl = baseUrl; this.apiKey = apiKey;
  }
  get name() { return 'Sand Dollar'; }
  async provision(user) {
    // TODO: POST {baseUrl}/wallets with KYC payload, Authorization: Bearer apiKey
    throw new Error('SandDollarRail.provision not implemented — wire to CBOB API');
  }
  async cashIn() { throw new Error('SandDollarRail.cashIn not implemented — wire to CBOB API'); }
  async cashOut() { throw new Error('SandDollarRail.cashOut not implemented — wire to CBOB API'); }
}

// Active rail. To go live: replace with
//   new SandDollarRail({ baseUrl: process.env.SD_BASE_URL, apiKey: process.env.SD_API_KEY })
export const rail = new MockSandDollarRail();
