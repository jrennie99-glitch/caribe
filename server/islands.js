// islands.js — the Caribbean network registry.
//
// Every island is a node. The platform core is identical everywhere; each island just
// supplies its currency, its CBDC/payment rail, and its regulator. `usdPer` = how many
// of that currency equal 1 USD (the FX reference). Flip `live:true` as each island's
// rail + license come online. Cross-island transfers convert through USD using these
// rates, and Caribe keeps a transparent FX margin (FX_SPREAD_BPS).

export const FX_SPREAD_BPS = 150; // 1.5% FX margin on cross-island transfers

export const ISLANDS = [
  // code, name, currency, symbol, usdPer (units per 1 USD), rail, live
  { code:'BS', name:'The Bahamas',            currency:'BSD', symbol:'B$',   usdPer:1,     rail:'sand_dollar', live:true  },
  { code:'JM', name:'Jamaica',                currency:'JMD', symbol:'J$',   usdPer:157,   rail:'jam_dex',     live:true  },
  { code:'TT', name:'Trinidad & Tobago',      currency:'TTD', symbol:'TT$',  usdPer:6.78,  rail:'generic',     live:true  },
  { code:'BB', name:'Barbados',               currency:'BBD', symbol:'Bds$', usdPer:2,     rail:'generic',     live:true  },
  { code:'JM2',name:'Cayman Islands',         currency:'KYD', symbol:'CI$',  usdPer:0.83,  rail:'generic',     live:true  },
  { code:'AG', name:'Antigua & Barbuda',      currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'DM', name:'Dominica',               currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'GD', name:'Grenada',                currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'KN', name:'St. Kitts & Nevis',      currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'LC', name:'Saint Lucia',            currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'VC', name:'St. Vincent & Grenadines',currency:'XCD',symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'AI', name:'Anguilla',               currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'MS', name:'Montserrat',             currency:'XCD', symbol:'EC$',  usdPer:2.7,   rail:'dcash',       live:true  },
  { code:'HT', name:'Haiti',                  currency:'HTG', symbol:'G',    usdPer:132,   rail:'generic',     live:true  },
  { code:'DO', name:'Dominican Republic',     currency:'DOP', symbol:'RD$',  usdPer:59,    rail:'generic',     live:true  },
  { code:'CU', name:'Cuba',                   currency:'CUP', symbol:'$',    usdPer:120,   rail:'generic',     live:true  },
  { code:'BZ', name:'Belize',                 currency:'BZD', symbol:'BZ$',  usdPer:2,     rail:'generic',     live:true  },
  { code:'GY', name:'Guyana',                 currency:'GYD', symbol:'G$',   usdPer:209,   rail:'generic',     live:true  },
  { code:'SR', name:'Suriname',               currency:'SRD', symbol:'Sr$',  usdPer:37,    rail:'generic',     live:true  },
  { code:'AW', name:'Aruba',                  currency:'AWG', symbol:'Afl',  usdPer:1.79,  rail:'generic',     live:true  },
  { code:'CW', name:'Curaçao',                currency:'ANG', symbol:'ƒ',    usdPer:1.79,  rail:'generic',     live:true  },
  { code:'SX', name:'Sint Maarten',           currency:'ANG', symbol:'ƒ',    usdPer:1.79,  rail:'generic',     live:true  },
  // USD-using territories (no FX needed vs USD)
  { code:'TC', name:'Turks & Caicos',         currency:'USD', symbol:'US$',  usdPer:1,     rail:'generic',     live:true  },
  { code:'VG', name:'British Virgin Islands', currency:'USD', symbol:'US$',  usdPer:1,     rail:'generic',     live:true  },
  { code:'PR', name:'Puerto Rico',            currency:'USD', symbol:'US$',  usdPer:1,     rail:'generic',     live:true  },
  { code:'VI', name:'U.S. Virgin Islands',    currency:'USD', symbol:'US$',  usdPer:1,     rail:'generic',     live:true  },
];

const byCode = Object.fromEntries(ISLANDS.map(i => [i.code, i]));
const firstByCurrency = {};
for (const i of ISLANDS) if (!firstByCurrency[i.currency]) firstByCurrency[i.currency] = i;

export const islandByCode = (code) => byCode[code] || null;
export const islandByCurrency = (cur) => firstByCurrency[cur] || null;
export const symbolFor = (cur) => (firstByCurrency[cur]?.symbol) || cur + ' ';
export const usdPerOf = (cur) => (firstByCurrency[cur]?.usdPer) ?? null;

/** Convert integer minor-units (cents) from one currency to another at mid-market. */
export function fxConvertCents(amountCents, srcCur, dstCur) {
  if (srcCur === dstCur) return amountCents;
  const a = usdPerOf(srcCur), b = usdPerOf(dstCur);
  if (a == null || b == null) return null;
  return Math.round(amountCents * (b / a));
}

/** Mid-market rate: 1 src = ? dst (for display). */
export function rate(srcCur, dstCur) {
  const a = usdPerOf(srcCur), b = usdPerOf(dstCur);
  if (a == null || b == null) return null;
  return b / a;
}
