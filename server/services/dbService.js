const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const sqliteFile = config.sqliteFile;
fs.mkdirSync(path.dirname(sqliteFile), { recursive: true, mode: 0o700 });
const sql = new DatabaseSync(sqliteFile);
sql.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aliases (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS otp_challenges (
 id TEXT PRIMARY KEY, phone TEXT NOT NULL, session_id TEXT NOT NULL, ip TEXT NOT NULL,
 digest TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, provider_id TEXT);
CREATE INDEX IF NOT EXISTS otp_phone_time ON otp_challenges(phone,created_at);
CREATE INDEX IF NOT EXISTS otp_ip_time ON otp_challenges(ip,created_at);
CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL,
 delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chat_requests (user_id TEXT NOT NULL, request_id TEXT NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
function transaction(fn) {
  if (sql.isTransaction) return fn();
  sql.exec('BEGIN IMMEDIATE');
  try { const value = fn(); sql.exec('COMMIT'); return value; }
  catch (error) { sql.exec('ROLLBACK'); throw error; }
}
function getUser(id) {
  const row = sql.prepare('SELECT data FROM users WHERE id=?').get(id);
  return row ? JSON.parse(row.data) : null;
}
function putUser(user) {
  user.updatedAt = Date.now();
  sql.prepare('INSERT INTO users(id,phone,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,data=excluded.data')
    .run(user.id, user.phone || null, JSON.stringify(user));
  return user;
}
function createUser(data) {
  const user = { phone: null, hearts: config.defaultGuestHearts, isVipUnlimited: false, phoneBonusClaimed: false,
    unlockedMedia: {}, metCharIds: [], savedRooms: {}, matchFilter: { ages: [], traits: [], regions: [] },
    createdAt: Date.now(), ...data };
  if (getUser(user.id)) throw new Error('Account already exists');
  putUser(user);
  sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(user.id, Math.round(user.hearts * 10), 'initial', Date.now());
  return user;
}
function updateUser(id, updates) {
  const user = getUser(id);
  return user ? putUser({ ...user, ...updates, id: user.id }) : null;
}
function resolveUserId(id) {
  return sql.prepare('SELECT new_id FROM aliases WHERE old_id=?').get(id)?.new_id || id;
}
function mergeRooms(left = {}, right = {}) {
  const out = { ...left };
  for (const [id, room] of Object.entries(right)) {
    const prev = out[id] || {};
    const messages = new Map((prev.messages || []).map(m => [m.id, m]));
    for (const m of room.messages || []) {
      // A previously saved message is immutable; later snapshots cannot rewrite it.
      if (!messages.has(m.id)) messages.set(m.id, m);
      else if (m.unread === false) messages.set(m.id, { ...messages.get(m.id), unread: false });
    }
    out[id] = { ...prev, ...room, messages: [...messages.values()].sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0)) };
  }
  return out;
}
// Migration is atomic, and never overwrites a database once imported.
if (!sql.prepare("SELECT value FROM metadata WHERE key='json_imported'").get()) {
  transaction(() => {
    if (fs.existsSync(config.databaseFile)) {
      const legacy = JSON.parse(fs.readFileSync(config.databaseFile, 'utf8'));
      for (const user of Object.values(legacy.users || {})) {
        if (!getUser(user.id)) createUser(user);
      }
      for (const order of Object.values(legacy.orders || {})) sql.prepare('INSERT OR IGNORE INTO orders VALUES(?,?)').run(order.id, JSON.stringify(order));
    }
    sql.prepare('INSERT INTO metadata VALUES(?,?)').run('json_imported', new Date().toISOString());
  });
}
module.exports = {
  transaction, getUser, createUser, updateUser, mergeRooms, resolveUserId,
  findUserByPhone(phone) { const row = sql.prepare('SELECT data FROM users WHERE phone=?').get(phone); return row ? JSON.parse(row.data) : null; },
  linkPhone(sessionId, phone) {
    return transaction(() => {
      const guest = getUser(sessionId);
      if (!guest || (guest.phone && guest.phone !== phone)) throw new Error('Invalid account transition');
      let user = module.exports.findUserByPhone(phone);
      let bonusAwarded = false;
      if (!user) {
        user = { ...guest, id: phone, phone, phoneBonusClaimed: true,
          hearts: Math.round((guest.hearts + config.phoneAuthBonusHearts) * 10) / 10 };
        bonusAwarded = true;
      } else if (user.id !== sessionId) {
        user.savedRooms = mergeRooms(user.savedRooms, guest.savedRooms);
        user.metCharIds = [...new Set([...(user.metCharIds || []), ...(guest.metCharIds || [])])];
        // Keep the existing member's balance. Guest resets cannot mint new currency.
        sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(sessionId, -Math.round(guest.hearts * 10), 'guest_balance_not_transferred', Date.now());
      }
      if (user.id !== sessionId) {
        sql.prepare('DELETE FROM users WHERE id=?').run(sessionId);
        sql.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?)').run(sessionId, user.id);
        sql.prepare('UPDATE ledger SET user_id=? WHERE user_id=?').run(user.id, sessionId);
        sql.prepare('UPDATE chat_requests SET user_id=? WHERE user_id=?').run(user.id, sessionId);
      }
      putUser(user);
      if (bonusAwarded) sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(user.id, Math.round(config.phoneAuthBonusHearts * 10), 'phone_bonus', Date.now());
      return { user, bonusAwarded };
    });
  },
  debit(id, cost, reason) {
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Invalid cost');
    const user = getUser(id);
    if (!user || (!user.isVipUnlimited && user.hearts < cost)) return null;
    if (!user.isVipUnlimited) {
      user.hearts = (Math.round(user.hearts * 10) - Math.round(cost * 10)) / 10;
      putUser(user);
      sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(id, -Math.round(cost * 10), reason, Date.now());
    }
    return user;
  },
  appendMessages(id, characterId, messages) {
    id = resolveUserId(id);
    const user = getUser(id);
    if (!user) throw new Error('Account no longer exists');
    const rooms = mergeRooms(user.savedRooms, { [characterId]: { charId: characterId, messages, updatedAt: Date.now() } });
    return updateUser(id, { savedRooms: rooms });
  },
  getChatRequest(id, requestId) {
    const row = sql.prepare('SELECT data FROM chat_requests WHERE user_id=? AND request_id=?').get(resolveUserId(id), requestId);
    return row ? JSON.parse(row.data) : null;
  },
  saveChatRequest(id, requestId, data) { sql.prepare('INSERT OR REPLACE INTO chat_requests VALUES(?,?,?)').run(resolveUserId(id), requestId, JSON.stringify(data)); },
  reserveOtp(challenge) {
    return transaction(() => {
      const now = Date.now();
      const recent = sql.prepare('SELECT created_at FROM otp_challenges WHERE phone=? ORDER BY created_at DESC LIMIT 1').get(challenge.phone);
      if (recent && now - recent.created_at < 60000) return 'cooldown';
      const phoneCount = sql.prepare('SELECT count(*) n FROM otp_challenges WHERE phone=? AND created_at>?').get(challenge.phone, now - 86400000).n;
      const ipCount = sql.prepare('SELECT count(*) n FROM otp_challenges WHERE ip=? AND created_at>?').get(challenge.ip, now - 86400000).n;
      if (phoneCount >= 5 || ipCount >= 20) return 'limit';
      sql.prepare("UPDATE otp_challenges SET status='superseded' WHERE phone=? AND session_id=? AND status IN ('pending','sent')").run(challenge.phone, challenge.sessionId);
      sql.prepare('INSERT INTO otp_challenges(id,phone,session_id,ip,digest,expires_at,created_at,status) VALUES(?,?,?,?,?,?,?,?)')
        .run(challenge.id, challenge.phone, challenge.sessionId, challenge.ip, challenge.digest, now + 300000, now, 'pending');
      sql.prepare('DELETE FROM otp_challenges WHERE created_at<?').run(now - 7 * 86400000);
      return 'ok';
    });
  },
  markOtp(id, status, providerId = '') { sql.prepare('UPDATE otp_challenges SET status=?, provider_id=? WHERE id=?').run(status, String(providerId), id); },
  verifyOtp(id, phone, sessionId, digest) {
    // Consume the challenge and bind the account in a single transaction.
    sql.exec('BEGIN IMMEDIATE');
    try {
      const row = sql.prepare('SELECT * FROM otp_challenges WHERE id=? AND phone=? AND session_id=?').get(id, phone, sessionId);
      if (!row || row.status !== 'sent' || row.expires_at < Date.now() || row.attempts >= 5) { sql.exec('COMMIT'); return false; }
      sql.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?').run(id);
      if (row.digest !== digest) { sql.exec('COMMIT'); return false; }
      sql.prepare("UPDATE otp_challenges SET status='consumed',digest='' WHERE id=?").run(id);
      const result = module.exports.linkPhone(sessionId, phone);
      sql.exec('COMMIT');
      return result;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
  createOrder(order) { const data = { ...order, status: 'pending', createdAt: Date.now() }; sql.prepare('INSERT INTO orders VALUES(?,?)').run(order.id, JSON.stringify(data)); return data; },
  getOrder(id) { const row = sql.prepare('SELECT data FROM orders WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; },
  updateOrder(id, updates) { const order = module.exports.getOrder(id); if (!order) return null; Object.assign(order, updates); sql.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), id); return order; }
};
