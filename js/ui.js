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
// mirror of server fee math (fees.js), for showing a live preview before confirm
function clientFee(kind, cents){
  const r=(store.get().fees||{})[kind]||{bps:0,flat:0,min:0,cap:0,payer:'sender'};
  if(cents<=0) return {cents:0,payer:r.payer};
  let f=Math.floor(cents*r.bps/10000)+(r.flat||0);
  if(f<=0) return {cents:0,payer:r.payer};
  if(r.min) f=Math.max(f,r.min);
  if(r.cap) f=Math.min(f,r.cap);
  return {cents:Math.max(0,f),payer:r.payer};
}

// ---------- real QR + pay-link ----------
function qrSvg(text){
  try{ const qr=window.qrcode(0,'M'); qr.addData(text); qr.make(); return qr.createSvgTag({cellSize:6,margin:1,scalable:true}); }
  catch(e){ console.error('qr',e); return '<div class="muted">QR unavailable</div>'; }
}
function buildPayURI({id,name,kind,amt}){
  let u=`caribe:pay?to=${encodeURIComponent(id)}&n=${encodeURIComponent(name||'')}&k=${kind||'user'}`;
  if(amt) u+=`&amt=${amt}`; return u;
}
function parsePayURI(str){
  if(!str||typeof str!=='string'||!str.startsWith('caribe:')) return null;
  try{ const q=new URLSearchParams(str.split('?')[1]||''); const to=q.get('to'); if(!to) return null;
    return {id:to,name:q.get('n')||'Payee',kind:q.get('k')||'user',amt:q.get('amt')?parseInt(q.get('amt'),10):0};
  }catch(e){ return null; }
}
function payFromPayload(p){
  if(!p||!p.id) return toast('That QR code is not a Caribe payment code.');
  const me=store.get().user;
  if(me && p.id===me.accountId) return toast("That's your own code.");
  payToAccount(p.id,p.name,p.kind,p.amt);
}
function payToAccount(toId,name,kind,presetCents){
  const isM=kind==='merchant';
  const run=async(cents,memo)=>{
    const call=isM?()=>api.pay({toId,amountCents:cents,memo,idempotencyKey:newKey()})
                  :()=>api.transfer({toId,amountCents:cents,memo,idempotencyKey:newKey()});
    await doMoney(call, isM?'Paid':'Sent', `${SYM}${store.fmt(cents)} to ${name}`);
  };
  if(presetCents>0) return confirmPay(isM?`Pay ${name}`:`Send to ${name}`, name, presetCents, isM?'payment':'transfer', run);
  amountEntry(isM?`Pay ${name}`:`Send to ${name}`, isM?'Sand Dollar':'Sand Dollar', isM?'Pay now':'Send',
    (cents,memo)=>run(cents,memo), {feeKind:isM?'payment':'transfer'});
}
function confirmPay(title,name,cents,feeKind,run){
  const f=clientFee(feeKind,cents);
  const feeLine=f.cents>0?(f.payer==='recipient'
    ? `<div class="feeline">Caribe fee ${SYM}${store.fmt(f.cents)} · they receive ${SYM}${store.fmt(cents-f.cents)}</div>`
    : `<div class="feeline">Caribe fee ${SYM}${store.fmt(f.cents)} · total ${SYM}${store.fmt(cents+f.cents)}</div>`):'<div class="feeline">No fee</div>';
  const bg=openSheet(`<h2>${title}</h2><p class="lead">${name}</p>
    <div class="amount-big"><small>${SYM}</small>${store.fmt(cents)}</div>${feeLine}
    <button class="btn" id="go">Confirm payment</button>`);
  $('#go',bg).onclick=()=>run(cents,'');
}

