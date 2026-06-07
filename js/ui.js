// ui.js — all screens + interactions, backed by the real Caribe API.
import { api, isLoggedIn, setToken, clearToken, newKey } from './api.js';
import * as store from './store.js';

const $ = (sel, r=document) => r.querySelector(sel);
const app = () => document.getElementById('app');
const SYM = 'B$';

// ---------- icon set (crisp line SVGs, no emoji chrome) ----------
const ICONS = {
  wave:`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 13c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/></svg>`,
  send:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>`,
  receive:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  scan:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M4 12h16"/></svg>`,
  plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  wallet:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 11h-5a2 2 0 0 0 0 4h5a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1Z"/></svg>`,
  compass:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>`,
  receipt:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>`,
  chev:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
};
const icon = (n) => ICONS[n] || '';

function countUp(el, to){
  if(!el) return; const dur=750, t0=performance.now(), ease=t=>1-Math.pow(1-t,3);
  (function tick(now){ const p=Math.min(1,(now-t0)/dur);
    el.textContent=store.fmt(Math.round(to*ease(p))); if(p<1) requestAnimationFrame(tick); })(t0);
}

let tab = 'home';
let authMode = 'register';

// ---------- helpers ----------
const initials = (n) => (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
function timeAgo(ts){const s=(Date.now()-ts)/1000;
  if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
const avatar=(name,color)=>`<div class="av" style="background:${color||'#06384f'}">${initials(name)}</div>`;

// ---------- sheets ----------
function openSheet(html){
  closeSheet();
  const bg=document.createElement('div'); bg.className='sheet-bg';
  bg.innerHTML=`<div class="sheet"><div class="grab"></div>${html}</div>`;
  bg.addEventListener('click',e=>{ if(e.target===bg) closeSheet(); });
  document.body.appendChild(bg); return bg;
}
function closeSheet(){ document.querySelectorAll('.sheet-bg').forEach(n=>n.remove()); }
function successSheet(title,sub){
  const bg=openSheet(`<div class="success"><div class="ring">${icon('check')}</div><h2>${title}</h2>
    <p class="lead">${sub}</p><button class="btn" id="done">Done</button></div>`);
  $('#done',bg).onclick=()=>{ closeSheet(); render(); };
}
function shake(id,msg){const b=document.getElementById(id);if(!b)return;
  b.textContent=msg;b.classList.add('coral');b.disabled=true;
  setTimeout(()=>{b.classList.remove('coral');b.textContent='Try again';b.disabled=false;},1400);}
function toast(msg){const bg=openSheet(`<div class="center"><p style="font-size:15px;margin:10px 0 16px">${msg}</p>
  <button class="btn ghost" id="ok">OK</button></div>`);$('#ok',bg).onclick=closeSheet;}

// ============================================================
//  AUTH  (register + login)
// ============================================================
function renderAuth(){
  if(authMode==='login') return renderLogin();
  return renderRegister();
}

function renderRegister(){
  app().innerHTML=`
   <div class="screen ob" style="background:linear-gradient(180deg,#eafbff,#f3f7f9)">
     <div class="top">
       <div class="logo">${icon('wave')}</div><h1>Caribe</h1>
       <div class="tag">The everything app for the islands.</div>
       <div class="chips"><span class="chip">💸 Pay</span><span class="chip">📲 Send</span>
         <span class="chip">🧾 Bills</span><span class="chip">🛍️ Shops</span></div>
     </div>
     <div class="body" id="obbody"></div>
     <div class="foot"><button class="btn" id="obnext">Get started</button>
       <p class="note">Already have a wallet? <a id="toLogin" style="color:var(--sea);font-weight:700">Log in</a><br>
       Bahamas · Sand Dollar (B$1 = US$1).</p></div>
   </div>`;
  $('#toLogin').onclick=()=>{authMode='login';render();};
  let step=0; const body=$('#obbody'), next=$('#obnext');
  const data={name:'',phone:'',pin:''};
  const draw=()=>{
    if(step===0){body.innerHTML=`
      <div class="field"><label>Your name</label><input id="i_name" placeholder="e.g. Andre Smith" value="${data.name}"></div>
      <div class="field"><label>Phone number</label><input id="i_phone" inputmode="tel" placeholder="(242) 000-0000" value="${data.phone}"></div>`;
      next.textContent='Continue';}
    else if(step===1){body.innerHTML=`
      <div class="center" style="padding:10px 18px"><div style="font-size:46px">🪪</div>
        <h2 style="margin:8px 0 4px">Verify your identity</h2>
        <p class="muted" style="font-size:13px">Bahamian KYC. In production you'd scan your NIB card or passport. Here we issue you a real Tier 1 wallet.</p></div>
      <div class="tier">🔒 Tier 1 · hold up to B$500 · send B$300/day</div>`;
      next.textContent='Verify &amp; continue';}
    else{body.innerHTML=`
      <div class="field"><label>Set a 4-digit PIN</label><input id="i_pin" inputmode="numeric" maxlength="4" placeholder="••••"></div>
      <p class="note">Protects your wallet. Hashed with scrypt on the server — never stored in plain text.</p>`;
      next.textContent='Create my wallet';}
  };
  draw();
  next.onclick=async()=>{
    if(step===0){
      data.name=$('#i_name').value.trim(); data.phone=$('#i_phone').value.trim();
      if(!data.name||!data.phone){return shakeBtn(next,'Fill both fields');}
      step=1;draw();
    } else if(step===1){ step=2; draw(); }
    else{
      data.pin=$('#i_pin').value.trim();
      if(!/^\d{4}$/.test(data.pin)) return shakeBtn(next,'Enter 4 digits');
      next.disabled=true; next.textContent='Creating…';
      try{
        const r=await api.register(data); setToken(r.token);
        await store.loadAll(); tab='home'; render();
      }catch(e){ next.disabled=false; shakeBtn(next, e.code==='phone_taken'?'Phone already registered':(e.message||'Try again')); draw?.(); }
    }
  };
}
function shakeBtn(btn,msg){const o=btn.textContent;btn.classList.add('coral');btn.textContent=msg;btn.disabled=true;
  setTimeout(()=>{btn.classList.remove('coral');btn.textContent=o;btn.disabled=false;},1400);}

function renderLogin(){
  app().innerHTML=`
   <div class="screen ob" style="background:linear-gradient(180deg,#eafbff,#f3f7f9)">
     <div class="top"><div class="logo">${icon('wave')}</div><h1>Welcome back</h1><div class="tag">Log in to your Caribe wallet</div></div>
     <div class="body">
       <div class="field"><label>Phone number</label><input id="l_phone" inputmode="tel" placeholder="(242) 000-0000"></div>
       <div class="field"><label>PIN</label><input id="l_pin" inputmode="numeric" maxlength="4" placeholder="••••"></div>
     </div>
     <div class="foot"><button class="btn" id="login">Log in</button>
       <p class="note">New here? <a id="toReg" style="color:var(--sea);font-weight:700">Create a wallet</a></p></div>
   </div>`;
  $('#toReg').onclick=()=>{authMode='register';render();};
  $('#login').onclick=async()=>{
    const b=$('#login'); b.disabled=true; b.textContent='Logging in…';
    try{
      const r=await api.login({phone:$('#l_phone').value.trim(), pin:$('#l_pin').value.trim()});
      setToken(r.token); await store.loadAll(); tab='home'; render();
    }catch(e){ b.disabled=false; shakeBtn(b, e.message||'Wrong phone or PIN'); }
  };
}

// ============================================================
//  HOME / WALLET
// ============================================================
function renderHome(){
  const s=store.get();
  const recent=s.txns.slice(0,5).map(t=>`
    <div class="row">${avatar(t.party,t.dir==='in'?'#1fb87a':'#06384f')}
      <div class="m"><div class="n">${t.party}</div><div class="s">${timeAgo(t.ts)}${t.memo?' · '+t.memo:''}</div></div>
      <div class="amt ${t.dir==='in'?'pos':'neg'}">${t.dir==='in'?'+':'−'}${SYM}${store.fmt(t.amount)}</div></div>`).join('')
    || `<div class="row" style="cursor:default"><div class="m"><div class="s">No activity yet — cash in to get started.</div></div></div>`;
  screen(`
    <div class="hero">
      <div class="label">Sand Dollar balance</div>
      <div class="bal tnum"><small>${SYM}</small><span id="balnum">${store.fmt(store.balance())}</span></div>
      <div class="sub"><span class="dot"></span> Sand Dollar (sandbox) · instant &amp; free</div>
    </div>
    <div class="quick">
      <div class="qa" data-act="send"><div class="ic">${icon('send')}</div><div class="t">Send</div></div>
      <div class="qa" data-act="receive"><div class="ic">${icon('receive')}</div><div class="t">Receive</div></div>
      <div class="qa" data-act="scan"><div class="ic">${icon('scan')}</div><div class="t">Scan &amp; Pay</div></div>
      <div class="qa" data-act="cashin"><div class="ic">${icon('plus')}</div><div class="t">Cash in</div></div>
    </div>
    <div class="sec"><h3>People</h3><span class="muted" style="margin-left:auto;font-size:12px">tap to send</span></div>
    <div class="card">${
      s.contacts.length? s.contacts.map(c=>`<div class="row" data-send="${c.id}">${avatar(c.name,c.color)}
        <div class="m"><div class="n">${c.name}</div><div class="s">${c.handle||''}</div></div>
        <div class="chev">${icon('chev')}</div></div>`).join('')
      : `<div class="row" style="cursor:default"><div class="m"><div class="s">No other users yet. Invite someone — they register and appear here.</div></div></div>`
    }</div>
    <div class="sec"><h3>Recent activity</h3><span class="link" data-tab="activity">See all</span></div>
    <div class="card">${recent}</div>
    <p class="note">Real backend · real double-entry ledger. The live Sand Dollar network plugs in behind one adapter.</p>
  `);
  app().querySelectorAll('[data-act]').forEach(n=>n.onclick=()=>action(n.dataset.act));
  app().querySelectorAll('[data-send]').forEach(n=>n.onclick=()=>sendTo(n.dataset.send));
  app().querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{tab=n.dataset.tab;render();});
  countUp($('#balnum'), store.balance());
}

// ============================================================
//  DISCOVER
// ============================================================
const MINI_MAP={topup:'topup',power:'biller_bpl',water:'biller_water',cable:'biller_cable',gov:'biller_gov',school:'biller_school',ferry:'biller_ferry'};
const MINIS=[
  {id:'topup',t:'Top-up',ic:'📱'},{id:'power',t:'BPL Power',ic:'⚡'},
  {id:'water',t:'Water',ic:'💧'},{id:'cable',t:'Cable/Net',ic:'📺'},
  {id:'gov',t:'Gov Fees',ic:'🏛️'},{id:'school',t:'School',ic:'🎒'},
  {id:'ferry',t:'Ferry',ic:'⛴️'},{id:'more',t:'More',ic:'➕'},
];
function renderDiscover(){
  const s=store.get();
  screen(`
    <div class="sec" style="margin-top:18px"><h3>Mini-apps</h3><span class="badge">platform</span></div>
    <div class="grid">${MINIS.map(m=>`<div class="mini" data-mini="${m.id}"><div class="ic">${m.ic}</div><div class="t">${m.t}</div></div>`).join('')}</div>
    <div class="sec"><h3>Shops near you</h3><span class="muted" style="margin-left:auto;font-size:12px">Nassau</span></div>
    <div class="card">${s.merchants.map(m=>`<div class="row" data-pay="${m.id}">
      <div class="av" style="background:${m.color}">${m.emoji||'🏬'}</div>
      <div class="m"><div class="n">${m.name}</div><div class="s">${m.category||''} · accepts Sand Dollar</div></div>
      <div class="badge">Pay ›</div></div>`).join('')}</div>
    <p class="note">The WeChat move: Caribe owns the rail; any shop, ferry, clinic or government
      service builds a mini-app on top. You don't build every service — they do.</p>`);
  app().querySelectorAll('[data-mini]').forEach(n=>n.onclick=()=>runMini(n.dataset.mini));
  app().querySelectorAll('[data-pay]').forEach(n=>n.onclick=()=>payMerchant(n.dataset.pay));
}
function runMini(id){
  if(id==='more') return toast('Mini-app store coming soon — any Bahamian business can build here.');
  const billerId=MINI_MAP[id]; const s=store.get();
  const biller=s.billers.find(b=>b.id===billerId)||{name:'Bill'};
  amountEntry(`Pay ${biller.name}`, id==='topup'?'Aliv / BTC prepaid credit':'Enter amount due', 'Pay', async(cents)=>{
    await doMoney(()=>api.bill({billerId, amountCents:cents, idempotencyKey:newKey()}),
      'Paid', `${SYM}${store.fmt(cents)} to ${biller.name}`);
  });
}

// ============================================================
//  ACTIVITY / ME
// ============================================================
function renderActivity(){
  const s=store.get();
  screen(`<div class="sec" style="margin-top:18px"><h3>All activity</h3>
      <span class="muted" style="margin-left:auto;font-size:12px">${s.txns.length} transactions</span></div>
    <div class="card">${s.txns.length? s.txns.map(t=>`<div class="row">${avatar(t.party,t.dir==='in'?'#1fb87a':'#06384f')}
      <div class="m"><div class="n">${t.party}</div><div class="s">${new Date(t.ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${t.ref}</div></div>
      <div class="amt ${t.dir==='in'?'pos':'neg'}">${t.dir==='in'?'+':'−'}${SYM}${store.fmt(t.amount)}</div></div>`).join('')
      :`<div class="row" style="cursor:default"><div class="m"><div class="s">No transactions yet.</div></div></div>`}</div>`);
}
function renderMe(){
  const u=store.get().user||{};
  screen(`
    <div class="card" style="margin-top:18px"><div class="row" style="cursor:default">
      <div class="av" style="background:#06384f;width:54px;height:54px;font-size:20px">${initials(u.name)}</div>
      <div class="m"><div class="n" style="font-size:17px">${u.name||'You'}</div>
        <div class="s">${u.phone||''} · Tier ${u.kycTier} verified</div></div></div></div>
    <div class="sec"><h3>Account</h3></div>
    <div class="card">
      <div class="row" style="cursor:default"><div class="av" style="background:#16a7c9">🪪</div><div class="m"><div class="n">KYC level</div><div class="s">Tier ${u.kycTier} · hold B$500 · send B$300/day</div></div></div>
      <div class="row" style="cursor:default"><div class="av" style="background:#2fd9c5">🏦</div><div class="m"><div class="n">Sand Dollar account</div><div class="s">${u.railAccountId||'—'}</div></div></div>
      <div class="row" data-cashout><div class="av" style="background:#f5b53d">🏧</div><div class="m"><div class="n">Cash out</div><div class="s">Withdraw to Sand Dollar</div></div><div class="amt muted">›</div></div>
    </div>
    <div class="pad"><button class="btn ghost" id="logout">Log out</button></div>
    <p class="note">Caribe · real backend, real ledger. Balances live in SQLite on the server, not on this device.</p>`);
  $('#logout').onclick=()=>{clearToken();store.clear();tab='home';render();};
  const co=app().querySelector('[data-cashout]'); if(co) co.onclick=()=>cashOut();
}

// ============================================================
//  MONEY ACTIONS
// ============================================================
function action(a){ if(a==='send')return sendPicker(); if(a==='receive')return receive();
  if(a==='scan')return scan(); if(a==='cashin')return cashIn(); }

function sendPicker(){
  const s=store.get();
  if(!s.contacts.length) return toast('No other users yet. Have someone register, then send to them.');
  openSheet(`<h2>Send money</h2><p class="lead">Pick someone</p>
    <div style="max-height:50vh;overflow:auto">${s.contacts.map(c=>`<div class="row" data-c="${c.id}">${avatar(c.name,c.color)}
      <div class="m"><div class="n">${c.name}</div><div class="s">${c.handle||''}</div></div><div class="amt" style="color:var(--sea)">›</div></div>`).join('')}</div>`);
  document.querySelectorAll('[data-c]').forEach(n=>n.onclick=()=>sendTo(n.dataset.c));
}

function amountEntry(title,sub,cta,onConfirm,opts={}){
  let cents=0;
  const bg=openSheet(`
    <h2>${title}</h2><p class="lead">${sub}</p>
    <div class="amount-big"><small>${SYM}</small><span id="amt">0.00</span></div>
    ${opts.envelope?`<label class="center" style="display:flex;gap:8px;justify-content:center;align-items:center;font-size:13px;color:var(--muted);margin:4px 0 8px">
      <input type="checkbox" id="env"> 🧧 Send as a gift envelope</label>`:''}
    <div class="field" style="margin-top:0"><input id="memo" placeholder="${opts.memoPh||'Add a note (optional)'}"></div>
    <div class="keys">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k=>`<div class="key" data-k="${k}">${k}</div>`).join('')}</div>
    <button class="btn ${opts.coral?'coral':''}" id="go" disabled>${cta}</button>`);
  const go=$('#go',bg), amt=$('#amt',bg);
  bg.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;
    if(k==='⌫')cents=Math.floor(cents/10); else if(k==='.'){} else cents=cents*10+parseInt(k,10);
    if(cents>99999999)cents=99999999; amt.textContent=store.fmt(cents); go.disabled=cents<=0;
  });
  go.onclick=()=>onConfirm(cents,$('#memo',bg).value.trim(),$('#env',bg)?.checked,go);
}

// shared: run a money api call, refresh, show success or shake
async function doMoney(call, title, sub){
  const go=$('#go'); if(go){go.disabled=true;go.textContent='Working…';}
  try{ await call(); await store.refresh(); successSheet(title,sub); }
  catch(e){ if(go) shake('go', e.message||'Try again'); }
}

function sendTo(contactId){
  const c=store.get().contacts.find(x=>x.id===contactId); if(!c)return;
  amountEntry(`Send to ${c.name}`,c.handle||'',' Send',async(cents,memo,env)=>{
    await doMoney(()=>api.transfer({toId:contactId,amountCents:cents,memo,envelope:!!env,idempotencyKey:newKey()}),
      env?'🧧 Envelope sent!':'Sent',
      `${SYM}${store.fmt(cents)} to ${c.name}${memo?` · "${memo}"`:''}`);
  },{envelope:true,memoPh:'lunch, rent, happy birthday…'});
}
function payMerchant(mId){
  const m=store.get().merchants.find(x=>x.id===mId); if(!m)return;
  amountEntry(`Pay ${m.name}`,`${m.category||''} · Sand Dollar`,'Pay now',async(cents,memo)=>{
    await doMoney(()=>api.pay({toId:mId,amountCents:cents,memo,idempotencyKey:newKey()}),
      'Paid',`${SYM}${store.fmt(cents)} to ${m.name}`);
  });
}
function scan(){
  const s=store.get();
  openSheet(`<h2>Scan &amp; Pay</h2><p class="lead">Point at a merchant QR. (Demo: pick one.)</p>
    <div style="background:#06384f;border-radius:18px;height:150px;display:flex;align-items:center;justify-content:center;color:#fff;margin:6px 0 14px">
      <div class="center"><div style="font-size:40px">⛶</div><div style="color:#9fc7d6;font-size:12px;margin-top:6px">camera viewfinder</div></div></div>
    ${s.merchants.slice(0,3).map(m=>`<div class="row" data-pay="${m.id}"><div class="av" style="background:${m.color}">${m.emoji}</div>
      <div class="m"><div class="n">${m.name}</div><div class="s">tap to simulate scan</div></div><div class="badge">Pay ›</div></div>`).join('')}`);
  document.querySelectorAll('[data-pay]').forEach(n=>n.onclick=()=>payMerchant(n.dataset.pay));
}
function receive(){
  const u=store.get().user||{};
  openSheet(`<div class="center"><h2>Receive money</h2><p class="lead">Show this to get paid in Sand Dollar</p>
    <div style="width:200px;height:200px;margin:6px auto;border-radius:18px;background:repeating-conic-gradient(#06384f 0 25%, #fff 0 50%) 50%/22px 22px;border:8px solid #06384f"></div>
    <div style="font-weight:800;font-size:18px;margin-top:12px">${u.name||'You'}</div>
    <div class="muted">${u.handle||''} · ${u.phone||''}</div>
    <button class="btn ghost" style="margin-top:16px" id="cls">Close</button></div>`);
  $('#cls').onclick=closeSheet;
}
function cashIn(){
  amountEntry('Cash in','Top up from your bank / agent','Add money',async(cents)=>{
    await doMoney(()=>api.cashin({amountCents:cents,idempotencyKey:newKey()}),
      'Topped up',`${SYM}${store.fmt(cents)} added to your wallet`);
  });
}
function cashOut(){
  amountEntry('Cash out','Withdraw to Sand Dollar','Withdraw',async(cents)=>{
    await doMoney(()=>api.cashout({amountCents:cents,idempotencyKey:newKey()}),
      'Withdrawn',`${SYM}${store.fmt(cents)} sent to your Sand Dollar account`);
  });
}

// ============================================================
//  SHELL
// ============================================================
function screen(inner){
  const titles={home:'Caribe',discover:'Discover',activity:'Activity',me:'Me'};
  app().innerHTML=`
    <div class="topbar"><div class="brand">${titles[tab]||'Caribe'}<small>Bahamas · Sand Dollar</small></div>
      <div class="spacer"></div><div class="pill">B$1 = US$1</div></div>
    <div class="screen">${inner}</div>${navbar()}`;
  bindNav();
}
function navbar(){
  const t=(id,ic,label)=>`<div class="tab ${tab===id?'active':''}" data-go="${id}"><span class="ic">${icon(ic)}</span>${label}</div>`;
  return `<div class="nav">${t('home','wallet','Wallet')}${t('discover','compass','Discover')}
    <div class="scanbtn" data-scan="1"><div class="b">${icon('scan')}</div></div>
    ${t('activity','receipt','Activity')}${t('me','user','Me')}</div>`;
}
function bindNav(){
  app().querySelectorAll('[data-go]').forEach(n=>n.onclick=()=>{tab=n.dataset.go;render();});
  const sc=app().querySelector('[data-scan]'); if(sc) sc.onclick=()=>scan();
}

export async function render(){
  if(!isLoggedIn()) return renderAuth();
  if(!store.get().user){
    try{ await store.loadAll(); }
    catch(e){ clearToken(); return renderAuth(); }
  }
  if(tab==='discover') return renderDiscover();
  if(tab==='activity') return renderActivity();
  if(tab==='me') return renderMe();
  return renderHome();
}
