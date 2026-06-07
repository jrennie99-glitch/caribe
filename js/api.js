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
  kycDocument: (b) => request('POST', '/kyc/document', b),
};
