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
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversation_messages(user_id TEXT NOT NULL,character_id TEXT NOT NULL,message_id TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,message_id));
CREATE TABLE IF NOT EXISTS conversation_state(user_id TEXT NOT NULL,character_id TEXT NOT NULL,data TEXT,last_reply_id TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id));
CREATE TABLE IF NOT EXISTS conversation_memory_items(user_id TEXT NOT NULL,character_id TEXT NOT NULL,note_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,retired_source_id TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,note_id));
CREATE TABLE IF NOT EXISTS conversation_state_events(user_id TEXT NOT NULL,character_id TEXT NOT NULL,reply_id TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,reply_id));
CREATE INDEX IF NOT EXISTS conversation_time ON conversation_messages(created_at,user_id,character_id);`);
const { createWallet, units } = require('./heartWallet');
const wallet = createWallet(sql);
function transaction(fn) {
  if (sql.isTransaction) return fn();
  sql.exec('BEGIN IMMEDIATE');
  try { const value = fn(); sql.exec('COMMIT'); return value; }
  catch (error) { sql.exec('ROLLBACK'); throw error; }
}
function getUser(id) {
  return wallet.expire(id);
}
function archiveRooms(user) {
  const insert=sql.prepare('INSERT OR IGNORE INTO conversation_messages VALUES(?,?,?,?,?)');
  for(const [characterId,room] of Object.entries(user.savedRooms||{}))for(const message of room.messages||[]){
    if(!message.id || !['user','ai'].includes(message.sender))continue;
    insert.run(user.id,characterId,String(message.id),JSON.stringify(message),Number.isFinite(message.createdAt)?message.createdAt:(room.firstMetAt||user.createdAt||0));
  }
}
function putUser(user) {
  archiveRooms(user);
  user.updatedAt = Date.now();
  sql.prepare('INSERT INTO users(id,phone,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,data=excluded.data')
    .run(user.id, user.phone || null, JSON.stringify(user));
  return user;
}
function createUser(data) {
  return transaction(() => {
    const user = { phone: null, hearts: config.defaultGuestHearts, isVipUnlimited: false, phoneBonusClaimed: false,
      unlockedMedia: {}, metCharIds: [], savedRooms: {}, matchFilter: { ages: [], traits: [], regions: [] },
      createdAt: Date.now(), ...data };
    if (getUser(user.id)) throw new Error('Account already exists');
    const amount = units(user.hearts);
    putUser({ ...user, hearts: 0 });
    wallet.create(user.id, amount, user.createdAt);
    return getUser(user.id);
  });
}
function updateUser(id, updates) {
  return transaction(() => {
    let user = getUser(id);
    if (!user) return null;
    const { hearts, ...rest } = updates;
    if (hearts !== undefined) user = wallet.change(id, units(hearts) - units(user.hearts), 'account_adjustment');
    return putUser({ ...user, ...rest, hearts: user.hearts, id: user.id });
  });
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
// Backfill currently retained chats once. Already deleted historical messages cannot be reconstructed.
if (!sql.prepare("SELECT 1 FROM metadata WHERE key='conversation_archive_v1'").get()) transaction(()=>{
  for(const row of sql.prepare('SELECT data FROM users').all())archiveRooms(JSON.parse(row.data));
  sql.prepare("INSERT INTO metadata VALUES('conversation_archive_v1',?)").run(new Date().toISOString());
});

module.exports = {
  transaction, getUser, createUser, updateUser, mergeRooms, resolveUserId,
  sql, // Internal service queries only; never expose a client SQL endpoint.
  creditHearts(id, hearts, reason) { return wallet.change(id, units(hearts), reason); },
  getHeartSummary: wallet.summary, getHeartGrants: wallet.grants,
  expireHearts: wallet.expireAll, startHeartExpiryWorker: wallet.startWorker,
  findUserByPhone(phone) { const row = sql.prepare('SELECT id FROM users WHERE phone=?').get(phone); return row ? getUser(row.id) : null; },
  linkPhone(sessionId, phone) {
    return transaction(() => {
      const guest = getUser(sessionId);
      if (!guest || (guest.phone && guest.phone !== phone)) throw new Error('Invalid account transition');
      let user = module.exports.findUserByPhone(phone);
      let bonusAwarded = false;
      if (!user) {
        user = { ...guest, id: phone, phone, phoneBonusClaimed: true,
          hearts: guest.hearts };
        // Create an empty destination wallet before moving the guest's original grants.
        putUser({ ...user, hearts: 0 });
        wallet.create(user.id, 0, Date.now());
        bonusAwarded = true;
      } else if (user.id !== sessionId) {
        user.savedRooms = mergeRooms(user.savedRooms, guest.savedRooms);
        if(guest.legalAcceptance?.acceptedAt>(user.legalAcceptance?.acceptedAt||0))user.legalAcceptance=guest.legalAcceptance;
        user.metCharIds = [...new Set([...(user.metCharIds || []), ...(guest.metCharIds || [])])];
        // Keep the existing member's balance. Guest resets cannot mint new currency.

      }
      if (user.id !== sessionId) {
        wallet.transfer(sessionId, user.id, bonusAwarded);
        sql.prepare('DELETE FROM users WHERE id=?').run(sessionId);
        sql.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?)').run(sessionId, user.id);
        sql.prepare('INSERT OR IGNORE INTO conversation_messages SELECT ?,character_id,message_id,data,created_at FROM conversation_messages WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('DELETE FROM conversation_messages WHERE user_id=?').run(sessionId);
        sql.prepare(`INSERT INTO conversation_state SELECT ?,character_id,data,last_reply_id,revision+1,updated_at FROM conversation_state WHERE user_id=?
          ON CONFLICT(user_id,character_id) DO UPDATE SET
          data=CASE WHEN excluded.updated_at>conversation_state.updated_at THEN excluded.data ELSE conversation_state.data END,
          last_reply_id=CASE WHEN excluded.updated_at>conversation_state.updated_at THEN excluded.last_reply_id ELSE conversation_state.last_reply_id END,
          revision=MAX(conversation_state.revision,excluded.revision)+1,updated_at=MAX(conversation_state.updated_at,excluded.updated_at)`).run(user.id,sessionId);
        sql.prepare('DELETE FROM conversation_state WHERE user_id=?').run(sessionId);
        sql.prepare('INSERT OR IGNORE INTO conversation_memory_items SELECT ?,character_id,note_id,kind,data,active,retired_source_id,created_at FROM conversation_memory_items WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('DELETE FROM conversation_memory_items WHERE user_id=?').run(sessionId);
        sql.prepare('INSERT OR IGNORE INTO conversation_state_events SELECT ?,character_id,reply_id,data,created_at FROM conversation_state_events WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('DELETE FROM conversation_state_events WHERE user_id=?').run(sessionId);
        require('./proactiveStore').transfer(sessionId,user.id);
        require('./legalService');
        sql.prepare('UPDATE legal_acceptance_events SET user_id=? WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('UPDATE ledger SET user_id=? WHERE user_id=?').run(user.id, sessionId);
        sql.prepare('UPDATE chat_requests SET user_id=? WHERE user_id=?').run(user.id, sessionId);
      }
      user.hearts = getUser(user.id).hearts;
      putUser(user);
      if (bonusAwarded) wallet.change(user.id, units(config.phoneAuthBonusHearts), 'phone_bonus');
      return { user: getUser(user.id), bonusAwarded };
    });
  },
  debit(id, cost, reason) {
    const amount = units(cost);
    return transaction(() => {
      const user = getUser(id);
      if (!user || (!user.isVipUnlimited && units(user.hearts) < amount)) return null;
      if (user.isVipUnlimited) return user;
      try { return wallet.change(id, -amount, reason); }
      catch (error) { if (error.code === 'INSUFFICIENT_HEARTS') return null; throw error; }
    });
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
  getConversationState(id,characterId) {
    const row=sql.prepare('SELECT * FROM conversation_state WHERE user_id=? AND character_id=?').get(resolveUserId(id),characterId);
    return row?{memory:row.data?JSON.parse(row.data):null,revision:row.revision,lastReplyId:row.last_reply_id}:{memory:null,revision:0,lastReplyId:null};
  },
  saveConversationState(id,characterId,memory,replyId,expectedRevision) {
    id=resolveUserId(id);
    if(module.exports.getConversationState(id,characterId).revision!==expectedRevision)throw Error('CONVERSATION_CHANGED');
    const now=Date.now();
    for(const [kind,notes]of Object.entries(memory.addedNotes||{}))for(const note of notes)
      sql.prepare('INSERT OR IGNORE INTO conversation_memory_items VALUES(?,?,?,?,?,1,NULL,?)').run(id,characterId,note.id,kind,JSON.stringify(note),now);
    for(const note of memory.retirements||[])sql.prepare('UPDATE conversation_memory_items SET active=0,retired_source_id=? WHERE user_id=? AND character_id=? AND note_id=?').run(note.sourceId,id,characterId,note.memoryId);
    sql.prepare('INSERT INTO conversation_state_events VALUES(?,?,?,?,?)').run(id,characterId,replyId,JSON.stringify({summary:memory.summary,state:memory.state}),now);
    const {addedNotes,retirements,...saved}=memory;
    sql.prepare(`INSERT INTO conversation_state VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,character_id)
      DO UPDATE SET data=excluded.data,last_reply_id=excluded.last_reply_id,revision=excluded.revision,updated_at=excluded.updated_at`)
      .run(id,characterId,JSON.stringify(saved),replyId,expectedRevision+1,now);
  },
  getConversationNotes(id,characterId) {
    return sql.prepare('SELECT kind,data FROM conversation_memory_items WHERE user_id=? AND character_id=? AND active=1 ORDER BY created_at DESC LIMIT 1000').all(resolveUserId(id),characterId).map(row=>({...JSON.parse(row.data),kind:row.kind}));
  },
  getConversationSources(id,characterId,sourceIds) {
    return [...new Set(sourceIds)].slice(0,100).map(sourceId=>sql.prepare('SELECT data FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(resolveUserId(id),characterId,sourceId)).filter(Boolean).map(row=>JSON.parse(row.data)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  },
  getConversationStateHistory(id,characterId) {
    return sql.prepare('SELECT reply_id,data,created_at FROM conversation_state_events WHERE user_id=? AND character_id=? ORDER BY created_at DESC LIMIT 200').all(resolveUserId(id),characterId).map(row=>({replyId:row.reply_id,...JSON.parse(row.data),createdAt:new Date(row.created_at).toISOString()}));
  },
  resetConversationState(id,characterId) {
    require('./proactiveStore').cancelRoom(resolveUserId(id),characterId);
    const state=module.exports.getConversationState(id,characterId);
    sql.prepare('DELETE FROM conversation_memory_items WHERE user_id=? AND character_id=?').run(resolveUserId(id),characterId);
    sql.prepare('DELETE FROM conversation_state_events WHERE user_id=? AND character_id=?').run(resolveUserId(id),characterId);
    sql.prepare(`INSERT INTO conversation_state VALUES(?,?,NULL,NULL,?,?) ON CONFLICT(user_id,character_id)
      DO UPDATE SET data=NULL,last_reply_id=NULL,revision=excluded.revision,updated_at=excluded.updated_at`)
      .run(resolveUserId(id),characterId,state.revision+1,Date.now());
  },
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
      const ads=require('./advertisingService');ads.linkAccount(sessionId,result.user);ads.record(result.user.id,'sign_up',result.user.id);
      sql.exec('COMMIT');
      return result;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
  createOrder(order) { const data = { ...order, status: 'pending', createdAt: Date.now() }; sql.prepare('INSERT INTO orders VALUES(?,?)').run(order.id, JSON.stringify(data)); return data; },
  getOrder(id) { const row = sql.prepare('SELECT data FROM orders WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; },
  updateOrder(id, updates) { const order = module.exports.getOrder(id); if (!order) return null; Object.assign(order, updates); sql.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), id); return order; }
};
