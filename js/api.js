// api.js (client) — talks to the real Caribe backend.
const TOKEN_KEY = 'caribe.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const isLoggedIn = () => !!getToken();
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));

async function request(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers['authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) { clearToken(); }
  if (!res.ok) {
    const e = new Error(data.message || data.error || ('HTTP ' + res.status));
    e.code = data.error; e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  register: (b) => request('POST', '/register', b),
  login:    (b) => request('POST', '/login', b),
  me:       ()  => request('GET',  '/me'),
  directory:()  => request('GET',  '/directory'),
  transactions: () => request('GET', '/transactions'),
  summary:  ()  => request('GET',  '/summary'),
  transfer: (b) => request('POST', '/transfer', b),
  pay:      (b) => request('POST', '/pay', b),
  bill:     (b) => request('POST', '/bill', b),
  cashin:   (b) => request('POST', '/cashin', b),
  cashout:  (b) => request('POST', '/cashout', b),
  health:   ()  => request('GET',  '/health'),
  fees:     ()  => request('GET',  '/fees'),
  islands:  ()  => request('GET',  '/islands'),
  demo:     ()  => request('POST', '/demo'),
  kycDocument: (b) => request('POST', '/kyc/document', b),
  chatStart:    (b) => request('POST', '/chat/start', b),
  chatGroup:    (b) => request('POST', '/chat/group', b),
  chatList:     ()  => request('GET',  '/chat/list'),
  chatMessages: (convId, after = 0) => request('GET', '/chat/messages?conversationId=' + encodeURIComponent(convId) + '&after=' + after),
  chatSend:     (b) => request('POST', '/chat/send', b),
  chatMedia:    (b) => request('POST', '/chat/media', b),
  chatRead:     (b) => request('POST', '/chat/read', b),
  chatMoney:    (b) => request('POST', '/chat/money', b),
  feed:         ()  => request('GET',  '/feed'),
  feedPost:     (b) => request('POST', '/feed/post', b),
  feedLike:     (b) => request('POST', '/feed/like', b),
  feedComment:  (b) => request('POST', '/feed/comment', b),
  products:     (merchant) => request('GET', '/products?merchant=' + encodeURIComponent(merchant)),
  productAdd:   (b) => request('POST', '/products/add', b),
  buyProduct:   (b) => request('POST', '/products/buy', b),
  insights:     ()  => request('GET',  '/insights'),
  sousouList:   ()  => request('GET',  '/sousou/list'),
  sousouCreate: (b) => request('POST', '/sousou/create', b),
  sousouContribute: (b) => request('POST', '/sousou/contribute', b),
  reserve:      ()  => request('GET',  '/reserve'),
  requestMoney: (b) => request('POST', '/request', b),
  splitBill:    (b) => request('POST', '/split', b),
  requests:     ()  => request('GET',  '/requests'),
  payRequest:   (b) => request('POST', '/requests/pay', b),
  declineRequest:(b)=> request('POST', '/requests/decline', b),
  callConfig:   ()  => request('GET',  '/call/config'),
  callSignal:   (b) => request('POST', '/call/signal', b),
};
export const chatStreamUrl = () => '/api/chat/stream?token=' + encodeURIComponent(getToken() || '');
