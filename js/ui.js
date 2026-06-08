// ui.js — all screens + interactions, backed by the real Caribe API.
import { api, isLoggedIn, setToken, clearToken, newKey, chatStreamUrl } from './api.js';
import * as store from './store.js';

const $ = (sel, r=document) => r.querySelector(sel);
const app = () => document.getElementById('app');
let SYM = 'B$';   // set per logged-in user's currency in render()

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
  chat:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.3A8 8 0 1 1 21 12Z"/></svg>`,
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
// currency + FX helpers (mirror server) for cross-island previews
function curInfo(cur){ return (store.get().islands||[]).find(i=>i.currency===cur); }
function symFor(cur){ return curInfo(cur)?.symbol || (cur+' '); }
function usdPerCur(cur){ const i=curInfo(cur); return i?i.usdPer:null; }
function fxPreview(srcCur,dstCur,cents){
  const a=usdPerCur(srcCur), b=usdPerCur(dstCur);
  if(a==null||b==null||cents<=0) return null;
  const mid=Math.round(cents*(b/a));
  const spread=Math.floor(mid*(store.get().fxSpreadBps||150)/10000);
  return {dst:mid-spread, mid, spread, rate:b/a};
}

// ---------- real QR + pay-link ----------
function qrSvg(text){
  try{ const qr=window.qrcode(0,'M'); qr.addData(text); qr.make(); return qr.createSvgTag({cellSize:6,margin:1,scalable:true}); }
  catch(e){ console.error('qr',e); return '<div class="muted">QR unavailable</div>'; }
}
function buildPayURI({id,name,kind,amt,cur}){
  let u=`caribe:pay?to=${encodeURIComponent(id)}&n=${encodeURIComponent(name||'')}&k=${kind||'user'}`;
  if(cur) u+=`&c=${cur}`;
  if(amt) u+=`&amt=${amt}`; return u;
}
function parsePayURI(str){
  if(!str||typeof str!=='string'||!str.startsWith('caribe:')) return null;
  try{ const q=new URLSearchParams(str.split('?')[1]||''); const to=q.get('to'); if(!to) return null;
    return {id:to,name:q.get('n')||'Payee',kind:q.get('k')||'user',cur:q.get('c')||null,amt:q.get('amt')?parseInt(q.get('amt'),10):0};
  }catch(e){ return null; }
}
function payFromPayload(p){
  if(!p||!p.id) return toast('That QR code is not a Caribe payment code.');
  const me=store.get().user;
  if(me && p.id===me.accountId) return toast("That's your own code.");
  payToAccount(p.id,p.name,p.kind,p.amt,p.cur);
}
function payToAccount(toId,name,kind,presetCents,dstCur){
  const isM=kind==='merchant'; const me=store.get().user;
  dstCur=dstCur||me.currency; const xb=dstCur!==me.currency;
  const run=async(cents,memo)=>{
    const call=isM?()=>api.pay({toId,amountCents:cents,memo,idempotencyKey:newKey()})
                  :()=>api.transfer({toId,amountCents:cents,memo,idempotencyKey:newKey()});
    await doMoney(call, isM?'Paid':'Sent',
      (res)=> res.crossBorder
        ? `${SYM}${store.fmt(cents)} → ${symFor(res.dstCurrency)}${store.fmt(res.dstAmount)} to ${name}`
        : `${SYM}${store.fmt(cents)} to ${name}`);
  };
  if(presetCents>0) return confirmPay(isM?`Pay ${name}`:`Send to ${name}`, name, presetCents, isM?'payment':'transfer', run, xb?{srcCur:me.currency,dstCur}:null);
  amountEntry(isM?`Pay ${name}`:`Send to ${name}`, xb?`${dstCur} · cross-island`:'Sand Dollar', isM?'Pay now':'Send',
    (cents,memo)=>run(cents,memo), {feeKind:isM?'payment':'transfer', fx:xb?{srcCur:me.currency,dstCur}:null});
}
function confirmPay(title,name,cents,feeKind,run,fx){
  let line;
  if(fx && fx.srcCur!==fx.dstCur){
    const p=fxPreview(fx.srcCur,fx.dstCur,cents);
    line = p? `<div class="feeline">They get <b>${symFor(fx.dstCur)}${store.fmt(p.dst)}</b> · 1 ${fx.srcCur} = ${p.rate.toFixed(2)} ${fx.dstCur}</div>`:'<div class="feeline">&nbsp;</div>';
  } else {
    const f=clientFee(feeKind,cents);
    line=f.cents>0?(f.payer==='recipient'
      ? `<div class="feeline">Caribe fee ${SYM}${store.fmt(f.cents)} · they receive ${SYM}${store.fmt(cents-f.cents)}</div>`
      : `<div class="feeline">Caribe fee ${SYM}${store.fmt(f.cents)} · total ${SYM}${store.fmt(cents+f.cents)}</div>`):'<div class="feeline">No fee</div>';
  }
  const bg=openSheet(`<h2>${title}</h2><p class="lead">${name}</p>
    <div class="amount-big"><small>${SYM}</small>${store.fmt(cents)}</div>${line}
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
    const uri=buildPayURI({id:u.accountId,name:u.businessName||u.name,kind:'merchant',amt:cents,cur:u.currency});
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
let REG_ISLANDS = null;   // islands cache for the signup picker

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
       <button class="btn ghost" id="obdemo" style="margin-top:10px">▶  Try the live demo</button>
       <p class="note">Already have a wallet? <a id="toLogin" style="color:var(--sea);font-weight:700">Log in</a><br>
       Bahamas · Sand Dollar (B$1 = US$1).</p></div>
   </div>`;
  $('#toLogin').onclick=()=>{authMode='login';render();};
  $('#obdemo').onclick=()=>runDemo($('#obdemo'));
  let step=0; const body=$('#obbody'), next=$('#obnext');
  const data={role:'personal',name:'',business:'',category:'Food',phone:'',dob:'',idNumber:'',pin:'',island:'BS'};
  const CATS=['Food','Grocery','Retail','Transit','Health','Services','Other'];
  if(REG_ISLANDS===null){ api.islands().then(r=>{ REG_ISLANDS=r.islands.filter(i=>i.live); if(step===0) draw(); }).catch(()=>{REG_ISLANDS=[];}); }
  const grab=()=>{
    if($('#i_name')) data.name=$('#i_name').value.trim();
    if($('#i_biz')) data.business=$('#i_biz').value.trim();
    if($('#i_cat')) data.category=$('#i_cat').value;
    if($('#i_phone')) data.phone=$('#i_phone').value.trim();
    if($('#i_island')) data.island=$('#i_island').value;
    if($('#i_dob')) data.dob=$('#i_dob').value.trim();
    if($('#i_id')) data.idNumber=$('#i_id').value.trim();
    if($('#i_pin')) data.pin=$('#i_pin').value.trim();
  };
  const islandOpts=()=>{ const list=REG_ISLANDS&&REG_ISLANDS.length?REG_ISLANDS:[{code:'BS',name:'The Bahamas',currency:'BSD'}];
    return list.map(i=>`<option value="${i.code}" ${data.island===i.code?'selected':''}>${i.name} (${i.currency})</option>`).join(''); };
  const draw=()=>{
    if(step===0){
      const seg=(r,l)=>`<div class="segbtn ${data.role===r?'on':''}" data-role="${r}">${l}</div>`;
      body.innerHTML=`<div class="seg">${seg('personal','Personal')}${seg('business','Business')}</div>
        <div class="field"><label>Your island</label><select id="i_island">${islandOpts()}</select></div>
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
       <button class="btn ghost" id="logindemo" style="margin-top:10px">▶  Try the live demo</button>
       <p class="note">New here? <a id="toReg" style="color:var(--sea);font-weight:700">Create a wallet</a></p></div>
   </div>`;
  $('#toReg').onclick=()=>{authMode='register';render();};
  $('#logindemo').onclick=()=>runDemo($('#logindemo'));
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
      <div class="label">${s.user.currency} balance</div>
      <div class="bal tnum"><small>${SYM}</small><span id="balnum">${store.fmt(store.balance())}</span></div>
      <div class="sub"><span class="dot"></span> ${s.user.islandName} · instant &amp; free</div>
    </div>
    <div class="quick">
      <div class="qa" data-act="send"><div class="ic">${icon('send')}</div><div class="t">Send</div></div>
      <div class="qa" data-act="receive"><div class="ic">${icon('receive')}</div><div class="t">Receive</div></div>
      <div class="qa" data-act="scan"><div class="ic">${icon('scan')}</div><div class="t">Scan &amp; Pay</div></div>
      <div class="qa" data-act="cashin"><div class="ic">${icon('plus')}</div><div class="t">Cash in</div></div>
    </div>
    <div class="card" data-ask style="margin:14px 18px 0"><div class="row">
      <div class="av" style="background:linear-gradient(135deg,var(--violet),var(--sea))">✨</div>
      <div class="m"><div class="n">Ask Caribe</div><div class="s">Send money or check spending, just by asking</div></div>
      <div class="chev">${icon('chev')}</div></div></div>
    <div class="card" data-reqsplit style="margin:10px 18px 0"><div class="row">
      <div class="av" style="background:var(--gold)">🧾</div>
      <div class="m"><div class="n">Request or split</div><div class="s">Ask to be paid back, or split a bill</div></div>
      <div class="chev">${icon('chev')}</div></div></div>
    <div id="reqslot"></div>
    <div class="sec"><h3>People</h3><span class="muted" style="margin-left:auto;font-size:12px">tap to send</span></div>
    <div class="card">${
      s.contacts.length? s.contacts.map(c=>`<div class="row" data-send="${c.id}">${avatar(c.name,c.color)}
        <div class="m"><div class="n">${c.name}</div><div class="s">${(c.currency&&c.currency!==s.user.currency)?'🌎 '+c.island+' · '+c.currency:(c.handle||'')}</div></div>
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
  const ask=app().querySelector('[data-ask]'); if(ask) ask.onclick=()=>askCaribe();
  const rs=app().querySelector('[data-reqsplit]'); if(rs) rs.onclick=()=>requestOrSplit();
  loadHomeRequests();
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
    <div class="sec" style="margin-top:18px"><h3>Discover</h3></div>
    <div class="card">
      <div class="row" data-moments><div class="av" style="background:linear-gradient(135deg,var(--coral),var(--gold))">🌅</div>
        <div class="m"><div class="n">Moments</div><div class="s">See what's happening across the islands</div></div>
        <div class="chev">${icon('chev')}</div></div>
      <div class="row" data-sousou><div class="av" style="background:linear-gradient(135deg,var(--violet),var(--sea))">💞</div>
        <div class="m"><div class="n">Sou-Sou</div><div class="s">Save together — the partner-hand, digitized</div></div>
        <div class="chev">${icon('chev')}</div></div>
      <div class="row" data-services><div class="av" style="background:linear-gradient(135deg,var(--coral),var(--gold))">🍔</div>
        <div class="m"><div class="n">Order anything</div><div class="s">Food · taxi · groceries · services</div></div>
        <div class="chev">${icon('chev')}</div></div></div>
    <div class="sec"><h3>Mini-apps</h3><span class="badge">platform</span></div>
    <div class="grid">${MINIS.map(m=>`<div class="mini" data-mini="${m.id}"><div class="ic">${m.ic}</div><div class="t">${m.t}</div></div>`).join('')}</div>
    <div class="sec"><h3>Shops</h3><span class="muted" style="margin-left:auto;font-size:12px">tap to browse</span></div>
    <div class="card">${s.merchants.map(m=>`<div class="row" data-store="${m.id}|${encodeURIComponent(m.name)}|${encodeURIComponent(m.category||'')}">
      <div class="av" style="background:${m.color}">${m.emoji||'🏬'}</div>
      <div class="m"><div class="n">${m.name}</div><div class="s">${m.category||''} · storefront</div></div>
      <div class="badge pay">Shop ›</div></div>`).join('')}</div>
    <div class="sec"><h3>Caribbean network</h3><span class="badge">${s.islands.filter(i=>i.live).length} islands</span></div>
    <div class="card net-card">${s.islands.map(i=>`<div class="row" style="cursor:default">
      <div class="av" style="background:${i.live?'linear-gradient(135deg,var(--sea),var(--aqua))':'#9fb4bf'};font-size:12px">${i.symbol}</div>
      <div class="m"><div class="n">${i.name}</div><div class="s">${i.currency} · ${i.live?'live':'coming soon'}</div></div>
      ${i.code===s.user.island?'<span class="badge">You</span>':(i.live?'<span class="dot" style="background:var(--ok)"></span>':'')}</div>`).join('')}</div>
    <p class="note">One app, every island. Send money home across the Caribbean — Caribe converts the
      currency and settles instantly. The rail nobody owns yet.</p>`);
  app().querySelectorAll('[data-mini]').forEach(n=>n.onclick=()=>runMini(n.dataset.mini));
  app().querySelectorAll('[data-store]').forEach(n=>n.onclick=()=>{ const [id,nm,cat]=n.dataset.store.split('|'); storeMerchant={id,name:decodeURIComponent(nm),category:decodeURIComponent(cat)}; tab='store'; render(); });
  const mo=app().querySelector('[data-moments]'); if(mo) mo.onclick=()=>{ tab='moments'; render(); };
  const so=app().querySelector('[data-sousou]'); if(so) so.onclick=()=>{ tab='sousou'; render(); };
  const sv=app().querySelector('[data-services]'); if(sv) sv.onclick=()=>{ tab='services'; render(); };
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
      <div class="row" data-insights><div class="av" style="background:#1296c4">📊</div><div class="m"><div class="n">Spending insights</div><div class="s">Where your money goes</div></div><div class="chev">${icon('chev')}</div></div>
      <div class="row" data-reserve><div class="av" style="background:#1fb87a">🛡️</div><div class="m"><div class="n">Money safety</div><div class="s">Proof your funds are 100% backed</div></div><div class="chev">${icon('chev')}</div></div>
      <div class="row" data-ask2><div class="av" style="background:linear-gradient(135deg,var(--violet),var(--sea))">✨</div><div class="m"><div class="n">Ask Caribe</div><div class="s">Your money assistant</div></div><div class="chev">${icon('chev')}</div></div>
      <div class="row" data-tutorial><div class="av" style="background:#7c5cff">🎓</div><div class="m"><div class="n">Replay tutorial</div><div class="s">A quick tour of how Caribe works</div></div><div class="chev">${icon('chev')}</div></div>
    </div>
    <div class="pad"><button class="btn ghost" id="logout">Log out</button></div>
    <p class="note">Caribe · real backend, real ledger. Balances live in SQLite on the server, not on this device.</p>`);
  $('#logout').onclick=()=>{teardown();disconnectStream();clearToken();store.clear();openConv=null;tab='home';render();};
  const co=app().querySelector('[data-cashout]'); if(co) co.onclick=()=>cashOut();
  const kc=app().querySelector('[data-kyc]'); if(kc) kc.onclick=()=>kycUpload();
  const tt=app().querySelector('[data-tutorial]'); if(tt) tt.onclick=()=>startTutorial();
  const ins=app().querySelector('[data-insights]'); if(ins) ins.onclick=()=>{tab='insights';render();};
  const rsv=app().querySelector('[data-reserve]'); if(rsv) rsv.onclick=()=>{tab='reserve';render();};
  const a2=app().querySelector('[data-ask2]'); if(a2) a2.onclick=()=>askCaribe();
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
    const el=$('#feeline',bg); if(!el) return;
    if(cents<=0){ el.innerHTML='&nbsp;'; return; }
    if(opts.fx && opts.fx.srcCur!==opts.fx.dstCur){
      const p=fxPreview(opts.fx.srcCur,opts.fx.dstCur,cents);
      if(p){ el.innerHTML=`They get <b>${symFor(opts.fx.dstCur)}${store.fmt(p.dst)}</b> · 1 ${opts.fx.srcCur} = ${p.rate.toFixed(2)} ${opts.fx.dstCur}`; return; }
    }
    if(!opts.feeKind){ el.innerHTML='&nbsp;'; return; }
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
  try{ const res=await call(); await store.refresh();
    successSheet(title, typeof sub==='function'? sub(res||{}) : sub); }
  catch(e){ if(go) shake('go', e.message||'Try again'); }
}

function sendTo(contactId){
  const c=store.get().contacts.find(x=>x.id===contactId); if(!c)return;
  const me=store.get().user; const dstCur=c.currency||me.currency; const xb=dstCur!==me.currency;
  amountEntry(`Send to ${c.name}`, xb?`${c.island||''} · ${dstCur}`:(c.handle||''), 'Send',async(cents,memo,env)=>{
    await doMoney(()=>api.transfer({toId:contactId,amountCents:cents,memo,envelope:!!env,idempotencyKey:newKey()}),
      env?'🧧 Envelope sent!':'Sent',
      (res)=> res.crossBorder
        ? `${SYM}${store.fmt(cents)} → ${symFor(res.dstCurrency)}${store.fmt(res.dstAmount)} to ${c.name}`
        : `${SYM}${store.fmt(cents)} to ${c.name}${memo?` · "${memo}"`:''}`);
  },{envelope:!xb,memoPh:'lunch, rent, happy birthday…',feeKind:'transfer',fx:{srcCur:me.currency,dstCur}});
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
  const uri=buildPayURI({id:u.accountId,name:u.businessName||u.name,kind:u.accountKind||'user',cur:u.currency});
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
    return `<div class="nav">${t('home','wallet','Home')}${t('chats','chat','Chats')}
      <div class="scanbtn" data-charge="1"><div class="b">${icon('plus')}</div></div>
      ${t('activity','receipt','Sales')}${t('me','user','Me')}</div>`;
  }
  return `<div class="nav">${t('chats','chat','Chats')}${t('home','wallet','Wallet')}
    <div class="scanbtn" data-scan="1"><div class="b">${icon('scan')}</div></div>
    ${t('discover','compass','Discover')}${t('me','user','Me')}</div>`;
}
function bindNav(){
  app().querySelectorAll('[data-go]').forEach(n=>n.onclick=()=>{ openConv=null; tab=n.dataset.go; render(); });
  const sc=app().querySelector('[data-scan]'); if(sc) sc.onclick=()=>scan();
  const ch=app().querySelector('[data-charge]'); if(ch) ch.onclick=()=>chargeFlow();
}

// ---------- demo mode + guided tutorial ----------
function runDemo(btn){
  if(btn){ btn.disabled=true; btn.textContent='Setting up demo…'; }
  api.demo().then(async r=>{
    setToken(r.token); await store.loadAll(); tab='home'; await render(); startTutorial();
  }).catch(e=>{ if(btn){btn.disabled=false;btn.textContent='Try the live demo';} toast('Demo unavailable: '+(e.message||'error')); });
}

const TUTORIAL_STEPS=[
  {sel:'.hero', title:'Your wallet', text:'Your real Sand Dollar balance, on a real double-entry ledger. Every cent is backed.'},
  {sel:'[data-act="send"]', title:'Send anywhere', text:'Send to anyone in the Caribbean. Different island? Caribe converts the currency live and settles instantly.'},
  {sel:'.scanbtn', title:'Scan & Pay', text:'Tap to scan a shop’s QR code and pay in one tap — like WeChat, for the islands.'},
  {sel:'[data-act="cashin"]', title:'Cash in & out', text:'Top up from your bank or an agent, and cash out anytime.'},
  {tab:'discover', sel:'.net-card', title:'Every island, one app', text:'Pay bills, top up phones, shop, and reach all 26 islands on the network — money flows across the whole Caribbean.'},
  {final:true, title:'That’s Caribe 🌊', text:'One app for the islands: pay, send, bills, shops, and money across every Caribbean island. Explore freely — this is a live demo wallet.'},
];
function startTutorial(){
  let i=0;
  const ov=document.createElement('div'); ov.id='coach'; document.body.appendChild(ov);
  const end=()=>{ ov.remove(); tab='home'; render(); };
  async function show(){
    const s=TUTORIAL_STEPS[i];
    if(s.tab && tab!==s.tab){ tab=s.tab; await render(); }
    await new Promise(r=>requestAnimationFrame(r));
    if(s.final){
      ov.innerHTML=`<div class="coach-overlay"></div>
        <div class="coach-tip center" style="left:50%;top:50%;transform:translate(-50%,-50%)">
          <div style="font-size:34px">🌊</div><h2 style="margin:6px 0 6px">${s.title}</h2>
          <p style="margin:0 0 14px;font-size:14px;color:var(--ink-2)">${s.text}</p>
          <button class="btn" id="ctDone">Start exploring</button></div>`;
      ov.querySelector('#ctDone').onclick=end; return;
    }
    const el=document.querySelector(s.sel);
    if(!el){ i++; return i<TUTORIAL_STEPS.length?show():end(); }
    el.scrollIntoView({block:'center',behavior:'instant'});
    await new Promise(r=>requestAnimationFrame(r));
    const rct=el.getBoundingClientRect(), pad=8;
    const below = rct.top < window.innerHeight*0.55;
    ov.innerHTML=`<div class="spot" style="left:${rct.left-pad}px;top:${rct.top-pad}px;width:${rct.width+pad*2}px;height:${rct.height+pad*2}px"></div>
      <div class="coach-tip" style="${below?`top:${rct.bottom+16}px`:`bottom:${window.innerHeight-rct.top+16}px`}">
        <div class="muted" style="font-size:11px;font-weight:600">Step ${i+1} of ${TUTORIAL_STEPS.length}</div>
        <h3 style="margin:4px 0 6px">${s.title}</h3>
        <p style="margin:0 0 14px;font-size:14px;color:var(--ink-2)">${s.text}</p>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" id="ctSkip" style="flex:1">Skip</button>
          <button class="btn" id="ctNext" style="flex:2">${i===TUTORIAL_STEPS.length-1?'Finish':'Next'}</button></div></div>`;
    ov.querySelector('#ctNext').onclick=()=>{ i++; show(); };
    ov.querySelector('#ctSkip').onclick=end;
  }
  show();
}

// ---------- chat (real-time messaging) ----------
let openConv=null, convCache={}, es=null;
const escapeHtml=(s)=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function connectStream(){
  if(es || !isLoggedIn()) return;
  try{
    es=new EventSource(chatStreamUrl());
    es.onmessage=(e)=>{ try{ const d=JSON.parse(e.data); if(d.type==='message') onIncoming(d); else if(d.type==='call') routeCall(d); }catch{} };
    es.onerror=()=>{}; // EventSource auto-reconnects
  }catch{}
}
function disconnectStream(){ if(es){ try{es.close();}catch{} es=null; } }
function onIncoming(d){
  if(tab==='chats' && openConv===d.conversationId){ appendMessage(d.message); api.chatRead({conversationId:openConv}).catch(()=>{}); }
  else if(tab==='chats' && !openConv){ renderChats(); }
}

// ---------- calls (WebRTC) ----------
let pc=null, localStream=null, currentCall=null, pendingOffer=null;
async function iceConfig(){ try{ return (await api.callConfig()).iceServers; }catch{ return [{urls:'stun:stun.l.google.com:19302'}]; } }
async function setupPc(){
  pc=new RTCPeerConnection({ iceServers: await iceConfig() });
  localStream.getTracks().forEach(t=>pc.addTrack(t, localStream));
  pc.onicecandidate=(e)=>{ if(e.candidate && currentCall) api.callSignal({toAccountId:currentCall.peer, signal:{kind:'candidate', candidate:e.candidate}}).catch(()=>{}); };
  pc.ontrack=(e)=>{ const v=document.getElementById('remoteVid'); if(v) v.srcObject=e.streams[0]; setCallStatus('Connected'); };
  pc.onconnectionstatechange=()=>{ if(pc && ['failed','closed','disconnected'].includes(pc.connectionState)) endCall(); };
}
async function startCall(peerAccount, peerName, video){
  if(currentCall||pendingOffer) return;
  if(!navigator.mediaDevices?.getUserMedia) return toast('Calls need a camera/mic-capable browser over HTTPS.');
  currentCall={peer:peerAccount, name:peerName, video:!!video, role:'caller'};
  showCallUI('Calling…');
  try{ localStream=await navigator.mediaDevices.getUserMedia({audio:true, video:!!video}); }
  catch(e){ teardown(); return toast('Camera/mic blocked'); }
  attachLocal(); await setupPc();
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  api.callSignal({toAccountId:peerAccount, signal:{kind:'offer', sdp:offer, video:!!video}}).catch(()=>{});
}
function routeCall(d){
  const sig=d.signal||{};
  if(sig.kind==='offer'){
    if(currentCall||pendingOffer){ api.callSignal({toAccountId:d.from, signal:{kind:'decline'}}).catch(()=>{}); return; }
    pendingOffer={from:d.from, name:d.fromName, sdp:sig.sdp, video:!!sig.video};
    showIncoming(d.fromName, !!sig.video);
  } else if(sig.kind==='answer'){ if(pc) pc.setRemoteDescription(sig.sdp).catch(()=>{}); setCallStatus('Connected'); }
  else if(sig.kind==='candidate'){ if(pc && sig.candidate) pc.addIceCandidate(sig.candidate).catch(()=>{}); }
  else if(sig.kind==='hangup'||sig.kind==='decline'){ closeIncoming(); teardown(); }
}
async function acceptCall(){
  const o=pendingOffer; pendingOffer=null; closeIncoming(); if(!o) return;
  currentCall={peer:o.from, name:o.name, video:o.video, role:'callee'};
  showCallUI('Connecting…');
  try{ localStream=await navigator.mediaDevices.getUserMedia({audio:true, video:o.video}); }
  catch(e){ teardown(); return toast('Camera/mic blocked'); }
  attachLocal(); await setupPc();
  await pc.setRemoteDescription(o.sdp);
  const ans=await pc.createAnswer(); await pc.setLocalDescription(ans);
  api.callSignal({toAccountId:o.from, signal:{kind:'answer', sdp:ans}}).catch(()=>{});
}
function declineCall(){ if(pendingOffer){ api.callSignal({toAccountId:pendingOffer.from, signal:{kind:'decline'}}).catch(()=>{}); pendingOffer=null; } closeIncoming(); }
function endCall(){ if(currentCall) api.callSignal({toAccountId:currentCall.peer, signal:{kind:'hangup'}}).catch(()=>{}); teardown(); }
function teardown(){ if(pc){ try{pc.close();}catch{} pc=null; } if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localStream=null; } currentCall=null; removeCallUI(); }
function attachLocal(){ const lv=document.getElementById('localVid'); if(lv && localStream) lv.srcObject=localStream; }
function setCallStatus(s){ const el=document.getElementById('callStatus'); if(el) el.textContent=s; if(s==='Connected' && currentCall?.video){ const ci=document.getElementById('callinfo'); if(ci) ci.style.opacity='0'; } }
function showCallUI(status){
  removeCallUI(); const v=currentCall.video;
  const el=document.createElement('div'); el.id='callui'; el.className='callui';
  el.innerHTML=`
    <video id="remoteVid" autoplay playsinline class="remotevid"></video>
    ${v?'<video id="localVid" autoplay playsinline muted class="localvid"></video>':''}
    <div class="callinfo" id="callinfo"><div class="av" style="width:90px;height:90px;border-radius:50%;font-size:34px;margin:0 auto">${initials(currentCall.name)}</div>
      <div style="font-size:22px;font-weight:800;margin-top:14px;color:#fff">${escapeHtml(currentCall.name)}</div>
      <div id="callStatus" style="color:#cfe7ef;margin-top:4px">${status}</div></div>
    <div class="callctrls">
      <button class="callbtn" id="cbmute" title="Mute">🔇</button>
      <button class="callbtn hang" id="cbhang" title="End">✕</button>
      ${v?'<button class="callbtn" id="cbcam" title="Camera">📷</button>':''}</div>`;
  document.body.appendChild(el);
  document.getElementById('cbhang').onclick=endCall;
  document.getElementById('cbmute').onclick=()=>{ if(!localStream)return; const a=localStream.getAudioTracks()[0]; if(a){ a.enabled=!a.enabled; document.getElementById('cbmute').style.opacity=a.enabled?'1':'.5'; } };
  const cam=document.getElementById('cbcam'); if(cam) cam.onclick=()=>{ const vt=localStream?.getVideoTracks()[0]; if(vt){ vt.enabled=!vt.enabled; cam.style.opacity=vt.enabled?'1':'.5'; } };
}
function removeCallUI(){ const e=document.getElementById('callui'); if(e) e.remove(); }
function showIncoming(name, video){
  closeIncoming();
  const bg=openSheet(`<div class="center"><div class="av" style="width:80px;height:80px;border-radius:50%;font-size:30px;margin:6px auto;background:#06384f">${initials(name)}</div>
    <h2 style="margin:12px 0 2px">${escapeHtml(name)}</h2><p class="lead">Incoming ${video?'video':'voice'} call…</p>
    <div style="display:flex;gap:10px;margin-top:8px"><button class="btn coral" id="cdecline" style="flex:1">Decline</button><button class="btn" id="caccept" style="flex:1">Accept</button></div></div>`);
  bg.id='incomingcall';
  document.getElementById('caccept').onclick=acceptCall;
  document.getElementById('cdecline').onclick=declineCall;
}
function closeIncoming(){ const e=document.getElementById('incomingcall'); if(e) e.remove(); }

function lastPreview(m){
  if(!m) return 'No messages yet';
  const mine=m.senderAccount===store.get().user.accountId;
  if(m.kind==='payment') return '💸 '+SYM+store.fmt(m.amount);
  if(m.kind==='image') return (mine?'You: ':'')+'📷 Photo';
  if(m.kind==='voice') return (mine?'You: ':'')+'🎤 Voice message';
  if(m.kind==='system') return m.body||'';
  return (mine?'You: ':'')+(m.body||'');
}
async function renderChats(){
  if(openConv) return renderConversation(openConv);
  let convs=[];
  try{ convs=(await api.chatList()).conversations; convs.forEach(c=>convCache[c.id]=c); }catch(e){}
  screen(`
    <div class="sec" style="margin-top:18px"><h3>Chats</h3><span class="link" id="newchat">＋ New</span></div>
    <div class="card">${convs.length? convs.map(c=>`<div class="row" data-conv="${c.id}">
      <div class="av" style="background:${c.color}">${c.kind==='group'?'👥':initials(c.title)}</div>
      <div class="m"><div class="n">${c.title}</div><div class="s">${escapeHtml(lastPreview(c.last)).slice(0,42)}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div class="s">${c.lastTs?timeAgo(c.lastTs):''}</div>${c.unread?`<span class="unread">${c.unread}</span>`:''}</div></div>`).join('')
      : `<div class="row" style="cursor:default"><div class="m"><div class="s">No chats yet. Tap “＋ New” to message someone.</div></div></div>`}</div>
    <p class="note">Messages deliver in real time. Tap 💵 inside a chat to send money.</p>`);
  $('#newchat').onclick=newChatPicker;
  app().querySelectorAll('[data-conv]').forEach(n=>n.onclick=()=>{ openConv=n.dataset.conv; render(); });
}
function newChatPicker(){
  const s=store.get();
  openSheet(`<h2>New chat</h2><p class="lead">Message someone</p>
    <div style="max-height:55vh;overflow:auto">${s.contacts.length? s.contacts.map(c=>`<div class="row" data-nc="${c.id}">${avatar(c.name,c.color)}
      <div class="m"><div class="n">${c.name}</div><div class="s">${c.handle||''}${(c.currency&&c.currency!==s.user.currency)?' · 🌎 '+c.island:''}</div></div></div>`).join('')
      : '<p class="note">No contacts yet — have someone register.</p>'}</div>`);
  document.querySelectorAll('[data-nc]').forEach(n=>n.onclick=async()=>{
    try{ const r=await api.chatStart({peerAccountId:n.dataset.nc}); closeSheet(); openConv=r.conversationId; render(); }catch(e){ toast('Could not start chat'); }
  });
}
function bubble(m){
  const mine=m.senderAccount===store.get().user.accountId;
  if(m.kind==='system') return `<div class="syswrap"><span class="sysmsg">${escapeHtml(m.body)}</span></div>`;
  if(m.kind==='payment') return `<div class="bub ${mine?'me':'them'}" data-mid="${m.id}"><div class="paybub">💸 ${SYM}${store.fmt(m.amount)}<div class="paysub">${mine?'You sent':'Received'}</div></div></div>`;
  if(m.kind==='image') return `<div class="bub ${mine?'me':'them'}" data-mid="${m.id}"><img class="chatimg" src="${encodeURI(m.body||'')}" loading="lazy"></div>`;
  if(m.kind==='voice') return `<div class="bub ${mine?'me':'them'}" data-mid="${m.id}"><audio class="chataud" controls src="${encodeURI(m.body||'')}"></audio></div>`;
  return `<div class="bub ${mine?'me':'them'}" data-mid="${m.id}"><div class="msg">${escapeHtml(m.body)}</div></div>`;
}
function appendMessage(m){
  const c=document.getElementById('msgs'); if(!c) return;
  if(c.querySelector(`[data-mid="${m.id}"]`)) return; // dedup (SSE echoes our own sends)
  c.insertAdjacentHTML('beforeend', bubble(m)); c.scrollTop=c.scrollHeight;
}
async function renderConversation(convId){
  let meta=convCache[convId];
  if(!meta){ try{ (await api.chatList()).conversations.forEach(c=>convCache[c.id]=c); meta=convCache[convId]; }catch{} }
  meta=meta||{title:'Chat',kind:'direct',handle:''};
  let msgs=[]; try{ msgs=(await api.chatMessages(convId,0)).messages; }catch(e){}
  app().innerHTML=`
    <div class="topbar"><div class="chatback" id="back">‹</div>
      <div class="brand" style="font-size:16px">${escapeHtml(meta.title)}<small>${meta.kind==='group'?'group chat':(meta.handle||'direct')}</small></div>
      <div class="spacer"></div>
      ${(meta.kind==='direct'&&meta.peerAccount)?`<div class="callicon" id="voicecall">📞</div><div class="callicon" id="videocall">🎥</div>`:''}</div>
    <div class="screen chatscroll" id="msgs">${msgs.map(bubble).join('')}</div>
    <div class="chatbar">
      <button class="chatmoney" id="cplus" title="Send photo, voice or money">＋</button>
      <input id="cinput" placeholder="Message…" autocomplete="off" enterkeyhint="send">
      <button class="chatsend" id="csend">${icon('send')}</button>
    </div>`;
  const box=document.getElementById('msgs'); box.scrollTop=box.scrollHeight;
  document.getElementById('back').onclick=()=>{ openConv=null; tab='chats'; render(); };
  const send=async()=>{ const i=document.getElementById('cinput'); const t=i.value.trim(); if(!t)return; i.value='';
    try{ const r=await api.chatSend({conversationId:convId,text:t}); appendMessage(r.message); }catch(e){ i.value=t; } };
  document.getElementById('csend').onclick=send;
  document.getElementById('cinput').onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); send(); } };
  document.getElementById('cplus').onclick=()=>chatPlus(convId);
  const vc=document.getElementById('voicecall'); if(vc) vc.onclick=()=>startCall(meta.peerAccount, meta.title, false);
  const vd=document.getElementById('videocall'); if(vd) vd.onclick=()=>startCall(meta.peerAccount, meta.title, true);
  api.chatRead({conversationId:convId}).catch(()=>{});
}
function chatMoney(convId){
  amountEntry('Send money in chat','Goes to this conversation','Send',async(cents)=>{
    await doMoney(()=>api.chatMoney({conversationId:convId,amountCents:cents,idempotencyKey:newKey()}).then(r=>{ if(r&&r.message) appendMessage(r.message); return r; }),
      'Sent', (res)=> res&&res.crossBorder?`${SYM}${store.fmt(cents)} → ${symFor(res.dstCurrency)}${store.fmt(res.dstAmount)}`:`${SYM}${store.fmt(cents)} sent in chat`);
  },{feeKind:'transfer'});
}
const blobToDataUrl=(blob)=>new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(blob); });
function chatPlus(convId){
  openSheet(`<h2>Send</h2><div class="grid" style="margin:10px 0 0;grid-template-columns:repeat(3,1fr)">
    <div class="mini" id="opt-photo"><div class="ic">📷</div><div class="t">Photo</div></div>
    <div class="mini" id="opt-voice"><div class="ic">🎤</div><div class="t">Voice</div></div>
    <div class="mini" id="opt-money"><div class="ic">💵</div><div class="t">Money</div></div></div>`);
  $('#opt-photo').onclick=()=>{ closeSheet(); pickImage(convId); };
  $('#opt-voice').onclick=()=>{ closeSheet(); recordVoice(convId); };
  $('#opt-money').onclick=()=>{ closeSheet(); chatMoney(convId); };
}
function pickImage(convId){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const fr=new FileReader();
    fr.onload=async()=>{ try{ const r=await api.chatMedia({conversationId:convId,kind:'image',dataBase64:fr.result}); appendMessage(r.message); }catch(e){ toast(e.message||'Upload failed'); } };
    fr.readAsDataURL(f); };
  inp.click();
}
async function recordVoice(convId){
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)) return toast('Voice recording not supported here.');
  let stream; try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }catch{ return toast('Mic blocked'); }
  const rec=new MediaRecorder(stream); const chunks=[]; let cancelled=false, secs=0;
  rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  const bg=openSheet(`<div class="center"><div style="font-size:40px">🎙️</div><h2 style="margin:8px 0 4px">Recording…</h2>
    <p class="lead" id="rectime">0:00</p><button class="btn" id="recstop">Stop &amp; send</button>
    <button class="btn ghost" id="reccancel" style="margin-top:8px">Cancel</button></div>`);
  const tm=setInterval(()=>{ secs++; const e=$('#rectime',bg); if(e) e.textContent='0:'+String(secs).padStart(2,'0'); },1000);
  rec.onstop=async()=>{ clearInterval(tm); stream.getTracks().forEach(t=>t.stop()); if(cancelled) return;
    const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'}); const b64=await blobToDataUrl(blob);
    try{ const r=await api.chatMedia({conversationId:convId,kind:'voice',dataBase64:b64}); appendMessage(r.message); }catch(e){ toast('Voice failed'); } };
  $('#recstop',bg).onclick=()=>{ closeSheet(); rec.stop(); };
  $('#reccancel',bg).onclick=()=>{ cancelled=true; rec.stop(); closeSheet(); };
  rec.start();
}

// ---------- Moments (social feed) ----------
async function renderMoments(){
  let posts=[]; try{ posts=(await api.feed()).posts; }catch{}
  screen(`
    <div class="backrow" data-back="discover">‹ Discover</div>
    <div class="sec" style="margin-top:6px"><h3>Moments</h3></div>
    <div class="card" style="padding:14px 16px">
      <textarea id="postbody" class="composer" placeholder="Share something with the islands…" maxlength="500"></textarea>
      <button class="btn" id="postbtn" style="margin-top:10px">Post</button>
    </div>
    <div style="height:6px"></div>
    ${posts.map(postCard).join('') || '<p class="note">No moments yet — be the first to post.</p>'}`);
  $('#postbtn').onclick=async()=>{ const t=$('#postbody').value.trim(); if(!t)return; const b=$('#postbtn'); b.disabled=true;
    try{ await api.feedPost({body:t}); renderMoments(); }catch(e){ b.disabled=false; } };
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab=n.dataset.back; render(); });
  app().querySelectorAll('[data-like]').forEach(n=>n.onclick=async()=>{ await api.feedLike({postId:n.dataset.like}); renderMoments(); });
  app().querySelectorAll('[data-cmt]').forEach(n=>n.onclick=()=>commentSheet(n.dataset.cmt));
}
function postCard(p){
  return `<div class="card" style="margin-bottom:10px"><div style="padding:14px 16px">
    <div style="display:flex;gap:10px;align-items:center">${avatar(p.author,p.color)}
      <div class="m"><div class="n">${escapeHtml(p.author)}</div><div class="s">${timeAgo(p.ts)}</div></div></div>
    <div style="margin:10px 0 12px;font-size:14.5px;line-height:1.4">${escapeHtml(p.body)}</div>
    <div style="display:flex;gap:18px;font-size:13.5px;font-weight:600">
      <span data-like="${p.id}" style="cursor:pointer;color:${p.liked?'var(--coral)':'var(--muted)'}">♥ ${p.likes}</span>
      <span data-cmt="${p.id}" style="cursor:pointer;color:var(--muted)">💬 ${p.comments.length}</span></div>
    ${p.comments.length?`<div style="margin-top:10px;border-top:1px solid var(--hair);padding-top:8px">
      ${p.comments.map(c=>`<div style="font-size:13px;margin:4px 0"><b>${escapeHtml(c.author)}</b> ${escapeHtml(c.body)}</div>`).join('')}</div>`:''}
  </div></div>`;
}
function commentSheet(postId){
  const bg=openSheet(`<h2>Add a comment</h2>
    <div class="field" style="margin:6px 0 12px"><input id="cmtinput" placeholder="Write a comment…"></div>
    <button class="btn" id="cmtsend">Post comment</button>`);
  $('#cmtsend',bg).onclick=async()=>{ const t=$('#cmtinput',bg).value.trim(); if(!t)return;
    await api.feedComment({postId,body:t}); closeSheet(); renderMoments(); };
}

// ---------- Mini-program: merchant storefronts ----------
// ---------- services hub: order food / taxi / anything (escrow-backed) ----------
const SERVICES=[
  {id:'food',t:'Food',ic:'🍔',cats:['Food']},
  {id:'grocery',t:'Groceries',ic:'🛒',cats:['Grocery']},
  {id:'ride',t:'Taxi',ic:'🚕'},
  {id:'orders',t:'My Orders',ic:'🧾'},
];
function renderServices(){
  screen(`
    <div class="backrow" data-back="discover">‹ Discover</div>
    <div class="sec" style="margin-top:6px"><h3>Order anything</h3></div>
    <div class="grid" style="grid-template-columns:repeat(4,1fr)">${SERVICES.map(s=>`<div class="mini" data-svc="${s.id}"><div class="ic">${s.ic}</div><div class="t">${s.t}</div></div>`).join('')}</div>
    <p class="note">Food, rides, groceries, anything — paid safely through escrow. The provider only gets paid when your order is complete.</p>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab=n.dataset.back; render(); });
  app().querySelectorAll('[data-svc]').forEach(n=>n.onclick=()=>{ const s=SERVICES.find(x=>x.id===n.dataset.svc);
    if(s.id==='ride') return rideRequest();
    if(s.id==='orders'){ tab='orders'; return render(); }
    svcCats=s.cats; svcTitle=s.t; tab='providers'; render(); });
}
let svcCats=null, svcTitle='';
function renderProviders(){
  const list=store.get().merchants.filter(m=>!svcCats||svcCats.includes(m.category));
  screen(`
    <div class="backrow" data-back="services">‹ Services</div>
    <div class="sec" style="margin-top:6px"><h3>${svcTitle}</h3></div>
    <div class="card">${list.length? list.map(m=>`<div class="row" data-store="${m.id}|${encodeURIComponent(m.name)}|${encodeURIComponent(m.category||'')}">
      <div class="av" style="background:${m.color}">${m.emoji||'🏬'}</div><div class="m"><div class="n">${escapeHtml(m.name)}</div><div class="s">${m.category||''}</div></div>
      <div class="badge pay">Order ›</div></div>`).join('') : '<div class="row" style="cursor:default"><div class="m"><div class="s">No providers yet.</div></div></div>'}</div>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab=n.dataset.back; render(); });
  app().querySelectorAll('[data-store]').forEach(n=>n.onclick=()=>{ const [id,nm,cat]=n.dataset.store.split('|'); storeMerchant={id,name:decodeURIComponent(nm),category:decodeURIComponent(cat)}; cart={}; tab='store'; render(); });
}

let storeMerchant=null, cart={};
async function renderStore(){
  if(!storeMerchant){ tab='discover'; return render(); }
  let data; try{ data=await api.products(storeMerchant.id); }catch{ data={merchant:storeMerchant,products:[]}; }
  const m=data.merchant; const total=Object.values(cart).reduce((a,i)=>a+i.price*i.qty,0); const count=Object.values(cart).reduce((a,i)=>a+i.qty,0);
  screen(`
    <div class="backrow" data-back="discover">‹ Back</div>
    <div class="hero" style="background:radial-gradient(120% 120% at 90% -10%,rgba(255,194,75,.5),transparent 55%),linear-gradient(135deg,var(--ocean),var(--coral))">
      <div class="label">${m.category||'Shop'} · mini-app</div>
      <div style="font-size:25px;font-weight:800;margin:6px 0 2px;letter-spacing:-.02em">${escapeHtml(m.name)}</div>
      <div class="sub"><span class="dot"></span> escrow-protected orders</div></div>
    <div class="sec"><h3>Menu</h3></div>
    <div class="card" style="margin-bottom:90px">${data.products.length? data.products.map(p=>{const q=cart[p.id]?.qty||0; return `<div class="row" style="cursor:default">
      <div class="av" style="background:var(--sand)">${p.emoji||'🛍️'}</div>
      <div class="m"><div class="n">${escapeHtml(p.name)}</div><div class="s">${m.symbol||SYM}${store.fmt(p.price_cents)}</div></div>
      <div style="display:flex;align-items:center;gap:8px">${q?`<span class="qbtn" data-dec="${p.id}">−</span><b>${q}</b>`:''}<span class="qbtn add" data-add="${p.id}|${encodeURIComponent(p.name)}|${p.price_cents}">＋</span></div></div>`;}).join('') : '<div class="row" style="cursor:default"><div class="m"><div class="s">No items listed yet.</div></div></div>'}</div>
    ${count?`<div class="orderbar"><div><b>${count} item${count>1?'s':''}</b> · ${m.symbol||SYM}${store.fmt(total)}</div><button class="btn" id="placeorder" style="width:auto;padding:0 22px">Place order</button></div>`:''}`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab='discover'; render(); });
  app().querySelectorAll('[data-add]').forEach(n=>n.onclick=()=>{ const [id,nm,price]=n.dataset.add.split('|'); cart[id]=cart[id]||{name:decodeURIComponent(nm),price:parseInt(price,10),qty:0}; cart[id].qty++; renderStore(); });
  app().querySelectorAll('[data-dec]').forEach(n=>n.onclick=()=>{ const id=n.dataset.dec; if(cart[id]){ cart[id].qty--; if(cart[id].qty<=0) delete cart[id]; } renderStore(); });
  const po=$('#placeorder'); if(po) po.onclick=()=>placeOrder(m);
}
function placeOrder(m){
  const items=Object.entries(cart).map(([id,i])=>({id,name:i.name,price:i.price,qty:i.qty}));
  const total=items.reduce((a,i)=>a+i.price*i.qty,0); const count=items.reduce((a,i)=>a+i.qty,0);
  confirmPay(`Order from ${m.name}`, `${count} item${count>1?'s':''}`, total, null, async()=>{
    const go=$('#go'); if(go){go.disabled=true;go.textContent='Placing…';}
    try{ await api.orderCreate({providerAccount:storeMerchant.id, category:(m.category||'order').toLowerCase(), title:`${count} item${count>1?'s':''} from ${m.name}`, details:items, amountCents:total}); await store.refresh(); cart={}; closeSheet(); successSheet('Order placed','Held safely in escrow until it arrives.'); tab='orders'; }
    catch(e){ if(go) shake('go', e.message||'Try again'); }
  });
}
function rideRequest(){
  const bg=openSheet(`<h2>Request a ride 🚕</h2><p class="lead">Drivers nearby will accept. Fare held in escrow.</p>
    <div class="field" style="margin:6px 0"><label>Pickup</label><input id="rfrom" placeholder="e.g. Cable Beach"></div>
    <div class="field" style="margin:6px 0"><label>Drop-off</label><input id="rto" placeholder="e.g. Bay Street"></div>
    <div class="field" style="margin:6px 0"><label>Fare you'll pay</label><input id="rfare" inputmode="decimal" placeholder="15.00"></div>
    <button class="btn" id="rgo">Request ride</button>`);
  $('#rgo',bg).onclick=async()=>{ const from=$('#rfrom',bg).value.trim(), to=$('#rto',bg).value.trim(), fare=Math.round(parseFloat($('#rfare',bg).value||'0')*100);
    if(!from||!to||!fare) return shake('rgo','Fill all fields'); const b=$('#rgo',bg); b.disabled=true; b.textContent='Requesting…';
    try{ await api.orderCreate({category:'ride', title:`${from} → ${to}`, details:{from,to}, amountCents:fare, open:true}); await store.refresh(); closeSheet(); successSheet('Ride requested 🚕','A driver will accept shortly. Fare held in escrow.'); tab='orders'; render(); }
    catch(e){ b.disabled=false; b.textContent=e.message||'Try again'; } };
}
const ORDER_STATUS={open:'Waiting for a driver',placed:'Sent to provider',accepted:'Accepted',in_progress:'On the way',completed:'Completed',cancelled:'Cancelled'};
const NEXT_LABEL={open:'Accept',placed:'Accept',accepted:'Start',in_progress:'Complete'};
const NEXT_STATUS={placed:'accepted',accepted:'in_progress',in_progress:'completed'};
async function renderOrders(){
  let d; try{ d=await api.orders(); }catch{ d={mine:[],incoming:[],open:[]}; }
  const card=(o,actions)=>`<div class="card" style="margin-bottom:10px;padding:14px 16px">
    <div style="display:flex;align-items:center;gap:10px"><div class="av" style="background:var(--coral)">${o.category==='ride'?'🚕':(o.category==='grocery'?'🛒':'🍔')}</div>
      <div class="m"><div class="n">${escapeHtml(o.title)}</div><div class="s">${o.symbol}${store.fmt(o.amount)} · ${o.provider?escapeHtml(o.provider):(o.customer?escapeHtml(o.customer):'')}</div></div>
      <div style="text-align:right"><span class="badge ${o.status==='completed'?'':'pay'}">${ORDER_STATUS[o.status]||o.status}</span></div></div>
    ${actions||''}</div>`;
  screen(`
    <div class="backrow" data-back="discover">‹ Discover</div>
    ${d.open&&d.open.length?`<div class="sec" style="margin-top:6px"><h3>Open ride requests</h3></div>${d.open.map(o=>card(o,`<button class="btn" style="margin-top:10px" data-claim="${o.id}">Accept · earn ${o.symbol}${store.fmt(o.amount)}</button>`)).join('')}`:''}
    ${d.incoming&&d.incoming.length?`<div class="sec" style="margin-top:6px"><h3>Orders to fulfill</h3></div>${d.incoming.map(o=>card(o, NEXT_STATUS[o.status]?`<button class="btn" style="margin-top:10px" data-adv="${o.id}|${NEXT_STATUS[o.status]}">${NEXT_LABEL[o.status]}</button>`:'')).join('')}`:''}
    <div class="sec" style="margin-top:6px"><h3>Your orders</h3></div>
    ${d.mine.length? d.mine.map(o=>card(o, (o.status==='placed'||o.status==='open')?`<button class="btn ghost" style="margin-top:10px" data-cancel="${o.id}">Cancel & refund</button>`:'')).join('') : '<div class="card" style="padding:16px"><div class="s muted">No orders yet. Order food, a ride, or anything from Services.</div></div>'}
    <p class="note">Every order is escrow-protected: the provider is paid only when it's complete.</p>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab=n.dataset.back; render(); });
  app().querySelectorAll('[data-claim]').forEach(n=>n.onclick=async()=>{ n.disabled=true; try{ await api.orderClaim({id:n.dataset.claim}); renderOrders(); }catch(e){ toast(e.message||'Taken'); renderOrders(); } });
  app().querySelectorAll('[data-adv]').forEach(n=>n.onclick=async()=>{ const [id,st]=n.dataset.adv.split('|'); n.disabled=true; try{ await api.orderUpdate({id,status:st}); await store.refresh(); renderOrders(); }catch(e){ toast(e.message||'Failed'); } });
  app().querySelectorAll('[data-cancel]').forEach(n=>n.onclick=async()=>{ n.disabled=true; try{ await api.orderUpdate({id:n.dataset.cancel,status:'cancelled'}); await store.refresh(); renderOrders(); }catch(e){ toast(e.message||'Failed'); } });
}

// ---------- proof of reserve ----------
async function renderReserve(){
  let d; try{ d=await api.reserve(); }catch{ d={conserved:false,currencies:[]}; }
  screen(`<div class="backrow" data-back="me">‹ Me</div>
    <div class="hero" style="background:radial-gradient(120% 120% at 90% -10%,rgba(95,230,181,.5),transparent 55%),linear-gradient(135deg,var(--ok),#0a8f63)">
      <div class="label">Your money is protected</div>
      <div class="bal" style="font-size:30px">${d.conserved?'100% backed ✓':'Verifying…'}</div>
      <div class="sub"><span class="dot"></span> every wallet · every currency</div></div>
    <div class="sec"><h3>Customer funds held</h3></div>
    <div class="card">${d.currencies.length? d.currencies.map(c=>`<div class="row" style="cursor:default"><div class="av" style="background:#1fb87a">${(c.symbol||'$').trim()||'$'}</div>
      <div class="m"><div class="n">${c.symbol}${store.fmt(c.customerHeld)} in ${c.currency} wallets</div><div class="s">${c.backed?'fully backed in reserve ✓':'⚠ discrepancy'}</div></div></div>`).join('')
      : '<div class="row" style="cursor:default"><div class="m"><div class="s">No funds yet.</div></div></div>'}</div>
    <p class="note">Caribe's ledger is double-entry: in every currency, all balances sum to exactly <b>zero</b> — so every dollar in a wallet is matched in reserve. Verify it yourself anytime at <b>/api/health</b>. No bank shows you this.</p>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{tab=n.dataset.back;render();});
}

// ---------- requests + split ----------
function requestOrSplit(){
  openSheet(`<h2>Request or split</h2><p class="lead">Get paid back, the easy way</p>
    <button class="btn" id="rqmoney" style="margin-bottom:10px">Request money from someone</button>
    <button class="btn ghost" id="rqsplit">Split a bill with friends</button>`);
  $('#rqmoney').onclick=()=>{ closeSheet(); requestFlow(); };
  $('#rqsplit').onclick=()=>{ closeSheet(); splitFlow(); };
}
function requestFlow(){
  const s=store.get();
  openSheet(`<h2>Request money</h2><p class="lead">From whom?</p>
    <div style="max-height:55vh;overflow:auto">${s.contacts.filter(c=>!c.currency||c.currency===s.user.currency).map(c=>`<div class="row" data-rc="${c.id}|${encodeURIComponent(c.name)}">${avatar(c.name,c.color)}<div class="m"><div class="n">${c.name}</div></div><div class="chev">${icon('chev')}</div></div>`).join('')||'<p class="note">No same-island contacts.</p>'}</div>`);
  document.querySelectorAll('[data-rc]').forEach(n=>n.onclick=()=>{ const [id,nm]=n.dataset.rc.split('|'); const name=decodeURIComponent(nm);
    amountEntry(`Request from ${name}`,'They get a request to pay you','Request',async(cents,memo)=>{ const go=$('#go'); if(go){go.disabled=true;go.textContent='Sending…';}
      try{ await api.requestMoney({toAccountId:id,amountCents:cents,memo}); closeSheet(); successSheet('Request sent',`Asked ${name} for ${SYM}${store.fmt(cents)}`);}catch(e){ if(go) shake('go',e.message||'Try again'); } },{memoPh:'what for?'}); });
}
function splitFlow(){
  const s=store.get(); const picked=new Set();
  const bg=openSheet(`<h2>Split a bill</h2><p class="lead">Everyone (including you) pays an equal share</p>
    <div class="field" style="margin:6px 0"><label>Total amount</label><input id="splittot" inputmode="decimal" placeholder="60.00"></div>
    <div class="field" style="margin:6px 0"><label>Note</label><input id="splitmemo" placeholder="Dinner at Goldie's"></div>
    <label style="display:block;font-size:12px;font-weight:600;color:var(--muted);margin:10px 18px 4px">Split with</label>
    <div style="max-height:28vh;overflow:auto;margin:0 6px">${s.contacts.filter(c=>!c.currency||c.currency===s.user.currency).map(c=>`<div class="row" data-sp="${c.id}">${avatar(c.name,c.color)}<div class="m"><div class="n">${c.name}</div></div><div class="soucheck" data-for="${c.id}">○</div></div>`).join('')}</div>
    <div id="splitcalc" class="feeline">&nbsp;</div>
    <button class="btn" id="splitgo" style="margin-top:6px">Send requests</button>`);
  const recalc=()=>{ const tot=Math.round(parseFloat($('#splittot',bg).value||'0')*100); const el=$('#splitcalc',bg); el.textContent=(tot>0&&picked.size)?`Each pays ${SYM}${store.fmt(Math.round(tot/(picked.size+1)))} · ${picked.size+1} people`:''; };
  bg.querySelectorAll('[data-sp]').forEach(n=>n.onclick=()=>{ const id=n.dataset.sp; const c=bg.querySelector(`.soucheck[data-for="${id}"]`); if(picked.has(id)){picked.delete(id);c.textContent='○';c.style.color='';}else{picked.add(id);c.textContent='●';c.style.color='var(--sea)';} recalc(); });
  $('#splittot',bg).oninput=recalc;
  $('#splitgo',bg).onclick=async()=>{ const tot=Math.round(parseFloat($('#splittot',bg).value||'0')*100); const memo=$('#splitmemo',bg).value.trim(); if(!tot||!picked.size) return shake('splitgo','Amount + people'); const b=$('#splitgo',bg); b.disabled=true; b.textContent='Sending…';
    try{ const r=await api.splitBill({amountCents:tot,participantIds:[...picked],memo}); closeSheet(); successSheet('Bill split',`${r.count} request(s) sent · ${SYM}${store.fmt(r.share)} each`);}catch(e){ b.disabled=false; b.textContent=e.message||'Try again'; } };
}
function loadHomeRequests(){
  api.requests().then(d=>{ const slot=document.getElementById('reqslot'); if(!slot) return; const inc=d.incoming||[];
    if(!inc.length){ slot.innerHTML=''; return; }
    slot.innerHTML=`<div class="sec"><h3>Requests for you</h3><span class="badge">${inc.length}</span></div>
      <div class="card">${inc.map(r=>`<div class="row"><div class="av" style="background:var(--gold)">🧾</div>
        <div class="m"><div class="n">${escapeHtml(r.requester)} · ${r.symbol}${store.fmt(r.amount)}</div><div class="s">${escapeHtml(r.memo||'requested')}</div></div>
        <div style="display:flex;gap:6px;align-items:center"><span data-rdec="${r.id}" style="color:var(--muted);cursor:pointer;font-weight:700;padding:8px">✕</span>
        <button class="btn" style="width:auto;padding:9px 14px" data-rpay="${r.id}">Pay</button></div></div>`).join('')}</div>`;
    slot.querySelectorAll('[data-rpay]').forEach(n=>n.onclick=async()=>{ n.disabled=true; try{ await api.payRequest({id:n.dataset.rpay,idempotencyKey:newKey()}); await store.refresh(); render(); }catch(e){ n.disabled=false; toast(e.message||'Could not pay'); } });
    slot.querySelectorAll('[data-rdec]').forEach(n=>n.onclick=async()=>{ await api.declineRequest({id:n.dataset.rdec}).catch(()=>{}); render(); });
  }).catch(()=>{});
}

// ---------- Sou-Sou (digital partner-hand) ----------
async function renderSousou(){
  let list=[]; try{ list=(await api.sousouList()).sousous; }catch{}
  screen(`
    <div class="backrow" data-back="discover">‹ Discover</div>
    <div class="sec" style="margin-top:6px"><h3>Sou-Sou</h3><span class="link" id="newsou">＋ New</span></div>
    ${list.length? list.map(sousouCard).join('') : `<div class="card" style="padding:18px"><div class="s muted">No sou-sou yet. Start a savings hand with people you trust — everyone pays in, the pot rotates.</div></div>`}
    <p class="note">The partner-hand, digitized. Real money, real rotation, no organizer holding the cash. 🇧🇸</p>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{ tab=n.dataset.back; render(); });
  $('#newsou').onclick=newSousou;
  app().querySelectorAll('[data-pay-sou]').forEach(n=>n.onclick=()=>contributeSousou(n.dataset.paySou, n.dataset.souName, parseInt(n.dataset.souAmt,10)));
}
function sousouCard(s){
  const dots=s.members.map(m=>`<div class="soudot ${m.received?'got':(m.contributed?'paid':'pend')}" title="${escapeHtml(m.name)}">${m.received?'✓':(m.contributed?'•':'')}</div>`).join('');
  const yourTurn=s.recipient&&s.recipient.isYou;
  return `<div class="card" style="margin-bottom:10px;padding:16px">
    <div style="display:flex;align-items:center;gap:10px">
      <div class="av" style="background:linear-gradient(135deg,var(--violet),var(--sea))">💞</div>
      <div class="m"><div class="n">${escapeHtml(s.name)}</div><div class="s">${s.symbol}${store.fmt(s.amount)} · ${s.frequency} · ${s.size} members</div></div>
      <div style="text-align:right"><div style="font-weight:800">${s.symbol}${store.fmt(s.pot)}</div><div class="s">pot</div></div>
    </div>
    <div style="display:flex;gap:6px;margin:14px 0 10px">${dots}</div>
    <div class="s" style="margin-bottom:12px">${s.status==='complete'?'✅ Complete — everyone got their hand.':
      `Round ${s.round} of ${s.size} · ${s.recipient?(yourTurn?'<b style="color:var(--ok)">Your turn to receive 🎉</b>':escapeHtml(s.recipient.name)+' receives this round'):''}`}</div>
    ${s.status==='active'? (s.youContributed
      ? `<button class="btn ghost" disabled>You've paid this round ✓</button>`
      : `<button class="btn" data-pay-sou="${s.id}" data-sou-name="${escapeHtml(s.name)}" data-sou-amt="${s.amount}">Pay ${s.symbol}${store.fmt(s.amount)} this round</button>`):''}</div>`;
}
function newSousou(){
  const s=store.get(); const picked=new Set();
  const bg=openSheet(`<h2>New Sou-Sou</h2><p class="lead">Everyone pays in each round; the pot rotates to one member each round until all have received.</p>
    <div class="field" style="margin:6px 0"><label>Name</label><input id="souname" placeholder="e.g. Christmas Hand"></div>
    <div class="field" style="margin:6px 0"><label>Amount each, per round</label><input id="souamt" inputmode="decimal" placeholder="50.00"></div>
    <label style="display:block;font-size:12px;font-weight:600;color:var(--muted);margin:10px 18px 4px">Members (same island)</label>
    <div style="max-height:34vh;overflow:auto;margin:0 6px">${s.contacts.filter(c=>!c.currency||c.currency===s.user.currency).map(c=>`<div class="row" data-soupick="${c.id}">${avatar(c.name,c.color)}<div class="m"><div class="n">${c.name}</div></div><div class="soucheck" data-for="${c.id}">○</div></div>`).join('')||'<p class="note">No same-island contacts to invite.</p>'}</div>
    <button class="btn" id="soucreate" style="margin-top:12px">Create sou-sou</button>`);
  bg.querySelectorAll('[data-soupick]').forEach(n=>n.onclick=()=>{ const id=n.dataset.soupick; const c=bg.querySelector(`.soucheck[data-for="${id}"]`);
    if(picked.has(id)){picked.delete(id);c.textContent='○';c.style.color='var(--faint)';}else{picked.add(id);c.textContent='●';c.style.color='var(--sea)';} });
  $('#soucreate',bg).onclick=async()=>{
    const name=$('#souname',bg).value.trim(); const amt=Math.round(parseFloat($('#souamt',bg).value||'0')*100);
    if(!name||!amt||!picked.size){ const b=$('#soucreate',bg); b.classList.add('coral'); b.textContent='Name, amount + 1 member'; setTimeout(()=>{b.classList.remove('coral');b.textContent='Create sou-sou';},1400); return; }
    const b=$('#soucreate',bg); b.disabled=true; b.textContent='Creating…';
    try{ await api.sousouCreate({name,amountCents:amt,memberIds:[...picked]}); closeSheet(); renderSousou(); }
    catch(e){ b.disabled=false; b.textContent=e.message||'Try again'; }
  };
}
function contributeSousou(id,name,amt){
  confirmPay(`Pay into ${name}`, 'Sou-Sou contribution', amt, null, async()=>{
    const go=$('#go'); if(go){go.disabled=true;go.textContent='Paying…';}
    try{ const r=await api.sousouContribute({id}); await store.refresh(); closeSheet();
      if(r.paidOut && r.paidOut.toRecipient) successSheet('🎉 You got the hand!', `${SYM}${store.fmt(r.paidOut.amount)} paid out to you.`);
      else if(r.paidOut) successSheet('Round complete', `${SYM}${store.fmt(r.paidOut.amount)} paid to this round's member.`);
      else successSheet('Paid in', `${SYM}${store.fmt(amt)} into ${name}`);
      tab='sousou'; }
    catch(e){ if(go) shake('go', e.message||'Try again'); }
  });
}

