const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('./dbService');
const sql = new DatabaseSync(config.sqliteFile);
sql.exec(`PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS support_tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,category TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS support_owner ON support_tickets(user_id,updated_at);
CREATE TABLE IF NOT EXISTS support_messages(id INTEGER PRIMARY KEY,ticket_id TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,internal INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL,request_id TEXT UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity_events(id INTEGER PRIMARY KEY,event TEXT NOT NULL,user_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS activity_time ON activity_events(created_at,event);`);
const wallet = require('./heartWallet').createWallet(sql);
function tx(fn) { sql.exec('BEGIN IMMEDIATE');try {const result=fn();sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;} }
function audit(actor,action,target,details={},requestId=null) {
 sql.prepare('INSERT INTO admin_audit(actor,action,target,details,request_id,created_at) VALUES(?,?,?,?,?,?)').run(actor,action,target,JSON.stringify(details),requestId,Date.now());
}
function getTicket(id,owner) {
 const row=owner ? sql.prepare('SELECT * FROM support_tickets WHERE id=? AND user_id=?').get(id,owner) : sql.prepare('SELECT * FROM support_tickets WHERE id=?').get(id);
 if(!row)return null;
 row.messages=sql.prepare(`SELECT id,author,body,internal,created_at FROM support_messages WHERE ticket_id=? ${owner?'AND internal=0':''} ORDER BY id`).all(id);
 return row;
}
function setting(key){return sql.prepare('SELECT value FROM app_settings WHERE key=?').get(key)?.value ?? null;}
const categoryList=['account','hearts','chat','payment','other'];
module.exports={
 audit, setting, categoryList,
 track(event,userId){const u=db.getUser(userId);if(u?.isTester)return;sql.prepare('INSERT INTO activity_events(event,user_id,created_at) VALUES(?,?,?)').run(event,userId,Date.now());},
 tickets(owner,status='all',page=0){const where=owner?'WHERE user_id=?':status==='all'?'':'WHERE status=?';const args=owner?[owner]:status==='all'?[]:[status];return {items:sql.prepare(`SELECT * FROM support_tickets ${where} ORDER BY updated_at DESC LIMIT 30 OFFSET ?`).all(...args,page*30),total:sql.prepare(`SELECT count(*) n FROM support_tickets ${where}`).get(...args).n};},
 getTicket,
 createTicket(userId,category,subject,body){return tx(()=>{
  const count=sql.prepare('SELECT count(*) n FROM support_tickets WHERE user_id=? AND created_at>?').get(userId,Date.now()-86400000).n;
  if(count>=10)throw Error('하루에 문의를 10개까지 등록할 수 있습니다.');
  const id=crypto.randomUUID(),now=Date.now();
  sql.prepare('INSERT INTO support_tickets VALUES(?,?,?,?,?,?,?)').run(id,userId,category,subject,'open',now,now);
  sql.prepare('INSERT INTO support_messages(ticket_id,author,body,created_at) VALUES(?,?,?,?)').run(id,'customer',body,now);
  return getTicket(id,userId);
 });},
 reply(id,actor,body,internal=false,status,owner){return tx(()=>{
  const ticket=getTicket(id,owner);if(!ticket)return null;
  if(ticket.messages.length>=200)throw Error('문의 답변 수가 너무 많습니다. 새 문의를 등록해주세요.');
  const now=Date.now();
  sql.prepare('INSERT INTO support_messages(ticket_id,author,body,internal,created_at) VALUES(?,?,?,?,?)').run(id,owner?'customer':'admin',body,internal?1:0,now);
  sql.prepare('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?').run(owner?'open':status || (internal?ticket.status:'answered'),now,id);
  if(!owner)audit(actor,internal?'ticket_note':'ticket_reply',id,{status:status||'answered'});
  return getTicket(id,owner);
 });},
 setStatus(id,actor,status){return tx(()=>{if(!getTicket(id))return false;sql.prepare('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?').run(status,Date.now(),id);audit(actor,'ticket_status',id,{status});return true;});},
 setAnalytics(actor,id,propertyId){return tx(()=>{for(const [key,value] of [['ga_measurement_id',id],['ga_property_id',propertyId]])sql.prepare('INSERT OR REPLACE INTO app_settings VALUES(?,?)').run(key,value);audit(actor,'analytics_settings','analytics',{measurementId:id,propertyId});});},
 users(query,page,kind='all',engagement='all'){
  db.expireHearts();const term='%'+query+'%',args=[term,term];
  const filters=['(u.id LIKE ? OR u.phone LIKE ?)'];
  if(kind==='members')filters.push('u.phone IS NOT NULL');
  if(kind==='guests')filters.push('u.phone IS NULL');
  if(kind==='testers')filters.push("coalesce(json_extract(u.data,'$.isTester'),0)=1");
  else filters.push("coalesce(json_extract(u.data,'$.isTester'),0)!=1");
  const active="EXISTS(SELECT 1 FROM conversation_messages m WHERE m.user_id=u.id AND json_extract(m.data,'$.sender')='user')";
  if(engagement==='active')filters.push(active);
  if(engagement==='unused')filters.push('NOT '+active);
  const where=filters.join(' AND ');
  return {items:sql.prepare(`SELECT u.id,u.phone,json_extract(u.data,'$.hearts') hearts,json_extract(u.data,'$.createdAt') createdAt,json_extract(u.data,'$.updatedAt') updatedAt,json_extract(u.data,'$.lastSeenAt') lastSeenAt,(SELECT count(*) FROM conversation_messages m WHERE m.user_id=u.id AND json_extract(m.data,'$.sender')='user') userTurns FROM users u WHERE ${where} ORDER BY coalesce(json_extract(u.data,'$.lastSeenAt'),json_extract(u.data,'$.updatedAt')) DESC,u.id LIMIT 30 OFFSET ?`).all(...args,page*30),total:sql.prepare(`SELECT count(*) n FROM users u WHERE ${where}`).get(...args).n};
 },
 customer(id){const user=db.getUser(id);if(!user)return null;const isAdult=require('./contentAccess').verifiedAdult(user);let device=null;try{device=sql.prepare('SELECT device_id,welcome_granted,ip,user_agent,created_at,updated_at FROM device_profiles WHERE current_user_id=?').get(id)||null;}catch{}return {id:user.id,phone:user.phone,hearts:user.hearts,device,heartExpiry:db.getHeartSummary(id),heartGrants:db.getHeartGrants(id),createdAt:user.createdAt,updatedAt:user.updatedAt,roomCount:Object.keys(user.savedRooms||{}).length,messageCount:Object.values(user.savedRooms||{}).reduce((n,r)=>n+(r.messages||[]).length,0),isAdult,verification:user.identityVerification||null,ledger:sql.prepare('SELECT delta,reason,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 100').all(id).map(r=>({...r,delta:r.delta/10})),notes:sql.prepare("SELECT actor,details,created_at FROM admin_audit WHERE target=? AND action='customer_note' ORDER BY id DESC LIMIT 30").all(id).map(r=>({...r,details:JSON.parse(r.details)}))};},
 setAdultVerification(actor,id,isAdult,reason=''){if(isAdult)throw Error('VERIFIED_IDENTITY_REQUIRED');const user=db.getUser(id);if(!user)return null;const now=Date.now();const minimal={verified:false,isAdult:false,isAtLeast18:false,verifiedAt:now,method:'admin_manual',adminActor:actor,reason:reason||'관리자 인증 해제'};db.updateUser(id,{identityVerification:minimal});audit(actor,'adult_verification',id,{isAdult,reason:reason||'수동 설정'});return {id,isAdult,verification:minimal};},
 addNote(actor,id,body){if(!db.getUser(id))return false;audit(actor,'customer_note',id,{body});return true;},
 adjust(actor,id,delta,reason,requestId){return tx(()=>{
  const prev=sql.prepare('SELECT actor,action,target,details FROM admin_audit WHERE request_id=?').get(requestId);
  if(prev){const detail=JSON.parse(prev.details);if(prev.actor!==actor||prev.target!==id||prev.action!=='heart_adjustment'||detail.delta!==delta||detail.reason!==reason)throw Error('동일 요청 ID의 내용이 다릅니다.');return {...detail,replayed:true};}
  const user=wallet.change(id,Math.round(delta*10),'admin_adjustment');
  const detail={delta,reason,hearts:user.hearts};audit(actor,'heart_adjustment',id,detail,requestId);return detail;
 });},
 audits(page){return sql.prepare('SELECT id,actor,action,target,details,created_at FROM admin_audit ORDER BY id DESC LIMIT 50 OFFSET ?').all(page*50).map(r=>({...r,details:JSON.parse(r.details)}));},
 overview(days){
 db.expireHearts();
 const since=Date.now()-days*86400000;
 const scalar=(q,...a)=>sql.prepare(q).get(...a).n;
 const notTester="coalesce(json_extract(u.data,'$.isTester'),0)!=1";
 const totals={
  customers:scalar(`SELECT count(*) n FROM users u WHERE ${notTester}`),
  members:scalar(`SELECT count(*) n FROM users u WHERE u.phone IS NOT NULL AND ${notTester}`),
  hearts:Math.round(scalar(`SELECT coalesce(sum(json_extract(u.data,'$.hearts')),0) n FROM users u WHERE ${notTester}`)*10)/10,
  openTickets:scalar("SELECT count(*) n FROM support_tickets WHERE status IN ('open','in_progress')"),
  chatTurns:scalar(`SELECT count(*) n FROM ledger l JOIN users u ON l.user_id=u.id WHERE l.reason='chat' AND l.created_at>=? AND ${notTester}`,since),
  activeAccounts:scalar(`SELECT count(DISTINCT l.user_id) n FROM ledger l JOIN users u ON l.user_id=u.id WHERE l.reason IN ('chat','recall') AND l.created_at>=? AND ${notTester}`,since),
  newAccounts:scalar(`SELECT count(*) n FROM users u WHERE json_extract(u.data,'$.createdAt')>=? AND ${notTester}`,since)
 };
 totals.guests=totals.customers-totals.members;
 totals.engagedGuests=scalar(`SELECT count(*) n FROM users u WHERE u.phone IS NULL AND ${notTester} AND EXISTS(SELECT 1 FROM conversation_messages m WHERE m.user_id=u.id AND json_extract(m.data,'$.sender')='user')`);
 totals.unusedGuests=totals.guests-totals.engagedGuests;
 const daily=sql.prepare(`SELECT date(l.created_at/1000,'unixepoch','+9 hours') day,count(*) chatTurns,round(-sum(l.delta)/10.0,1) heartsUsed,count(DISTINCT l.user_id) activeAccounts FROM ledger l JOIN users u ON l.user_id=u.id WHERE l.reason='chat' AND l.created_at>=? AND ${notTester} GROUP BY day ORDER BY day`).all(since);
 const events=sql.prepare(`SELECT a.event,count(*) count FROM activity_events a LEFT JOIN users u ON a.user_id=u.id WHERE a.created_at>=? AND (u.id IS NULL OR ${notTester}) GROUP BY a.event`).all(since);
 return {totals,daily,events,days};
 }
};