// ---------- real camera scanning ----------
let _camStream=null,_camActive=false;
function stopCam(){ _camActive=false; if(_camStream){try{_camStream.getTracks().forEach(t=>t.stop());}catch(e){} _camStream=null;} }
async function startCam(){
  const msg=()=>document.getElementById('scanmsg');
  if(!('BarcodeDetector' in window) || !(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){
    if(msg()) msg().textContent='Live scanning needs a supported camera. Pick a payee below.'; return;
  }
  try{
    _camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v=document.getElementById('cam'); if(!v){ stopCam(); return; }
    v.srcObject=_camStream; await v.play();
    const det=new BarcodeDetector({formats:['qr_code']}); _camActive=true;
    (async function loop(){
      while(_camActive && document.getElementById('cam')){
        try{ const codes=await det.detect(document.getElementById('cam'));
          for(const c of codes){ const p=parsePayURI(c.rawValue); if(p){ stopCam(); closeSheet(); return payFromPayload(p);} }
        }catch(e){}
        await new Promise(r=>setTimeout(r,300));
      }
    })();
  }catch(e){ if(msg()) msg().textContent='Camera blocked. Pick a payee below.'; }
}
function scanFallback(){
  const s=store.get();
  const list=[...s.merchants.map(m=>({id:m.id,name:m.name,kind:'merchant',color:m.color,emoji:m.emoji})),
              ...s.contacts.map(c=>({id:c.id,name:c.name,kind:'user',color:c.color}))];
  openSheet(`<h2>Pay a saved payee</h2><p class="lead">Pick who to pay</p>
    <div style="max-height:55vh;overflow:auto">${list.map(x=>`<div class="row" data-pp="${x.id}|${x.kind}|${encodeURIComponent(x.name)}">
      <div class="av" style="background:${x.color||'#06384f'}">${x.emoji||initials(x.name)}</div>
      <div class="m"><div class="n">${x.name}</div><div class="s">${x.kind==='merchant'?'Merchant':'Person'}</div></div>
      <div class="chev">${icon('chev')}</div></div>`).join('')||'<p class="note">No saved payees yet.</p>'}</div>`);
  document.querySelectorAll('[data-pp]').forEach(n=>n.onclick=()=>{const[id,kind,nm]=n.dataset.pp.split('|');payToAccount(id,decodeURIComponent(nm),kind,0);});
}

// ---------- merchant: request payment (QR) ----------
function chargeFlow(){
  amountEntry('Request payment','Customer scans this to pay you','Show QR code',(cents)=>{
    const u=store.get().user;
    const uri=buildPayURI({id:u.accountId,name:u.businessName||u.name,kind:'merchant',amt:cents});
    const bg=openSheet(`<div class="center"><h2>${SYM}${store.fmt(cents)}</h2>
      <p class="lead">${u.businessName||u.name} · scan to pay</p>
      <div class="qrbox">${qrSvg(uri)}</div>
      <button class="btn" id="paid">Payment received? Refresh</button>
      <button class="btn ghost" style="margin-top:10px" id="cls">Close</button></div>`);
    $('#paid',bg).onclick=async()=>{ await store.refresh(); closeSheet(); render(); };
    $('#cls',bg).onclick=()=>{ closeSheet(); };
  },{feeKind:'payment'});
}

// ---------- merchant home ----------
async function renderMerchantHome(){
  const u=store.get().user;
  let sum={balance:u.balance,grossInToday:0,countInToday:0,feesToday:0,netInToday:0};
  try{ sum=await api.summary(); store.get().user.balance=sum.balance; }catch(e){}
  const sales=store.get().txns.filter(t=>t.dir==='in').slice(0,6);
  const salesRows = sales.length? sales.map(t=>`<div class="row">${avatar(t.party,'#1fb87a')}
      <div class="m"><div class="n">${t.party}</div><div class="s">${timeAgo(t.ts)}${t.kind==='payment'?' · sale':''}</div></div>
      <div class="amt pos">+${SYM}${store.fmt(t.amount)}</div></div>`).join('')
    : `<div class="row" style="cursor:default"><div class="m"><div class="s">No sales yet. Tap Request payment to charge a customer.</div></div></div>`;
  screen(`
    <div class="hero" style="background:radial-gradient(140% 120% at 85% -10%,rgba(255,194,75,.5),transparent 55%),radial-gradient(120% 120% at 0% 120%,rgba(124,92,255,.3),transparent 50%),linear-gradient(125deg,var(--ocean),var(--ocean-2) 40%,var(--coral) 110%)">
      <div class="label">${u.businessName||'Business'} · balance</div>
      <div class="bal tnum"><small>${SYM}</small><span id="balnum">${store.fmt(sum.balance)}</span></div>
      <div class="sub"><span class="dot"></span> ${u.category||'Merchant'} · Sand Dollar</div>
    </div>
    <div class="statgrid">
      <div class="stat"><div class="sv tnum">${SYM}${store.fmt(sum.netInToday)}</div><div class="sl">Today (net)</div></div>
      <div class="stat"><div class="sv tnum">${sum.countInToday}</div><div class="sl">Sales today</div></div>
      <div class="stat"><div class="sv tnum">${SYM}${store.fmt(sum.feesToday)}</div><div class="sl">Fees today</div></div>
    </div>
    <div class="quick" style="grid-template-columns:repeat(2,1fr)">
      <div class="qa" data-act="charge"><div class="ic">${icon('plus')}</div><div class="t">Request payment</div></div>
      <div class="qa" data-act="mcashout"><div class="ic">${icon('receive')}</div><div class="t">Cash out</div></div>
    </div>
    <div class="sec"><h3>Recent sales</h3><span class="link" data-tab="activity">See all</span></div>
    <div class="card">${salesRows}</div>
    <p class="note">Merchant account · 1% per sale (max B$5), settled instantly to your Sand Dollar wallet.</p>
  `);
  app().querySelector('[data-act="charge"]').onclick=()=>chargeFlow();
  app().querySelector('[data-act="mcashout"]').onclick=()=>cashOut();
  app().querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{tab=n.dataset.tab;render();});
  countUp($('#balnum'), sum.balance);
}