// ---------- AI money assistant ----------
function askCaribe(){
  const bg=openSheet(`<h2>✨ Ask Caribe</h2><p class="lead">Your money assistant</p>
    <div id="asktx" class="asktx"></div>
    <div class="askchips">${["What's my balance?","How much did I spend this week?","Send 20 to a friend","Recent activity"].map(s=>`<span class="chip ask-sug">${s}</span>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><input id="askin" placeholder="Ask anything…" style="flex:1;border:1.5px solid var(--line);border-radius:14px;padding:13px 15px;font-size:15px;font-family:inherit;outline:none">
      <button class="btn" id="asksend" style="width:auto;padding:0 18px">Ask</button></div>`);
  const tx=$('#asktx',bg);
  const bot=(html)=>{ tx.insertAdjacentHTML('beforeend',`<div class="askmsg bot">${html}</div>`); tx.scrollTop=tx.scrollHeight; };
  const me=(t)=>{ tx.insertAdjacentHTML('beforeend',`<div class="askmsg user">${escapeHtml(t)}</div>`); tx.scrollTop=tx.scrollHeight; };
  bot("Hi! I can check your <b>balance</b>, show your <b>spending</b>, <b>send money</b> (“send 20 to Makeda”), or list <b>recent activity</b>.");
  const go=async()=>{ const i=$('#askin',bg); const t=i.value.trim(); if(!t)return; i.value=''; me(t); await handleAsk(t,bot); };
  $('#asksend',bg).onclick=go; $('#askin',bg).onkeydown=(e)=>{ if(e.key==='Enter') go(); };
  bg.querySelectorAll('.ask-sug').forEach(c=>c.onclick=()=>{ $('#askin',bg).value=c.textContent; go(); });
}
async function handleAsk(text, bot){
  const s=text.toLowerCase();
  let m=s.match(/(?:send|pay|transfer)\s+\$?([\d]+(?:\.\d{1,2})?)\s+(?:to\s+)?([a-z]+)/) || s.match(/(?:send|pay)\s+([a-z]+)\s+\$?([\d]+(?:\.\d{1,2})?)/);
  if(m){
    let amt,name; if(/^[\d.]/.test(m[1])){ amt=m[1]; name=m[2]; } else { name=m[1]; amt=m[2]; }
    const cents=Math.round(parseFloat(amt)*100);
    const c=store.get().contacts.find(x=>x.name.toLowerCase().includes(name)||(x.handle||'').toLowerCase().includes(name));
    if(!c){ bot(`I couldn't find “${escapeHtml(name)}” in your contacts.`); return; }
    bot(`Opening a ${SYM}${store.fmt(cents)} payment to ${escapeHtml(c.name)}…`);
    setTimeout(()=>{ closeSheet(); payToAccount(c.id, c.name, 'user', cents, c.currency); }, 350); return;
  }
  if(/balance|how much.*(have|left)|my money/.test(s)){ bot(`Your balance is <b>${SYM}${store.fmt(store.balance())}</b>.`); return; }
  if(/spen[dt]|where.*money|insight|budget/.test(s)){
    try{ const d=await api.insights(); const trend=d.spentPrevWeek?(d.spentWeek>d.spentPrevWeek?'up':'down'):'flat';
      bot(`You've spent <b>${SYM}${store.fmt(d.spentWeek)}</b> across ${d.txnsWeek} payment(s) this week (${trend} vs last). ${d.topPayees[0]?'Top: '+escapeHtml(d.topPayees[0].n)+' '+SYM+store.fmt(d.topPayees[0].s)+'.':''} <span class="ask-link" id="moreins">See full insights →</span>`);
      const ml=$('#moreins'); if(ml) ml.onclick=()=>{ closeSheet(); tab='insights'; render(); };
    }catch(e){ bot("Couldn't load your spending right now."); } return;
  }
  if(/recent|history|transaction|last/.test(s)){
    const t=store.get().txns.slice(0,3);
    bot(t.length? 'Recent: '+t.map(x=>`${x.dir==='in'?'+':'−'}${SYM}${store.fmt(x.amount)} ${x.dir==='in'?'from':'to'} ${escapeHtml(x.party)}`).join('; ') : 'No recent activity yet.'); return;
  }
  bot("I can check your <b>balance</b>, show <b>spending</b>, <b>send money</b> (“send 20 to Makeda”), or list <b>recent activity</b>.");
}

