const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const sqliteFile = config.sqliteFile;
fs.mkdirSync(path.dirname(sqliteFile), { recursive: true, mode: 0o700 });
const sql = new DatabaseSync(sqliteFile);
sql.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_message_versions(user_id TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 0);
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
CREATE TABLE IF NOT EXISTS archive_message_refs(user_id TEXT NOT NULL,character_id TEXT NOT NULL,message_id TEXT NOT NULL,object_key TEXT NOT NULL,entry_index INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,message_id));
CREATE TABLE IF NOT EXISTS archive_objects(object_key TEXT PRIMARY KEY,sha256 TEXT NOT NULL,message_count INTEGER NOT NULL,verified_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS conversation_state(user_id TEXT NOT NULL,character_id TEXT NOT NULL,data TEXT,last_reply_id TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id));
CREATE TABLE IF NOT EXISTS conversation_memory_items(user_id TEXT NOT NULL,character_id TEXT NOT NULL,note_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,retired_source_id TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,note_id));
CREATE TABLE IF NOT EXISTS conversation_state_events(user_id TEXT NOT NULL,character_id TEXT NOT NULL,reply_id TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,reply_id));
CREATE TABLE IF NOT EXISTS match_recommendations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, character_id TEXT NOT NULL, mode TEXT NOT NULL, filter_applied TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS match_rec_time ON match_recommendations(created_at);
CREATE INDEX IF NOT EXISTS conversation_message_lookup ON conversation_messages(user_id,message_id);
CREATE INDEX IF NOT EXISTS chat_closed_replies ON chat_requests(user_id,json_extract(data,'$.replyId')) WHERE json_extract(data,'$.roomLeft')=1 AND json_extract(data,'$.success')=1;
CREATE INDEX IF NOT EXISTS conversation_time ON conversation_messages(created_at,user_id,character_id);
CREATE TABLE IF NOT EXISTS device_profiles (device_id TEXT PRIMARY KEY, current_user_id TEXT NOT NULL, initial_user_id TEXT NOT NULL, welcome_granted INTEGER NOT NULL DEFAULT 1, ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS device_profiles_current_user ON device_profiles(current_user_id);
CREATE TABLE IF NOT EXISTS user_acquisitions (
  user_id TEXT PRIMARY KEY,
  device_id TEXT,
  utm_source TEXT NOT NULL DEFAULT 'direct',
  utm_medium TEXT NOT NULL DEFAULT 'none',
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  referrer TEXT,
  landing_path TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_acq_source ON user_acquisitions(utm_source, created_at);
CREATE INDEX IF NOT EXISTS user_acq_campaign ON user_acquisitions(utm_campaign, created_at);
CREATE INDEX IF NOT EXISTS user_acq_time ON user_acquisitions(created_at);
CREATE TABLE IF NOT EXISTS site_visits (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  user_id TEXT,
  utm_source TEXT NOT NULL DEFAULT 'direct',
  utm_medium TEXT NOT NULL DEFAULT 'none',
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  referrer TEXT,
  landing_path TEXT,
  bounced INTEGER NOT NULL DEFAULT 1,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS site_visits_source ON site_visits(utm_source, created_at);
CREATE INDEX IF NOT EXISTS site_visits_campaign ON site_visits(utm_campaign, created_at);
CREATE INDEX IF NOT EXISTS site_visits_time ON site_visits(created_at);
CREATE INDEX IF NOT EXISTS site_visits_device ON site_visits(device_id);`);
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
    if(!message.id || !['user','ai','system'].includes(message.sender))continue;
    const result=insert.run(user.id,characterId,String(message.id),JSON.stringify(message),Number.isFinite(message.createdAt)?message.createdAt:(room.firstMetAt||user.createdAt||0));
    if(result.changes)sql.prepare('INSERT INTO account_message_versions VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1').run(user.id);
  }
}
function putUser(user) {
  archiveRooms(user);
  user.savedRooms=Object.fromEntries(Object.entries(user.savedRooms||{}).map(([id,room])=>[id,{...room,messages:(room.messages||[]).slice(-120)}]));
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
      if (!m || !m.id) continue;
      // A previously saved message is immutable; later snapshots cannot rewrite it.
      if (messages.has(m.id)) {
        if (m.unread === false) messages.set(m.id, { ...messages.get(m.id), unread: false });
        continue;
      }
      // Deduplicate replyId vs replyId_0 variant for AI messages
      if (m.sender === 'ai' && typeof m.text === 'string') {
        const baseId = m.id.replace(/_\d+$/, '');
        if (baseId !== m.id && messages.has(baseId)) {
          const existing = messages.get(baseId);
          if (existing.sender === 'ai' && existing.text === m.text) continue;
        }
        const suffixedId = m.id + '_0';
        if (messages.has(suffixedId)) {
          const existing = messages.get(suffixedId);
          if (existing.sender === 'ai' && existing.text === m.text) {
            messages.delete(suffixedId);
          }
        }
      }
      messages.set(m.id, m);
    }
    out[id] = { ...prev, ...room, roomLeft: Boolean(prev.roomLeft || room.roomLeft), messages: [...messages.values()].sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0)) };
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
        if (guest.acquisition && !user.acquisition) user.acquisition = guest.acquisition;
        // Keep the existing member's balance. Guest resets cannot mint new currency.

      }
      if (user.id !== sessionId) {
        wallet.transfer(sessionId, user.id, bonusAwarded);
        sql.prepare('DELETE FROM users WHERE id=?').run(sessionId);
        sql.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?)').run(sessionId, user.id);
        sql.prepare('INSERT OR IGNORE INTO conversation_messages SELECT ?,character_id,message_id,data,created_at FROM conversation_messages WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('DELETE FROM conversation_messages WHERE user_id=?').run(sessionId);
        sql.prepare('INSERT OR IGNORE INTO archive_message_refs SELECT ?,character_id,message_id,object_key,entry_index FROM archive_message_refs WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('DELETE FROM archive_message_refs WHERE user_id=?').run(sessionId);
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
        require('./aiReports').transfer(sessionId,user.id);
        require('./proactiveStore').transfer(sessionId,user.id);
        require('./wellbeingService').transfer(sessionId,user.id);
        require('./legalService');
        sql.prepare('UPDATE legal_acceptance_events SET user_id=? WHERE user_id=?').run(user.id,sessionId);
        sql.prepare('UPDATE ledger SET user_id=? WHERE user_id=?').run(user.id, sessionId);
        sql.prepare('UPDATE chat_requests SET user_id=? WHERE user_id=?').run(user.id, sessionId);
        sql.prepare('UPDATE device_profiles SET current_user_id=?, updated_at=? WHERE current_user_id=?').run(user.id, Date.now(), sessionId);
        sql.prepare('UPDATE site_visits SET user_id=? WHERE user_id=?').run(user.id, sessionId);
        sql.prepare(`INSERT INTO user_acquisitions(user_id,device_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,referrer,landing_path,ip,user_agent,created_at)
          SELECT ?,device_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,referrer,landing_path,ip,user_agent,created_at FROM user_acquisitions WHERE user_id=?
          ON CONFLICT(user_id) DO UPDATE SET
            utm_source=CASE WHEN user_acquisitions.utm_source='direct' AND excluded.utm_source!='direct' THEN excluded.utm_source ELSE user_acquisitions.utm_source END,
            utm_medium=CASE WHEN user_acquisitions.utm_source='direct' AND excluded.utm_source!='direct' THEN excluded.utm_medium ELSE user_acquisitions.utm_medium END,
            utm_campaign=coalesce(user_acquisitions.utm_campaign,excluded.utm_campaign),
            utm_content=coalesce(user_acquisitions.utm_content,excluded.utm_content),
            utm_term=coalesce(user_acquisitions.utm_term,excluded.utm_term),
            referrer=coalesce(user_acquisitions.referrer,excluded.referrer),
            landing_path=coalesce(user_acquisitions.landing_path,excluded.landing_path)
        `).run(user.id, sessionId);
        sql.prepare('DELETE FROM user_acquisitions WHERE user_id=?').run(sessionId);
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
  async getConversationSources(id,characterId,sourceIds) {
    const rows=[...new Set(sourceIds)].slice(0,100).map(sourceId=>sql.prepare('SELECT * FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(resolveUserId(id),characterId,sourceId)).filter(Boolean);
    return (await require('./conversationArchive').hydrateRows(rows)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
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
  updateOrder(id, updates) { const order = module.exports.getOrder(id); if (!order) return null; Object.assign(order, updates); sql.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), id); return order; },
  recordMatchRecommendation(userId, characterId, mode, filterApplied = {}) {
    try {
      const crypto = require('node:crypto');
      const id = 'mrec_' + crypto.randomUUID();
      sql.prepare('INSERT INTO match_recommendations(id, user_id, character_id, mode, filter_applied, created_at) VALUES(?,?,?,?,?,?)')
        .run(id, resolveUserId(userId), characterId, mode, JSON.stringify(filterApplied || {}), Date.now());
      return id;
    } catch (e) {
      console.warn('[db] recordMatchRecommendation failed:', e.message);
      return null;
    }
  },
  getCharacterTurnStats(days = 30) {
    try {
      const since = days > 0 ? Date.now() - days * 86400000 : 0;
      const rows = sql.prepare(`
        SELECT character_id,
               count(*) as total_messages,
               sum(json_extract(data, '$.sender') = 'user') as user_turns,
               count(DISTINCT user_id) as unique_users
        FROM conversation_messages
        WHERE created_at >= ? AND json_extract(data,'$.sender') IN ('user','ai')
        GROUP BY character_id
      `).all(since);
      const stats = {};
      for (const r of rows) {
        stats[r.character_id] = {
          totalMessages: Number(r.total_messages) || 0,
          userTurns: Number(r.user_turns) || 0,
          uniqueUsers: Number(r.unique_users) || 0
        };
      }
      return stats;
    } catch {
      return {};
    }
  },
  getMatchingBanditStats(days = 30) {
    try {
      const since = days > 0 ? Date.now() - days * 86400000 : 0;
      const totalRow = sql.prepare(`
        SELECT count(*) as total,
               sum(mode = 'popular_exploitation') as popular,
               sum(mode = 'cold_exploration') as cold
        FROM match_recommendations
        WHERE created_at >= ?
      `).get(since);

      const total = Number(totalRow?.total) || 0;
      const popular = Number(totalRow?.popular) || 0;
      const cold = Number(totalRow?.cold) || 0;

      const recs = sql.prepare(`
        SELECT character_id, mode, count(*) as count
        FROM match_recommendations
        WHERE created_at >= ?
        GROUP BY character_id, mode
        ORDER BY count DESC
      `).all(since);

      return {
        total,
        popular,
        cold,
        popularRatio: total > 0 ? Math.round((popular / total) * 1000) / 10 : 70.0,
        coldRatio: total > 0 ? Math.round((cold / total) * 1000) / 10 : 30.0,
        recentRecommendations: recs
      };
    } catch {
      return { total: 0, popular: 0, cold: 0, popularRatio: 70.0, coldRatio: 30.0, recentRecommendations: [] };
    }
  },
  getDeviceProfile(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return null;
    return sql.prepare('SELECT * FROM device_profiles WHERE device_id=?').get(deviceId) || null;
  },
  findExistingGuestByDeviceOrIp(deviceId, ip, userAgent) {
    if (deviceId) {
      const profile = sql.prepare('SELECT current_user_id FROM device_profiles WHERE device_id=?').get(deviceId);
      if (profile) {
        const u = getUser(profile.current_user_id);
        if (u && !u.phone) return u;
      }
    }
    // 로컬 루프백 테스트가 아닌 실제 외부 IP인 경우 동일 IP+UA로 최근 24시간 내 기존 게스트 조회
    if (ip && typeof ip === 'string' && ip !== '127.0.0.1' && ip !== '::1') {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const row = sql.prepare(`
        SELECT current_user_id FROM device_profiles
        WHERE ip=? AND (user_agent=? OR user_agent IS NULL) AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).get(ip, userAgent || '', oneDayAgo);
      if (row) {
        const u = getUser(row.current_user_id);
        if (u && !u.phone) return u;
      }
    }
    return null;
  },
  hasWelcomeGrantedForIpOrDevice(deviceId, ip, userAgent) {
    if (deviceId) {
      const dev = sql.prepare('SELECT welcome_granted FROM device_profiles WHERE device_id=?').get(deviceId);
      if (dev && dev.welcome_granted) return true;
    }
    if (ip && typeof ip === 'string' && ip !== '127.0.0.1' && ip !== '::1') {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const ipMatch = sql.prepare(`
        SELECT welcome_granted FROM device_profiles
        WHERE ip=? AND welcome_granted=1 AND created_at > ?
        LIMIT 1
      `).get(ip, oneDayAgo);
      if (ipMatch) return true;
    }
    return false;
  },
  bindDeviceProfile(deviceId, userId, { ip, userAgent, welcomeGranted = 1 } = {}) {
    if (!deviceId || typeof deviceId !== 'string' || !userId) return;
    const now = Date.now();
    sql.prepare(`
      INSERT INTO device_profiles(device_id, current_user_id, initial_user_id, welcome_granted, ip, user_agent, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(device_id) DO UPDATE SET
        current_user_id=excluded.current_user_id,
        ip=coalesce(excluded.ip, device_profiles.ip),
        user_agent=coalesce(excluded.user_agent, device_profiles.user_agent),
        updated_at=excluded.updated_at
    `).run(deviceId, userId, userId, welcomeGranted ? 1 : 0, ip || null, userAgent || null, now, now);
  },
  updateDeviceUser(oldUserId, newUserId) {
    if (!oldUserId || !newUserId) return;
    sql.prepare('UPDATE device_profiles SET current_user_id=?, updated_at=? WHERE current_user_id=?')
      .run(newUserId, Date.now(), oldUserId);
  },
  saveAcquisition(userId, acq = {}, extra = {}) {
    if (!userId) return null;
    userId = resolveUserId(userId);
    const now = Date.now();
    const source = String(acq.source || acq.utm_source || 'direct').trim().slice(0, 100) || 'direct';
    const medium = String(acq.medium || acq.utm_medium || (source === 'direct' ? 'none' : 'referral')).trim().slice(0, 100) || 'none';
    const campaign = acq.campaign || acq.utm_campaign ? String(acq.campaign || acq.utm_campaign).trim().slice(0, 150) : null;
    const content = acq.content || acq.utm_content ? String(acq.content || acq.utm_content).trim().slice(0, 150) : null;
    const term = acq.term || acq.utm_term ? String(acq.term || acq.utm_term).trim().slice(0, 150) : null;
    const fbclid = acq.fbclid ? String(acq.fbclid).trim().slice(0, 200) : null;
    const gclid = acq.gclid ? String(acq.gclid).trim().slice(0, 200) : null;
    const referrer = acq.referrer ? String(acq.referrer).trim().slice(0, 500) : null;
    const landingPath = acq.landingPath || acq.landing_path ? String(acq.landingPath || acq.landing_path).trim().slice(0, 500) : null;
    const deviceId = extra.deviceId || acq.deviceId || null;
    const ip = extra.ip || null;
    const userAgent = extra.userAgent || null;

    sql.prepare(`
      INSERT INTO user_acquisitions(
        user_id, device_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        fbclid, gclid, referrer, landing_path, ip, user_agent, created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        device_id = coalesce(excluded.device_id, user_acquisitions.device_id),
        utm_source = CASE WHEN user_acquisitions.utm_source = 'direct' AND excluded.utm_source != 'direct' THEN excluded.utm_source ELSE user_acquisitions.utm_source END,
        utm_medium = CASE WHEN user_acquisitions.utm_source = 'direct' AND excluded.utm_source != 'direct' THEN excluded.utm_medium ELSE user_acquisitions.utm_medium END,
        utm_campaign = coalesce(excluded.utm_campaign, user_acquisitions.utm_campaign),
        utm_content = coalesce(excluded.utm_content, user_acquisitions.utm_content),
        utm_term = coalesce(excluded.utm_term, user_acquisitions.utm_term),
        referrer = coalesce(user_acquisitions.referrer, excluded.referrer),
        landing_path = coalesce(user_acquisitions.landing_path, excluded.landing_path)
    `).run(userId, deviceId, source, medium, campaign, content, term, fbclid, gclid, referrer, landingPath, ip, userAgent, now);

    const user = getUser(userId);
    if (user) {
      const acqData = { source, medium, campaign, content, term, fbclid, gclid, referrer, landingPath, createdAt: now };
      putUser({ ...user, acquisition: acqData });
    }
    return { userId, source, medium, campaign, content, term, referrer, landingPath, createdAt: now };
  },
  getAcquisition(userId) {
    if (!userId) return null;
    return sql.prepare('SELECT * FROM user_acquisitions WHERE user_id=?').get(resolveUserId(userId)) || null;
  },
  recordVisit(acq = {}, extra = {}) {
    const crypto = require('node:crypto');
    const now = Date.now();
    const source = String(acq.source || acq.utm_source || 'direct').trim().slice(0, 100) || 'direct';
    const medium = String(acq.medium || acq.utm_medium || (source === 'direct' ? 'none' : 'referral')).trim().slice(0, 100) || 'none';
    const campaign = acq.campaign || acq.utm_campaign ? String(acq.campaign || acq.utm_campaign).trim().slice(0, 150) : null;
    const content = acq.content || acq.utm_content ? String(acq.content || acq.utm_content).trim().slice(0, 150) : null;
    const term = acq.term || acq.utm_term ? String(acq.term || acq.utm_term).trim().slice(0, 150) : null;
    const fbclid = acq.fbclid ? String(acq.fbclid).trim().slice(0, 200) : null;
    const gclid = acq.gclid ? String(acq.gclid).trim().slice(0, 200) : null;
    const referrer = acq.referrer ? String(acq.referrer).trim().slice(0, 500) : null;
    const landingPath = acq.landingPath || acq.landing_path ? String(acq.landingPath || acq.landing_path).trim().slice(0, 500) : null;
    const deviceId = extra.deviceId || acq.deviceId || null;
    const ip = extra.ip || null;
    const userAgent = extra.userAgent || null;

    if (deviceId) {
      const recent = sql.prepare('SELECT id, utm_source, utm_campaign FROM site_visits WHERE device_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(deviceId, now - 30 * 60000);
      if (recent && (recent.utm_source === source && (recent.utm_campaign || '') === (campaign || ''))) {
        return { id: recent.id, isNew: false };
      }
    }

    const id = 'vis_' + crypto.randomUUID();
    sql.prepare(`
      INSERT INTO site_visits(id, device_id, user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, referrer, landing_path, bounced, ip, user_agent, created_at)
      VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,1,?,?,?)
    `).run(id, deviceId, source, medium, campaign, content, term, fbclid, gclid, referrer, landingPath, ip, userAgent, now);

    return { id, isNew: true };
  },
  bindVisitUser(deviceId, userId) {
    if (!deviceId || !userId) return;
    userId = resolveUserId(userId);
    sql.prepare(`
      UPDATE site_visits
      SET user_id=?, bounced=0
      WHERE device_id=? AND (user_id IS NULL OR user_id='')
    `).run(userId, deviceId);
  },
  getAcquisitionStats(days = 30) {
    try {
      const since = days > 0 ? Date.now() - days * 86400000 : 0;
      const notTester = "coalesce(json_extract(u.data, '$.isTester'), 0) != 1";

      const cte = `
        WITH combined_visits AS (
          SELECT
            id as visit_id,
            device_id,
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer,
            landing_path,
            bounced,
            created_at
          FROM site_visits
          UNION ALL
          SELECT
            'legacy_' || user_id as visit_id,
            device_id,
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            referrer,
            landing_path,
            0 as bounced,
            created_at
          FROM user_acquisitions
          WHERE user_id NOT IN (SELECT coalesce(user_id, '') FROM site_visits WHERE user_id IS NOT NULL)
        )
      `;

      const summaryRow = sql.prepare(`
        ${cte}
        SELECT
          count(*) as total_visits,
          count(CASE WHEN v.utm_source != 'direct' THEN 1 END) as utm_visits,
          count(CASE WHEN v.utm_source = 'direct' THEN 1 END) as direct_visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounce_count,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chat_started_count,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged_count,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as member_count
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester})
      `).get(since);

      const totalVisits = Number(summaryRow?.total_visits) || 0;
      const utmVisits = Number(summaryRow?.utm_visits) || 0;
      const directVisits = Number(summaryRow?.direct_visits) || 0;
      const bounceCount = Number(summaryRow?.bounce_count) || 0;
      const chatStartedCount = Number(summaryRow?.chat_started_count) || 0;
      const engagedCount = Number(summaryRow?.engaged_count) || 0;
      const memberCount = Number(summaryRow?.member_count) || 0;

      const sources = sql.prepare(`
        ${cte}
        SELECT
          v.utm_source as source,
          v.utm_medium as medium,
          count(*) as visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounces,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chatStarted,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as converted
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester})
        GROUP BY v.utm_source, v.utm_medium
        ORDER BY visits DESC
      `).all(since);

      const campaigns = sql.prepare(`
        ${cte}
        SELECT
          coalesce(v.utm_campaign, '(설정 안됨)') as campaign,
          v.utm_source as source,
          count(*) as visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounces,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chatStarted,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as converted
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester}) AND v.utm_campaign IS NOT NULL AND v.utm_campaign != ''
        GROUP BY v.utm_campaign
        ORDER BY visits DESC
      `).all(since);

      const contents = sql.prepare(`
        ${cte}
        SELECT
          v.utm_content as content,
          v.utm_campaign as campaign,
          v.utm_source as source,
          count(*) as visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounces,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chatStarted,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as converted
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester}) AND v.utm_content IS NOT NULL AND v.utm_content != ''
        GROUP BY v.utm_content
        ORDER BY visits DESC
      `).all(since);

      const terms = sql.prepare(`
        ${cte}
        SELECT
          v.utm_term as term,
          v.utm_source as source,
          count(*) as visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounces,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chatStarted,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as converted
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester}) AND v.utm_term IS NOT NULL AND v.utm_term != ''
        GROUP BY v.utm_term
        ORDER BY visits DESC
      `).all(since);

      const daily = sql.prepare(`
        ${cte}
        SELECT
          date(v.created_at/1000, 'unixepoch', '+9 hours') as day,
          count(*) as total_visits,
          count(CASE WHEN v.utm_source != 'direct' THEN 1 END) as utm_visits,
          count(CASE WHEN v.utm_source = 'direct' THEN 1 END) as direct_visits,
          count(CASE WHEN v.bounced = 1 AND v.user_id IS NULL THEN 1 END) as bounce_count,
          count(CASE WHEN v.user_id IS NOT NULL THEN 1 END) as chat_started_count,
          count(CASE WHEN (SELECT 1 FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user' LIMIT 1) IS NOT NULL THEN 1 END) as engaged_count,
          count(CASE WHEN u.phone IS NOT NULL THEN 1 END) as converted
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester})
        GROUP BY day
        ORDER BY day ASC
      `).all(since);

      const recentLogs = sql.prepare(`
        ${cte}
        SELECT
          v.visit_id,
          v.user_id,
          v.device_id,
          v.utm_source,
          v.utm_medium,
          v.utm_campaign,
          v.utm_content,
          v.utm_term,
          v.referrer,
          v.landing_path,
          v.bounced,
          v.created_at,
          u.phone,
          coalesce((SELECT count(*) FROM conversation_messages m WHERE m.user_id=v.user_id AND json_extract(m.data,'$.sender')='user'), 0) as userTurns
        FROM combined_visits v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.created_at >= ? AND (u.id IS NULL OR ${notTester})
        ORDER BY v.created_at DESC
        LIMIT 50
      `).all(since);

      const mapRate = (numerator, denominator) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

      return {
        days,
        summary: {
          totalVisits,
          utmVisits,
          directVisits,
          bounceCount,
          bounceRate: mapRate(bounceCount, totalVisits),
          chatStartedCount,
          chatStartRate: mapRate(chatStartedCount, totalVisits),
          engagedCount,
          engagementRate: mapRate(engagedCount, totalVisits),
          memberCount,
          conversionRate: mapRate(memberCount, totalVisits),
          // 하위 호환성 필드
          total: totalVisits,
          utmCount: utmVisits,
          directCount: directVisits
        },
        sources: sources.map(s => ({
          ...s,
          total: s.visits,
          bounceRate: mapRate(s.bounces, s.visits),
          chatStartRate: mapRate(s.chatStarted, s.visits),
          engagementRate: mapRate(s.engaged, s.visits),
          conversionRate: mapRate(s.converted, s.visits)
        })),
        campaigns: campaigns.map(c => ({
          ...c,
          total: c.visits,
          bounceRate: mapRate(c.bounces, c.visits),
          chatStartRate: mapRate(c.chatStarted, c.visits),
          engagementRate: mapRate(c.engaged, c.visits),
          conversionRate: mapRate(c.converted, c.visits)
        })),
        contents: contents.map(c => ({
          ...c,
          total: c.visits,
          bounceRate: mapRate(c.bounces, c.visits),
          chatStartRate: mapRate(c.chatStarted, c.visits),
          engagementRate: mapRate(c.engaged, c.visits),
          conversionRate: mapRate(c.converted, c.visits)
        })),
        terms: terms.map(t => ({
          ...t,
          total: t.visits,
          bounceRate: mapRate(t.bounces, t.visits),
          chatStartRate: mapRate(t.chatStarted, t.visits),
          engagementRate: mapRate(t.engaged, t.visits),
          conversionRate: mapRate(t.converted, t.visits)
        })),
        daily: daily.map(d => ({
          ...d,
          total: d.total_visits,
          utm_count: d.utm_visits,
          direct_count: d.direct_visits,
          engaged: d.engaged_count
        })),
        recentLogs
      };
    } catch (e) {
      console.warn('[db] getAcquisitionStats failed:', e.message);
      return {
        days,
        summary: { totalVisits: 0, utmVisits: 0, directVisits: 0, bounceCount: 0, bounceRate: 0, chatStartedCount: 0, chatStartRate: 0, engagedCount: 0, engagementRate: 0, memberCount: 0, conversionRate: 0, total: 0, utmCount: 0, directCount: 0 },
        sources: [],
        campaigns: [],
        contents: [],
        terms: [],
        daily: [],
        recentLogs: []
      };
    }
  }
};