// ---------- all-services list (replaces the old "coming soon") ----------
function moreMinis(){
  const s=store.get();
  openSheet(`<h2>All services</h2><p class="lead">Pay any biller</p>
    <div style="max-height:55vh;overflow:auto">${s.billers.map(b=>`<div class="row" data-bill="${b.id}|${encodeURIComponent(b.name)}">
      <div class="av" style="background:${b.color}">${b.emoji||'🧾'}</div><div class="m"><div class="n">${b.name}</div></div>
      <div class="chev">${icon('chev')}</div></div>`).join('')}</div>`);
  document.querySelectorAll('[data-bill]').forEach(n=>n.onclick=()=>{const[id,nm]=n.dataset.bill.split('|');payBiller(id,decodeURIComponent(nm));});
}
function payBiller(billerId,name){
  amountEntry(`Pay ${name}`,'Enter amount due','Pay',async(cents)=>{
    await doMoney(()=>api.bill({billerId,amountCents:cents,idempotencyKey:newKey()}),'Paid',`${SYM}${store.fmt(cents)} to ${name}`);
  },{feeKind:'bill'});
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
function closeSheet(){ stopCam(); document.querySelectorAll('.sheet-bg').forEach(n=>n.remove()); }
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
  const data={role:'personal',name:'',business:'',category:'Food',phone:'',dob:'',idNumber:'',pin:''};
  const CATS=['Food','Grocery','Retail','Transit','Health','Services','Other'];
  const grab=()=>{
    if($('#i_name')) data.name=$('#i_name').value.trim();
    if($('#i_biz')) data.business=$('#i_biz').value.trim();
    if($('#i_cat')) data.category=$('#i_cat').value;
    if($('#i_phone')) data.phone=$('#i_phone').value.trim();
    if($('#i_dob')) data.dob=$('#i_dob').value.trim();
    if($('#i_id')) data.idNumber=$('#i_id').value.trim();
    if($('#i_pin')) data.pin=$('#i_pin').value.trim();
  };
  const draw=()=>{
    if(step===0){
      const seg=(r,l)=>`<div class="segbtn ${data.role===r?'on':''}" data-role="${r}">${l}</div>`;
      body.innerHTML=`<div class="seg">${seg('personal','Personal')}${seg('business','Business')}</div>
        ${data.role==='business'?`
          <div class="field"><label>Business name</label><input id="i_biz" placeholder="e.g. Goldie's Conch Shack" value="${data.business}"></div>
          <div class="field"><label>Category</label><select id="i_cat">${CATS.map(c=>`<option ${data.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Owner name</label><input id="i_name" placeholder="e.g. Andre Smith" value="${data.name}"></div>`
        :`<div class="field"><label>Your name</label><input id="i_name" placeholder="e.g. Andre Smith" value="${data.name}"></div>`}
        <div class="field"><label>Phone number</label><input id="i_phone" inputmode="tel" placeholder="(242) 000-0000" value="${data.phone}"></div>`;
      next.textContent='Continue';
      body.querySelectorAll('[data-role]').forEach(n=>n.onclick=()=>{ grab(); data.role=n.dataset.role; draw(); });}
    else if(step===1){body.innerHTML=`
      <div class="center" style="padding:4px 18px 2px"><div style="font-size:40px">🪪</div>
        <h2 style="margin:6px 0 2px">Identity (KYC)</h2>
        <p class="muted" style="font-size:12.5px">Required by the Central Bank. Stored securely; full verification against NIB/passport happens with our KYC partner before higher limits.</p></div>
      <div class="field"><label>Date of birth</label><input id="i_dob" type="date" value="${data.dob}"></div>
      <div class="field"><label>NIB / passport number</label><input id="i_id" placeholder="e.g. 123456789" value="${data.idNumber}"></div>
      <div class="tier">🔒 ${data.role==='business'?'Business · hold B$10k · B$5k/day':'Tier 1 · hold B$500 · send B$300/day'}</div>`;
      next.textContent='Continue';}
    else{body.innerHTML=`
      <div class="field"><label>Set a 4-digit PIN</label><input id="i_pin" inputmode="numeric" maxlength="4" placeholder="••••"></div>
      <p class="note">Protects your wallet. Hashed with scrypt on the server — never stored in plain text.</p>`;
      next.textContent=data.role==='business'?'Create business wallet':'Create my wallet';}
  };
  draw();
  next.onclick=async()=>{
    grab();
    if(step===0){
      if(data.role==='business' && !data.business) return shakeBtn(next,'Enter business name');
      if(!data.name) return shakeBtn(next,'Enter your name');
      if(!data.phone) return shakeBtn(next,'Enter phone number');
      step=1;draw();
    } else if(step===1){
      if(!data.dob) return shakeBtn(next,'Enter date of birth');
      if(!data.idNumber) return shakeBtn(next,'Enter ID number');
      step=2;draw();
    } else {
      if(!/^\d{4}$/.test(data.pin)) return shakeBtn(next,'Enter 4 digits');
      next.disabled=true; next.textContent='Creating…';
      try{
        const r=await api.register(data); setToken(r.token);
        await store.loadAll(); tab='home'; render();
      }catch(e){ next.disabled=false; shakeBtn(next, e.code==='phone_taken'?'Phone already registered':(e.message||'Try again')); }
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
      <div class="m"><div class="n">${t.party}</div><div class="s">${timeAgo(t.ts)}${t.memo?' · '+t.memo:''}${t.fee?' · fee '+SYM+store.fmt(t.fee):''}</div></div>
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
  if(id==='more') return moreMinis();
  const billerId=MINI_MAP[id]; const s=store.get();
  const biller=s.billers.find(b=>b.id===billerId)||{name:'Bill'};
  amountEntry(`Pay ${biller.name}`, id==='topup'?'Aliv / BTC prepaid credit':'Enter amount due', 'Pay', async(cents)=>{
    await doMoney(()=>api.bill({billerId, amountCents:cents, idempotencyKey:newKey()}),
      'Paid', `${SYM}${store.fmt(cents)} to ${biller.name}`);
  },{feeKind:'bill'});
}

// ============================================================
//  ACTIVITY / ME
// ============================================================
function renderActivity(){
  const s=store.get();
  screen(`<div class="sec" style="margin-top:18px"><h3>All activity</h3>
      <span class="muted" style="margin-left:auto;font-size:12px">${s.txns.length} transactions</span></div>
    <div class="card">${s.txns.length? s.txns.map(t=>`<div class="row">${avatar(t.party,t.dir==='in'?'#1fb87a':'#06384f')}
      <div class="m"><div class="n">${t.party}</div><div class="s">${new Date(t.ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${t.fee?' · fee '+SYM+store.fmt(t.fee):''}</div></div>
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
      <div class="row" data-kyc><div class="av" style="background:#16a7c9">🪪</div><div class="m"><div class="n">Identity verification</div><div class="s">${kycLabel(u)}</div></div>${(u.kycTier>=2||u.kycStatus==='verified_full')?'<span class="badge">Tier 2</span>':`<div class="chev">${icon('chev')}</div>`}</div>
      <div class="row" style="cursor:default"><div class="av" style="background:#2fd9c5">🏦</div><div class="m"><div class="n">Sand Dollar account</div><div class="s">${u.railAccountId||'—'}</div></div></div>
      <div class="row" data-cashout><div class="av" style="background:#f5b53d">🏧</div><div class="m"><div class="n">Cash out</div><div class="s">Withdraw to Sand Dollar</div></div><div class="chev">${icon('chev')}</div></div>
    </div>
    <div class="pad"><button class="btn ghost" id="logout">Log out</button></div>
    <p class="note">Caribe · real backend, real ledger. Balances live in SQLite on the server, not on this device.</p>`);
  $('#logout').onclick=()=>{clearToken();store.clear();tab='home';render();};
  const co=app().querySelector('[data-cashout]'); if(co) co.onclick=()=>cashOut();
  const kc=app().querySelector('[data-kyc]'); if(kc) kc.onclick=()=>kycUpload();
}
function kycLabel(u){
  if(u.kycStatus==='pending_review') return 'Under review · documents submitted';
  if(u.kycStatus==='rejected') return 'Rejected · tap to re-submit';
  if(u.kycStatus==='verified_full'||u.kycTier>=2) return 'Verified · higher limits active';
  return 'Tier 1 · tap to raise limits';
}
function kycUpload(){
  const u=store.get().user;
  if(u.kycTier>=2||u.kycStatus==='verified_full') return toast('You are fully verified — Tier 2 limits are active.');
  if(u.kycStatus==='pending_review') return toast('Your documents are under review. We\'ll notify you once approved.');
  const bg=openSheet(`<h2>Raise your limits</h2><p class="lead">Upload a photo of your NIB card or passport to unlock Tier 2 (hold B$10k · send B$5k/day).</p>
    <input type="file" id="kycfile" accept="image/*" style="display:none">
    <button class="btn ghost" id="pick">Choose ID photo</button>
    <div id="kycprev" class="center" style="margin-top:12px"></div>
    <button class="btn" id="kycsend" style="margin-top:12px;display:none">Submit for review</button>
    <p class="note">Stored securely on the server. A reviewer (or our KYC partner) verifies it against the national registry before Tier 2 is granted.</p>`);
  let dataUrl=null;
  $('#pick',bg).onclick=()=>$('#kycfile',bg).click();
  $('#kycfile',bg).onchange=(e)=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ dataUrl=rd.result; $('#kycprev',bg).innerHTML=`<img src="${dataUrl}" style="max-width:100%;max-height:200px;border-radius:12px;border:1px solid var(--line)">`; $('#kycsend',bg).style.display='block'; };
    rd.readAsDataURL(f);
  };
  $('#kycsend',bg).onclick=async()=>{
    if(!dataUrl) return;
    const b=$('#kycsend',bg); b.disabled=true; b.textContent='Submitting…';
    try{ await api.kycDocument({imageBase64:dataUrl}); await store.refresh(); closeSheet();
      successSheet('Submitted for review','Your ID is in. We\'ll raise you to Tier 2 once it\'s approved.'); }
    catch(err){ b.disabled=false; b.textContent=err.message||'Try again'; }
  };
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
    <div class="feeline" id="feeline">&nbsp;</div>
    ${opts.envelope?`<label class="center" style="display:flex;gap:8px;justify-content:center;align-items:center;font-size:13px;color:var(--muted);margin:4px 0 8px">
      <input type="checkbox" id="env"> 🧧 Send as a gift envelope</label>`:''}
    <div class="field" style="margin-top:0"><input id="memo" placeholder="${opts.memoPh||'Add a note (optional)'}"></div>
    <div class="keys">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k=>`<div class="key" data-k="${k}">${k}</div>`).join('')}</div>
    <button class="btn ${opts.coral?'coral':''}" id="go" disabled>${cta}</button>`);
  const go=$('#go',bg), amt=$('#amt',bg);
  const updFee=()=>{
    if(!opts.feeKind) return; const el=$('#feeline',bg); if(!el) return;
    if(cents<=0){ el.innerHTML='&nbsp;'; return; }
    const f=clientFee(opts.feeKind,cents);
    if(f.cents<=0){ el.textContent='No fee'; return; }
    el.innerHTML = f.payer==='recipient'
      ? `Caribe fee ${SYM}${store.fmt(f.cents)} · they receive ${SYM}${store.fmt(Math.max(0,cents-f.cents))}`
      : `Caribe fee ${SYM}${store.fmt(f.cents)} · total ${SYM}${store.fmt(cents+f.cents)}`;
  };
  bg.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;
    if(k==='⌫')cents=Math.floor(cents/10); else if(k==='.'){} else cents=cents*10+parseInt(k,10);
    if(cents>99999999)cents=99999999; amt.textContent=store.fmt(cents); go.disabled=cents<=0; updFee();
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
  },{envelope:true,memoPh:'lunch, rent, happy birthday…',feeKind:'transfer'});
}
function payMerchant(mId){
  const m=store.get().merchants.find(x=>x.id===mId); if(!m)return;
  amountEntry(`Pay ${m.name}`,`${m.category||''} · Sand Dollar`,'Pay now',async(cents,memo)=>{
    await doMoney(()=>api.pay({toId:mId,amountCents:cents,memo,idempotencyKey:newKey()}),
      'Paid',`${SYM}${store.fmt(cents)} to ${m.name}`);
  },{feeKind:'payment'});
}
function scan(){
  openSheet(`<h2>Scan to pay</h2><p class="lead">Point your camera at a Caribe QR code</p>
    <div class="scanwrap"><video id="cam" playsinline muted></video><div class="scanframe"></div></div>
    <div id="scanmsg" class="feeline">&nbsp;</div>
    <button class="btn ghost" id="scanalt">Pay a saved payee instead</button>`);
  $('#scanalt').onclick=()=>{ stopCam(); scanFallback(); };
  startCam();
}
function receive(){
  const u=store.get().user||{};
  const uri=buildPayURI({id:u.accountId,name:u.businessName||u.name,kind:u.accountKind||'user'});
  openSheet(`<div class="center"><h2>Receive money</h2><p class="lead">Show this Caribe QR to get paid</p>
    <div class="qrbox">${qrSvg(uri)}</div>
    <div style="font-weight:800;font-size:18px;margin-top:14px">${u.businessName||u.name||'You'}</div>
    <div class="muted">${u.handle||''} · ${u.phone||''}</div>
    <button class="btn ghost" style="margin-top:16px" id="cls">Close</button></div>`);
  $('#cls').onclick=closeSheet;
}
function cashIn(){
  amountEntry('Cash in','Top up from your bank / agent','Add money',async(cents)=>{
    await doMoney(()=>api.cashin({amountCents:cents,idempotencyKey:newKey()}),
      'Topped up',`${SYM}${store.fmt(cents)} added to your wallet`);
  },{feeKind:'cashin'});
}
function cashOut(){
  amountEntry('Cash out','Withdraw to Sand Dollar','Withdraw',async(cents)=>{
    await doMoney(()=>api.cashout({amountCents:cents,idempotencyKey:newKey()}),
      'Withdrawn',`${SYM}${store.fmt(cents)} sent to your Sand Dollar account`);
  },{feeKind:'cashout'});
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
  const merchant=store.get().user?.accountKind==='merchant';
  const t=(id,ic,label)=>`<div class="tab ${tab===id?'active':''}" data-go="${id}"><span class="ic">${icon(ic)}</span>${label}</div>`;
  if(merchant){
    return `<div class="nav">${t('home','wallet','Home')}${t('activity','receipt','Sales')}
      <div class="scanbtn" data-charge="1"><div class="b">${icon('plus')}</div></div>
      ${t('me','user','Me')}<div class="tab" style="visibility:hidden"><span class="ic">${icon('user')}</span>·</div></div>`;
  }
  return `<div class="nav">${t('home','wallet','Wallet')}${t('discover','compass','Discover')}
    <div class="scanbtn" data-scan="1"><div class="b">${icon('scan')}</div></div>
    ${t('activity','receipt','Activity')}${t('me','user','Me')}</div>`;
}
function bindNav(){
  app().querySelectorAll('[data-go]').forEach(n=>n.onclick=()=>{tab=n.dataset.go;render();});
  const sc=app().querySelector('[data-scan]'); if(sc) sc.onclick=()=>scan();
  const ch=app().querySelector('[data-charge]'); if(ch) ch.onclick=()=>chargeFlow();
}

export async function render(){
  if(!isLoggedIn()) return renderAuth();
  if(!store.get().user){
    try{ await store.loadAll(); }
    catch(e){ clearToken(); return renderAuth(); }
  }
  const merchant=store.get().user.accountKind==='merchant';
  if(merchant){
    if(tab==='activity') return renderActivity();
    if(tab==='me') return renderMe();
    return renderMerchantHome();
  }
  if(tab==='discover') return renderDiscover();
  if(tab==='activity') return renderActivity();
  if(tab==='me') return renderMe();
  return renderHome();
}
