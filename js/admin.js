// admin.js — Caribe operator console: revenue dashboard + KYC review.
const app = () => document.getElementById('app');
const KEY = () => sessionStorage.getItem('caribe.admin') || '';
const fmt = (c) => ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let SYMBOLS = {};

async function adminGet(path) {
  const r = await fetch('/api' + path, { headers: { 'x-admin-key': KEY() } });
  if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; }
  return r.json();
}
async function adminPost(path, body) {
  const r = await fetch('/api' + path, { method: 'POST', headers: { 'x-admin-key': KEY(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('http');
  return r.json();
}
const sym = (cur) => SYMBOLS[cur] || (cur + ' ');

function gate(msg) {
  app().innerHTML = `
    <div class="ob" style="background:linear-gradient(180deg,#eafbff,#f3f7f9);min-height:100vh">
      <div class="top" style="padding-top:16vh"><div class="logo">📈</div><h1>Caribe Admin</h1>
        <div class="tag">Operator console</div></div>
      <div class="body">
        <div class="field"><label>Admin key</label><input id="k" type="password" placeholder="x-admin-key"></div>
        ${msg ? `<p class="note" style="color:var(--danger)">${msg}</p>` : ''}
      </div>
      <div class="foot"><button class="btn" id="go">Unlock console</button>
        <p class="note">The key prints in the server logs at startup, or set ADMIN_KEY in production.</p></div>
    </div>`;
  document.getElementById('go').onclick = () => { sessionStorage.setItem('caribe.admin', document.getElementById('k').value.trim()); load(); };
  document.getElementById('k').onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('go').click(); };
}

function statCard(label, value) {
  return `<div class="stat"><div class="sv tnum">${value}</div><div class="sl">${label}</div></div>`;
}

async function load() {
  if (!KEY()) return gate('');
  app().innerHTML = `<div class="boot">Loading…</div>`;
  let s, pend;
  try {
    try { const isl = await (await fetch('/api/islands')).json(); SYMBOLS = Object.fromEntries(isl.islands.map(i => [i.currency, i.symbol])); } catch {}
    s = await adminGet('/admin/stats');
    pend = (await adminGet('/kyc/pending')).pending;
  } catch (e) {
    sessionStorage.removeItem('caribe.admin');
    return gate(e.status === 403 ? 'Wrong admin key.' : 'Could not reach the server.');
  }

  const revRows = (s.revenue || []).filter(r => r.cents !== 0).map(r =>
    `<div class="row" style="cursor:default"><div class="av" style="background:#7c5cff">${sym(r.currency).trim() || '$'}</div>
      <div class="m"><div class="n">${r.currency} revenue</div><div class="s">collected fees + FX margin</div></div>
      <div class="amt pos">${sym(r.currency)}${fmt(r.cents)}</div></div>`).join('') ||
    `<div class="row" style="cursor:default"><div class="m"><div class="s">No revenue yet.</div></div></div>`;

  const pendRows = pend.length ? pend.map(p =>
    `<div class="row" style="cursor:default">
      <div class="av" style="background:#16a7c9">🪪</div>
      <div class="m"><div class="n">${p.name}</div><div class="s">${p.phone} · DOB ${p.dob || '—'} · ID ${p.id_number || '—'}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn ghost" style="padding:8px 12px;width:auto" data-rej="${p.id}">Reject</button>
        <button class="btn" style="padding:8px 12px;width:auto" data-app="${p.id}">Approve</button></div></div>`).join('')
    : `<div class="row" style="cursor:default"><div class="m"><div class="s">No pending KYC reviews. 🎉</div></div></div>`;

  app().innerHTML = `
    <div class="topbar"><div class="brand">Caribe Admin<small>operator console</small></div>
      <div class="spacer"></div><div class="pill" id="logout" style="cursor:pointer">Lock</div></div>
    <div class="screen" style="padding-bottom:40px">
      <div class="sec" style="margin-top:18px"><h3>Revenue</h3></div>
      <div class="card">${revRows}</div>

      <div class="sec"><h3>Network</h3></div>
      <div class="statgrid" style="grid-template-columns:repeat(2,1fr)">
        ${statCard('Users', s.users)}
        ${statCard('Merchants', s.merchants)}
        ${statCard('Transactions', s.txns)}
        ${statCard('Volume (BSD-equiv units)', 'B$' + fmt(s.volumeCents))}
        ${statCard('Cross-island transfers', s.crossBorder.count)}
        ${statCard('Settlements', s.settlements.cnt)}
      </div>

      <div class="sec"><h3>KYC review</h3><span class="badge">${pend.length} pending</span></div>
      <div class="card">${pendRows}</div>
      <p class="note">Approving raises the user to Tier 2 (higher limits). In production, a KYC
        vendor verifies the document against the national registry before this step.</p>
    </div>`;

  document.getElementById('logout').onclick = () => { sessionStorage.removeItem('caribe.admin'); gate(''); };
  app().querySelectorAll('[data-app]').forEach(b => b.onclick = async () => { b.disabled = true; await adminPost('/kyc/review', { userId: b.dataset.app, approve: true }); load(); });
  app().querySelectorAll('[data-rej]').forEach(b => b.onclick = async () => { b.disabled = true; await adminPost('/kyc/review', { userId: b.dataset.rej, approve: false }); load(); });
}

load();
