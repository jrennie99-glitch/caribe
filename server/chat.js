// chat.js — real messaging: conversations, messages, and a real-time SSE hub.
import { db, uuid, now } from './db.js';

// ---------- real-time hub (Server-Sent Events) ----------
const streams = new Map(); // accountId -> Set<res>
export function subscribe(accountId, res) {
  if (!streams.has(accountId)) streams.set(accountId, new Set());
  streams.get(accountId).add(res);
}
export function unsubscribe(accountId, res) {
  const set = streams.get(accountId);
  if (set) { set.delete(res); if (!set.size) streams.delete(accountId); }
}
function pushTo(accountId, event) {
  const set = streams.get(accountId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch {} }
}

const acctName = (id) => db.prepare(`SELECT name,color,handle,currency FROM accounts WHERE id=?`).get(id) || {};

// relay a WebRTC signaling event to a specific account's live stream(s)
export function relayCall(toAccount, event) { pushTo(toAccount, { type: 'call', ...event }); }

export function isMember(convId, accountId) {
  return !!db.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id=? AND account_id=?`).get(convId, accountId);
}
export function memberAccounts(convId) {
  return db.prepare(`SELECT account_id FROM conversation_members WHERE conversation_id=?`).all(convId).map(r => r.account_id);
}

export function directConversation(a, b) {
  const row = db.prepare(`
    SELECT c.id FROM conversations c
    WHERE c.kind='direct'
      AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id=c.id)=2
      AND EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND account_id=?)
      AND EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND account_id=?)
    LIMIT 1`).get(a, b);
  if (row) return row.id;
  const id = 'conv_' + uuid().slice(0, 12), t = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO conversations (id,kind,title,created_at) VALUES (?,?,?,?)`).run(id, 'direct', null, t);
    const ins = db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id,account_id,last_read_ts) VALUES (?,?,0)`);
    ins.run(id, a); ins.run(id, b);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return id;
}

export function createGroup(title, memberIds, creator) {
  const id = 'conv_' + uuid().slice(0, 12), t = now();
  const all = Array.from(new Set([creator, ...memberIds]));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO conversations (id,kind,title,created_at) VALUES (?,?,?,?)`).run(id, 'group', title || 'Group', t);
    const ins = db.prepare(`INSERT OR IGNORE INTO conversation_members (conversation_id,account_id,last_read_ts) VALUES (?,?,0)`);
    for (const m of all) ins.run(id, m);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return id;
}

function shapeMessage(m) {
  const s = acctName(m.sender_account);
  return {
    id: m.id, conversationId: m.conversation_id, senderAccount: m.sender_account,
    senderName: s.name, kind: m.kind, body: m.body, txnId: m.txn_id,
    amount: m.amount_cents, ts: m.created_at,
  };
}

export function send(convId, senderAccount, { kind = 'text', body = null, txnId = null, amountCents = null }) {
  const id = 'msg_' + uuid().slice(0, 12), t = now();
  db.prepare(`INSERT INTO messages (id,conversation_id,sender_account,kind,body,txn_id,amount_cents,created_at)
              VALUES (?,?,?,?,?,?,?,?)`).run(id, convId, senderAccount, kind, body, txnId, amountCents, t);
  const row = db.prepare(`SELECT * FROM messages WHERE id=?`).get(id);
  const msg = shapeMessage(row);
  // mark sender as read up to this message; push to all members in real time
  db.prepare(`UPDATE conversation_members SET last_read_ts=? WHERE conversation_id=? AND account_id=?`).run(t, convId, senderAccount);
  for (const acct of memberAccounts(convId)) pushTo(acct, { type: 'message', conversationId: convId, message: msg });
  return msg;
}

export function messages(convId, afterTs = 0, limit = 300) {
  return db.prepare(`SELECT * FROM messages WHERE conversation_id=? AND created_at > ? ORDER BY created_at ASC LIMIT ?`)
    .all(convId, afterTs, limit).map(shapeMessage);
}

export function markRead(convId, accountId) {
  db.prepare(`UPDATE conversation_members SET last_read_ts=? WHERE conversation_id=? AND account_id=?`).run(now(), convId, accountId);
}

export function listConversations(accountId) {
  const convs = db.prepare(`
    SELECT c.id, c.kind, c.title, cm.last_read_ts
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
    WHERE cm.account_id=?`).all(accountId);
  const out = convs.map(c => {
    const last = db.prepare(`SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1`).get(c.id);
    const unread = db.prepare(`SELECT COUNT(*) n FROM messages WHERE conversation_id=? AND created_at>? AND sender_account!=?`)
      .get(c.id, c.last_read_ts, accountId).n;
    let title = c.title, color = '#16a7c9', handle = null, peerAccount = null;
    if (c.kind === 'direct') {
      const peer = memberAccounts(c.id).find(a => a !== accountId);
      const p = peer ? acctName(peer) : {};
      title = p.name || 'Unknown'; color = p.color || '#16a7c9'; handle = p.handle; peerAccount = peer;
    }
    return {
      id: c.id, kind: c.kind, title, color, handle, peerAccount, unread,
      last: last ? shapeMessage(last) : null,
      lastTs: last ? last.created_at : c.last_read_ts,
    };
  });
  out.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  return out;
}
