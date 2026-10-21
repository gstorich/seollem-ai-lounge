const db = require('./dbService');
const storage = require('./objectStorage');
const { tags } = require('./conversationTopics');
const DAY = 86400000;
const HOT_MESSAGES = 120;
const LOCAL_DAYS = 7;

function initialize() {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS archive_message_refs(user_id TEXT NOT NULL,character_id TEXT NOT NULL,message_id TEXT NOT NULL,object_key TEXT NOT NULL,entry_index INTEGER NOT NULL,PRIMARY KEY(user_id,character_id,message_id));
    CREATE TABLE IF NOT EXISTS archive_objects(object_key TEXT PRIMARY KEY,sha256 TEXT NOT NULL,message_count INTEGER NOT NULL,verified_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS conversation_room_page ON conversation_messages(user_id,character_id,created_at,message_id);
    CREATE INDEX IF NOT EXISTS conversation_local_bodies ON conversation_messages(created_at) WHERE json_extract(data,'$.archiveCold') IS NULL;`);
}

async function archiveBatch(limit = 500) {
  initialize();
  if (!storage.configured()) throw Error('R2_NOT_CONFIGURED');
  const rows = db.sql.prepare(`SELECT m.* FROM conversation_messages m WHERE NOT EXISTS(
    SELECT 1 FROM archive_message_refs a WHERE a.user_id=m.user_id AND a.character_id=m.character_id AND a.message_id=m.message_id
  ) ORDER BY m.rowid LIMIT ?`).all(limit);
  if (!rows.length) return 0;
  // All rooms share a bounded batch; only the server can decrypt the object.
  const plain = Buffer.from(JSON.stringify({ version: 2, messages: rows }));
  const key = storage.settings().prefix + '/conversations/batches/' + storage.hash(plain) + '.azr';
  const result = await storage.putVerified(key, plain);
  db.transaction(() => {
    db.sql.prepare('INSERT OR IGNORE INTO archive_objects VALUES(?,?,?,?)').run(key, result.sha256, rows.length, Date.now());
    const insert = db.sql.prepare('INSERT OR IGNORE INTO archive_message_refs VALUES(?,?,?,?,?)');
    rows.forEach((r, i) => insert.run(r.user_id, r.character_id, r.message_id, key, i));
  });
  return rows.length;
}

function unavailable() {
  return Object.assign(Error('ARCHIVE_UNAVAILABLE'), { status: 503 });
}
async function readObject(key) {
  const expected = db.sql.prepare('SELECT sha256 FROM archive_objects WHERE object_key=?').get(key);
  if (!expected) throw unavailable();
  const bytes = await storage.get(key);
  if (storage.hash(bytes) !== expected.sha256) throw unavailable();
  const content = JSON.parse(bytes.toString());
  if (![1, 2].includes(content.version) || !Array.isArray(content.messages)) throw unavailable();
  Object.defineProperty(content.messages, 'archiveBytes', { value: bytes.length });
  return content.messages;
}
function validEntry(entry, row) {
  return entry && db.resolveUserId(entry.user_id) === row.user_id && entry.character_id === row.character_id && entry.message_id === row.message_id && entry.created_at === row.created_at;
}

// One read per distinct object in this bounded page. Objects never reach clients.
async function hydrateRows(rows, { preferArchive = false } = {}) {
  initialize();
  const refs = db.sql.prepare('SELECT object_key,entry_index FROM archive_message_refs WHERE user_id=? AND character_id=? AND message_id=?');
  const objects = new Map();
  let cachedBytes = 0;
  const result = [];
  for (const row of rows) {
    const local = JSON.parse(row.data);
    let message = local;
    if (local.archiveCold || preferArchive) {
      const ref = refs.get(row.user_id, row.character_id, row.message_id);
      if (ref) {
        if (!objects.has(ref.object_key)) {
          try {
            const entries = await readObject(ref.object_key);
            while (objects.size && cachedBytes + entries.archiveBytes > 16 * 1024 * 1024) {
              const oldest = objects.keys().next().value;
              cachedBytes -= objects.get(oldest)?.archiveBytes || 0;
              objects.delete(oldest);
            }
            objects.set(ref.object_key, entries);cachedBytes += entries.archiveBytes;
          }
          catch { objects.set(ref.object_key, null); }
        }
        const entry = objects.get(ref.object_key)?.[ref.entry_index];
        if (validEntry(entry, row)) message = JSON.parse(entry.data);
        else if (local.archiveCold) throw unavailable();
      } else if (local.archiveCold) throw unavailable();
    }
    result.push({ ...message, id: row.message_id, createdAt: row.created_at });
  }
  return result;
}

async function compactBatch(limit = 500, now = Date.now()) {
  initialize();
  if (!storage.configured()) throw Error('R2_NOT_CONFIGURED');
  db.sql.exec('PRAGMA secure_delete=ON');
  const candidates = db.sql.prepare(`SELECT m.*,a.object_key,a.entry_index FROM conversation_messages m
    JOIN archive_message_refs a USING(user_id,character_id,message_id)
    JOIN archive_objects o ON o.object_key=a.object_key
    WHERE json_extract(m.data,'$.archiveCold') IS NULL AND m.created_at<? AND o.verified_at>0
    AND m.message_id NOT IN (SELECT recent.message_id FROM conversation_messages recent
      WHERE recent.user_id=m.user_id AND recent.character_id=m.character_id
      ORDER BY recent.created_at DESC,recent.message_id DESC LIMIT ${HOT_MESSAGES})
    ORDER BY m.created_at,m.rowid LIMIT ?`).all(now - LOCAL_DAYS * DAY, limit);
  // Download and verify again immediately before removing the local original.
  // A failed object leaves its local originals intact and retryable.
  const groups = new Map();
  for (const row of candidates) {
    if (!groups.has(row.object_key)) groups.set(row.object_key, []);
    groups.get(row.object_key).push(row);
  }
  let compacted = 0, failedObjects = 0;
  for (const [key, rows] of groups) {
    let entries;
    try { entries = await readObject(key); }
    catch { failedObjects++; continue; }
    const valid = rows.filter(row => validEntry(entries[row.entry_index], row) && entries[row.entry_index].data === row.data);
    if (valid.length !== rows.length) { failedObjects++; continue; }
    db.transaction(() => {
      const update = db.sql.prepare('UPDATE conversation_messages SET data=? WHERE user_id=? AND character_id=? AND message_id=? AND data=?');
      const receipt = db.sql.prepare('SELECT data FROM chat_requests WHERE user_id=? AND request_id=?');
      const saveReceipt = db.sql.prepare('UPDATE chat_requests SET data=? WHERE user_id=? AND request_id=? AND data=?');
      for (const row of valid) {
        const message = JSON.parse(row.data);
        const stub = JSON.stringify({ sender: message.sender, archiveCold: true, topics: tags(message.text || '') });
        const changed = update.run(stub, row.user_id, row.character_id, row.message_id, row.data).changes;
        compacted += changed;
        if (changed && message.sender === 'ai' && row.message_id.startsWith('reply_')) {
          const requestId = row.message_id.slice(6), old = receipt.get(row.user_id, requestId);
          if (old) {
            const value = JSON.parse(old.data);
            if (value.success && value.replyId === row.message_id && value.partnerReply === message.text) {
              delete value.partnerReply;
              value.archivedReply = { characterId: row.character_id, messageId: row.message_id };
              saveReceipt.run(JSON.stringify(value), row.user_id, requestId, old.data);
            }
          }
        }
      }
    });
  }
  if (compacted) db.sql.exec('PRAGMA incremental_vacuum(256)');
  if (failedObjects) throw Object.assign(Error('ARCHIVE_COMPACTION_VERIFY_FAILED'), { compacted, failedObjects });
  return compacted;
}

async function page(userId, characterId, { before, limit = 40 } = {}) {
  initialize();
  userId = db.resolveUserId(userId);
  limit = Math.max(1, Math.min(100, Number(limit) || 40));
  let cursor;
  if (before) {
    try {
      cursor = JSON.parse(Buffer.from(before, 'base64url').toString());
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string') throw Error();
    } catch { throw Object.assign(Error('INVALID_CURSOR'), { status: 400 }); }
  }
  const rows = db.sql.prepare(`SELECT * FROM conversation_messages WHERE user_id=? AND character_id=?
    ${cursor ? 'AND (created_at<? OR (created_at=? AND message_id<?))' : ''}
    ORDER BY created_at DESC,message_id DESC LIMIT ?`).all(userId, characterId, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []), limit + 1);
  const selected = rows.slice(0, limit);
  const messages = await hydrateRows(selected);
  const oldest = selected.at(-1);
  return { messages: messages.reverse(), hasMore: rows.length > limit, nextCursor: rows.length > limit && oldest ? Buffer.from(JSON.stringify([oldest.created_at, oldest.message_id])).toString('base64url') : null };
}

module.exports = { initialize, archiveBatch, compactBatch, hydrateRows, page, HOT_MESSAGES, LOCAL_DAYS };
