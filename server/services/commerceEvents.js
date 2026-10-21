// First-party service operations only. No provider payload, OTP, phone, DOB or keys.
const db=require('./dbService'),crypto=require('node:crypto');
db.sql.exec(`CREATE TABLE IF NOT EXISTS commerce_events(id INTEGER PRIMARY KEY,event_key TEXT UNIQUE,user_id TEXT NOT NULL,flow TEXT NOT NULL,flow_id TEXT NOT NULL,stage TEXT NOT NULL,source TEXT NOT NULL,code TEXT NOT NULL,mode TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS commerce_event_time ON commerce_events(created_at);
CREATE INDEX IF NOT EXISTS commerce_event_flow ON commerce_events(flow,flow_id,id);
CREATE TABLE IF NOT EXISTS commerce_cases(flow TEXT NOT NULL,flow_id TEXT NOT NULL,note TEXT NOT NULL,state TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(flow,flow_id));`);
const flows=new Set(['phone','identity','payment','refund']);
const codes=new Set('PROVIDER_ERROR PORTONE_INVALID_RESPONSE PORTONE_REQUEST_FAILED PORTONE_AUTH_FAILED PORTONE_NOT_CONFIRMED PAYMENT_BUSY PAYMENT_NOT_READY PHONE_VERIFICATION_REQUIRED INVALID_PACKAGE PAYMENT_MISMATCH ORDER_NOT_FOUND STALE_PAYMENT PAYMENT_NOT_PAID REFUND_CHECK_PENDING REFUND_REJECTED REFUND_PURCHASE_USED REFUND_WINDOW_EXPIRED REFUND_DATE_UNCONFIRMED NO_REFUNDABLE_HEARTS IDENTITY_NOT_READY IDENTITY_RATE_LIMIT IDENTITY_NOT_FOUND IDENTITY_MISMATCH IDENTITY_EXPIRED ALREADY_AUTHENTICATED LEGAL_ACCEPTANCE_REQUIRED MINIMUM_AGE_REQUIRED PURCHASE_CONFIRMATION_REQUIRED HTTP_400 HTTP_401 HTTP_403 HTTP_404 HTTP_409 HTTP_428 HTTP_429 HTTP_500 HTTP_502 HTTP_503 OTP_INVALID_INPUT SMS_NOT_READY OTP_COOLDOWN OTP_DAILY_LIMIT SMS_SEND_FAILED OTP_INVALID_OR_EXPIRED'.split(' '));
const safe=value=>codes.has(value)?value:'PROVIDER_ERROR';
let prunedAt=0;
function prune(){const cutoff=Date.now()-90*86400000;db.sql.prepare('DELETE FROM commerce_events WHERE created_at<?').run(cutoff);db.sql.prepare('DELETE FROM commerce_cases WHERE updated_at<?').run(cutoff);prunedAt=Date.now();}
const retentionTimer=setInterval(()=>{try{prune();}catch{console.warn('[commerce-events] retention cleanup failed');}},3600000);retentionTimer.unref();
function record({userId,flow,flowId='',stage,source='server',code='',mode='live',key=null}){
 if(!userId||!flows.has(flow)||!/^\w{1,40}$/.test(stage)||!['server','browser','worker','admin'].includes(source))return;
 if(Date.now()-prunedAt>3600000)prune();
 db.sql.prepare('INSERT OR IGNORE INTO commerce_events(event_key,user_id,flow,flow_id,stage,source,code,mode,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(key,String(userId),flow,String(flowId).slice(0,80),stage,source,code?safe(code):'',mode==='test'?'test':'live',Date.now());
}
function middleware(flow,operations){return(req,res,next)=>{
 const operation=operations[req.path]||(flow==='payment'&&/^\/orders\/azit_[a-f0-9]{32}\/refund$/.test(req.path)?'refund':null);if(!operation)return next();
 let body;const original=res.json;res.json=function(value){body=value;return original.call(this,value);};
 res.once('finish',()=>{try{
  const userId=req.user?.id;
  const candidate=req.commerceFlowId||body?.order?.id||body?.identityVerificationId||body?.challengeId||req.body?.orderId||req.body?.identityVerificationId||req.body?.challengeId||req.path.match(/azit_[a-f0-9]{32}/)?.[0]||'';
  let id=/^(azit_[a-f0-9]{32}|identity_[a-f0-9-]{36}|[a-f0-9-]{36})$/.test(candidate)?candidate:crypto.randomUUID();
  // An invalid request cannot add events to another customer's timeline.
  if(id.startsWith('azit_')&&!db.sql.prepare('SELECT 1 FROM payment_orders WHERE id=? AND user_id=?').get(id,userId||''))id=crypto.randomUUID();
  if(id.startsWith('identity_')&&!db.sql.prepare('SELECT 1 FROM identity_requests WHERE id=? AND user_id=?').get(id,userId||''))id=crypto.randomUUID();
  if(flow==='phone'&&req.body?.challengeId&&!db.sql.prepare('SELECT 1 FROM otp_challenges WHERE id=? AND session_id=?').get(id,userId||''))id=crypto.randomUUID();
  record({userId,flow:operation==='refund'?'refund':flow,flowId:id,stage:operation+(res.statusCode<400?'_ok':'_failed'),code:res.statusCode<400?'':(safe(body?.code||body?.error)==='PROVIDER_ERROR'?'HTTP_'+res.statusCode:safe(body?.code||body?.error)),mode:flow==='phone'?'live':require('./portoneGateway').settings.mode});
 }catch{console.warn('[commerce-events] request event could not be recorded');}});next();
};}
// Test users and every account linked to their devices are excluded by default.
const excluded=`WITH RECURSIVE tester_ids(id) AS (
 SELECT id FROM users WHERE coalesce(json_extract(data,'$.isTester'),0)=1
 UNION SELECT d.current_user_id FROM device_profiles d JOIN tester_ids t ON d.initial_user_id=t.id
 UNION SELECT d.initial_user_id FROM device_profiles d JOIN tester_ids t ON d.current_user_id=t.id
 UNION SELECT a.old_id FROM aliases a JOIN tester_ids t ON a.new_id=t.id
 UNION SELECT a.new_id FROM aliases a JOIN tester_ids t ON a.old_id=t.id
) SELECT id FROM tester_ids`;
function scope(query={}){const days=[7,30,90].includes(Number(query.days))?Number(query.days):7;
 const now=Date.now(),day=Math.floor((now+9*3600000)/86400000)*86400000-9*3600000;
 const where=['e.created_at>=?','e.created_at<=?'],params=[day-(days-1)*86400000,now];
 if(query.tests!=='1')where.push(`e.mode='live' AND e.user_id NOT IN (${excluded})`);
 if(flows.has(query.flow)){where.push('e.flow=?');params.push(query.flow);}
 if(query.onlyProblems==='1')where.push("(e.stage LIKE '%failed' OR e.stage IN ('error','sdk_error','sdk_cancelled','refund_pending'))");
 return {where:where.join(' AND '),params,days};
}
function overview(query){prune();const s=scope(query),page=Math.max(0,Math.min(10000,parseInt(query.page)||0));
 const total=db.sql.prepare('SELECT count(*) n FROM commerce_events e WHERE '+s.where).get(...s.params).n;
 const items=db.sql.prepare(`SELECT e.*,c.note,CASE WHEN c.updated_at>=e.created_at THEN c.state ELSE 'open' END case_state FROM commerce_events e LEFT JOIN commerce_cases c ON c.flow=e.flow AND c.flow_id=e.flow_id WHERE ${s.where} ORDER BY e.id DESC LIMIT 30 OFFSET ?`).all(...s.params,page*30);
 const counts=db.sql.prepare(`SELECT flow,stage,source,code,count(*) n,count(DISTINCT CASE WHEN flow_id<>'' THEN flow_id END) attempts FROM commerce_events e WHERE ${s.where} GROUP BY flow,stage,source,code ORDER BY flow,n DESC`).all(...s.params);
 const problems=db.sql.prepare(`SELECT e.*,c.note,CASE WHEN c.updated_at>=e.created_at THEN c.state ELSE 'open' END case_state FROM commerce_events e LEFT JOIN commerce_cases c ON c.flow=e.flow AND c.flow_id=e.flow_id WHERE ${s.where} AND (c.state IS NULL OR c.state='open' OR c.updated_at<e.created_at) AND e.id=(SELECT max(x.id) FROM commerce_events x WHERE x.flow=e.flow AND x.flow_id=e.flow_id AND x.user_id=e.user_id AND (x.stage NOT LIKE '%_ok' OR x.flow='phone') AND x.stage NOT IN ('sdk_returned','return_received','sdk_cancelled')) AND NOT EXISTS(SELECT 1 FROM commerce_events done WHERE done.flow=e.flow AND done.flow_id=e.flow_id AND done.stage IN ('paid','refunded','partially_refunded','verified_adult','verified_under19','completed','recovered') AND done.id>=e.id) AND (e.stage LIKE '%failed' OR e.stage IN ('error','sdk_error','refund_pending') OR (e.stage IN ('prepared','sdk_opened','ready','pending') AND e.created_at<?)) ORDER BY e.id DESC LIMIT 100`).all(...s.params,Date.now()-15*60000);
 return {total,items,counts,problems,days:s.days};
}
function timeline(flow,id){return db.sql.prepare('SELECT * FROM commerce_events WHERE flow=? AND flow_id=? ORDER BY id DESC LIMIT 200').all(flow,id);}
function browser(flow){return(req,res)=>{
 const {flowId,stage}=req.body||{};
 if(!['sdk_opened','sdk_returned','sdk_cancelled','sdk_error','return_received'].includes(stage)||typeof flowId!=='string')return res.sendStatus(400);
 let row;
 if(flow==='payment'&&/^azit_[a-f0-9]{32}$/.test(flowId))row=db.sql.prepare('SELECT user_id,data FROM payment_orders WHERE id=? AND user_id=?').get(flowId,req.user.id);
 if(flow==='identity'&&/^identity_[a-f0-9-]{36}$/.test(flowId))row=db.sql.prepare('SELECT user_id,data FROM identity_requests WHERE id=? AND user_id=?').get(flowId,req.user.id);
 if(!row)return res.sendStatus(404);
 record({userId:req.user.id,flow,flowId,stage,source:'browser',mode:JSON.parse(row.data).mode,key:flowId+':browser:'+stage});res.json({success:true});
};}
module.exports={browser,record,middleware,overview,timeline,safe,flows};