// ---------- spending insights ----------
const KIND_LABEL={payment:'Shops',transfer:'Sent',gift:'Gifts',bill:'Bills',cashout:'Cash out',xborder:'Cross-island'};
async function renderInsights(){
  let d; try{ d=await api.insights(); }catch{ d=null; }
  if(!d){ screen(`<div class="backrow" data-back="me">‹ Me</div><p class="note">Couldn't load insights.</p>`);
    app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{tab=n.dataset.back;render();}); return; }
  const sym=d.symbol||SYM, maxK=Math.max(1,...d.byKind.map(k=>k.s));
  const trend=d.spentPrevWeek?Math.round((d.spentWeek-d.spentPrevWeek)/d.spentPrevWeek*100):0;
  screen(`
    <div class="backrow" data-back="me">‹ Me</div>
    <div class="sec" style="margin-top:6px"><h3>Spending insights</h3><span class="muted" style="margin-left:auto;font-size:12px">last 7 days</span></div>
    <div class="statgrid" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat"><div class="sv tnum">${sym}${store.fmt(d.spentWeek)}</div><div class="sl">Spent this week</div></div>
      <div class="stat"><div class="sv tnum">${sym}${store.fmt(d.receivedWeek)}</div><div class="sl">Received</div></div>
      <div class="stat"><div class="sv tnum" style="color:${trend>0?'var(--coral)':'var(--ok)'}">${trend>0?'+':''}${trend}%</div><div class="sl">vs last week</div></div>
      <div class="stat"><div class="sv tnum">${sym}${store.fmt(d.feesWeek)}</div><div class="sl">Fees paid</div></div>
    </div>
    <div class="sec"><h3>By category</h3></div>
    <div class="card" style="padding:16px">${d.byKind.length? d.byKind.map(k=>`
      <div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:5px"><span>${KIND_LABEL[k.kind]||k.kind}</span><span>${sym}${store.fmt(k.s)}</span></div>
      <div class="bar"><div class="barfill" style="width:${Math.round(k.s/maxK*100)}%"></div></div></div>`).join('') : '<div class="s muted">No spending this week.</div>'}</div>
    <div class="sec"><h3>Top payees</h3></div>
    <div class="card">${d.topPayees.length? d.topPayees.map(p=>`<div class="row" style="cursor:default">${avatar(p.n,'#06384f')}<div class="m"><div class="n">${escapeHtml(p.n)}</div></div><div class="amt">${sym}${store.fmt(p.s)}</div></div>`).join('') : '<div class="row" style="cursor:default"><div class="m"><div class="s">No payees yet.</div></div></div>'}</div>
    <p class="note">Caribe shows you exactly where your money goes — clearer than your bank.</p>`);
  app().querySelectorAll('[data-back]').forEach(n=>n.onclick=()=>{tab=n.dataset.back;render();});
}

export async function render(){
  if(!isLoggedIn()) return renderAuth();
  if(!store.get().user){
    try{ await store.loadAll(); }
    catch(e){ clearToken(); return renderAuth(); }
  }
  SYM = store.get().user.symbol || 'B$';
  connectStream();
  if(tab==='chats') return renderChats();
  if(tab==='moments') return renderMoments();
  if(tab==='store') return renderStore();
  if(tab==='insights') return renderInsights();
  if(tab==='sousou') return renderSousou();
  if(tab==='reserve') return renderReserve();
  if(tab==='services') return renderServices();
  if(tab==='providers') return renderProviders();
  if(tab==='orders') return renderOrders();
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
