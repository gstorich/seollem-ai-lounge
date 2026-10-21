const db=require('./dbService');
const {sql}=db;
sql.exec(`
CREATE TABLE IF NOT EXISTS contact_preferences(user_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,last_seen INTEGER NOT NULL DEFAULT 0,last_sent INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS proactive_jobs(user_id TEXT NOT NULL,character_id TEXT NOT NULL,source_id TEXT NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,character_id));
CREATE INDEX IF NOT EXISTS proactive_due ON proactive_jobs(status,due_at);
CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_owner ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS proactive_deliveries(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,character_id TEXT NOT NULL,message_id TEXT NOT NULL,created_at INTEGER NOT NULL,push_status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,character_id,message_id));
CREATE INDEX IF NOT EXISTS proactive_delivery_due ON proactive_deliveries(push_status,next_attempt);
CREATE TABLE IF NOT EXISTS push_delivery_receipts(delivery_id INTEGER NOT NULL,endpoint TEXT NOT NULL,PRIMARY KEY(delivery_id,endpoint));
`);
module.exports={
 preferences(id){return sql.prepare('SELECT * FROM contact_preferences WHERE user_id=?').get(id)||{enabled:1,last_seen:0,last_sent:0};},
 setEnabled(id,enabled){db.transaction(()=>{
   sql.prepare('INSERT INTO contact_preferences(user_id,enabled) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled').run(id,enabled?1:0);
   if(!enabled){sql.prepare("UPDATE proactive_jobs SET status='cancelled' WHERE user_id=?").run(id);sql.prepare("UPDATE proactive_deliveries SET push_status='cancelled' WHERE user_id=? AND push_status='pending'").run(id);}
 });},
 seen(id,now){sql.prepare('INSERT INTO contact_preferences(user_id,last_seen) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen').run(id,now);},
 cancelRoom(id,charId){sql.prepare('DELETE FROM proactive_jobs WHERE user_id=? AND character_id=?').run(id,charId);sql.prepare("UPDATE proactive_deliveries SET push_status='cancelled' WHERE user_id=? AND character_id=? AND push_status='pending'").run(id,charId);},
 transfer(from,to){
   // A verified account owns its old subscriptions too; endpoint registration
   // on this browser then binds to the currently signed-in account.
   sql.prepare('UPDATE push_subscriptions SET user_id=? WHERE user_id=?').run(to,from);
   sql.prepare('INSERT INTO contact_preferences SELECT ?,enabled,last_seen,last_sent FROM contact_preferences WHERE user_id=? ON CONFLICT(user_id) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen),last_sent=MAX(last_sent,excluded.last_sent),enabled=MIN(enabled,excluded.enabled)').run(to,from);
   sql.prepare('DELETE FROM contact_preferences WHERE user_id=?').run(from);
   // Pending work must be re-evaluated against the merged conversation.
   sql.prepare('DELETE FROM proactive_jobs WHERE user_id IN (?,?)').run(from,to);
   sql.prepare('UPDATE proactive_deliveries SET user_id=? WHERE user_id=?').run(to,from);
 },
 async inbox(id){
   const rows=sql.prepare(`SELECT m.*,d.id delivery_id FROM proactive_deliveries d JOIN conversation_messages m ON m.user_id=d.user_id AND m.character_id=d.character_id AND m.message_id=d.message_id WHERE d.user_id=? AND d.push_status!='cancelled' ORDER BY d.id DESC LIMIT 50`).all(id).reverse();
   const messages=await require('./conversationArchive').hydrateRows(rows);
   return rows.map((r,i)=>({id:r.delivery_id,characterId:r.character_id,message:messages[i]}));
 }
};
