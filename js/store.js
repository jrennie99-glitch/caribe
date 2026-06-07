// store.js (client) — in-memory cache populated from the real backend.
import { api } from './api.js';

let state = { user: null, contacts: [], merchants: [], billers: [], txns: [] };

export const get = () => state;
export const balance = () => state.user?.balance ?? 0;
export const fmt = (cents) => ((cents||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export async function loadAll() {
  const [{ user }, dir, tx] = await Promise.all([api.me(), api.directory(), api.transactions()]);
  state.user = user;
  state.contacts = dir.contacts; state.merchants = dir.merchants; state.billers = dir.billers;
  state.txns = tx.transactions;
  if (typeof tx.balance === 'number') state.user.balance = tx.balance;
  return state;
}

// Refresh balance + history after a money operation.
export async function refresh() {
  const [{ user }, tx] = await Promise.all([api.me(), api.transactions()]);
  state.user = user; state.txns = tx.transactions;
  state.user.balance = tx.balance;
  return state;
}

export function setUser(u) { state.user = u; }
export function clear() { state = { user: null, contacts: [], merchants: [], billers: [], txns: [] }; }
