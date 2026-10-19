'use strict';
// Purchase intent comes only from paymentService after provider verification.
const crypto=require('node:crypto'),db=require('./dbService');
db.sql.exec(`CREATE TABLE IF NOT EXISTS ad_context(user_id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ad_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ad_deliveries(event_id TEXT NOT NULL,destination TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,last_error TEXT,delivered_at INTEGER,PRIMARY KEY(event_id,destination));
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
const deliveryColumns=new Set(db.sql.prepare('PRAGMA table_info(ad_deliveries)').all().map(r=>r.name));
for(const [name,type] of [['request_id','TEXT'],['provider_diagnostics','TEXT'],['checks','INTEGER NOT NULL DEFAULT 0']])if(!deliveryColumns.has(name))db.sql.exec('ALTER TABLE ad_deliveries ADD COLUMN '+name+' '+type);
const setting=(key)=>db.sql.prepare('SELECT value FROM app_settings WHERE key=?').get(key)?.value||'';
function publicConfig(){return {googleAdsId:setting('google_ads_id'),googlePurchaseLabel:setting('google_purchase_label'),metaPixelId:setting('meta_pixel_id')};}
const clean=(v,re,max=256)=>typeof v==='string'&&v.length<=max&&re.test(v)?v:undefined;
const opaque=/^[a-zA-Z0-9_.~-]+$/;
function context(userId){const r=db.sql.prepare('SELECT data FROM ad_context WHERE user_id=?').get(userId);return r?JSON.parse(r.data):{};}
function updateContext(user,input={}){
 const granted=input.granted===true&&!user.isTester,old=context(user.id),data={granted,at:Date.now(),version:'ads-consent-20261020-v1'};
 if(granted){
  data.externalId=old.externalId||crypto.randomUUID();
  for(const k of ['gclid','gbraid','wbraid','fbc','fbp']){const v=clean(input[k],opaque);if(v)data[k]=v;else if(old[k])data[k]=old[k];}
  const ua=clean(input.userAgent,/^[^\r\n]+$/,512);if(ua)data.userAgent=ua;
  const cid=clean(input.clientId,/^\d+\.\d+$/,80);if(cid)data.clientId=cid;
  const sid=clean(input.sessionId,/^\d+$/,20);if(sid)data.sessionId=sid;
  if(input.campaign==='azit_purchase_kr_m50_69_v3')data.campaign=input.campaign;
 }
 db.transaction(()=>{
  db.sql.prepare('INSERT INTO ad_context VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(user.id,JSON.stringify(data),Date.now());
  if(!granted){db.sql.prepare("UPDATE payment_orders SET data=json_remove(data,'$.adContext') WHERE user_id=?").run(user.id);db.sql.prepare("UPDATE ad_deliveries SET status='consent_revoked',last_error=NULL WHERE status IN ('pending','retry','blocked') AND event_id IN (SELECT id FROM ad_events WHERE user_id=?)").run(user.id);db.sql.prepare("UPDATE ad_events SET data='{}' WHERE user_id=?").run(user.id);}
 });return {granted};
}
function record(userId,name,key,data={},at=Date.now(),snapshot){
 const user=db.getUser(userId),c=snapshot||context(userId),id='azit_'+crypto.createHash('sha256').update(name+':'+key).digest('hex').slice(0,40);
 const eligible=c.granted===true&&!user?.isTester&&Date.now()-c.at<90*86400000;
 db.sql.prepare('INSERT OR IGNORE INTO ad_events VALUES(?,?,?,?,?)').run(id,userId,name,JSON.stringify(eligible?{...data,context:c}:{}),at);
 for(const dest of name==='refund'?['google_server']:name==='purchase'?['google_browser','google_server','meta_browser','meta_server']:['meta_server'])db.sql.prepare('INSERT OR IGNORE INTO ad_deliveries(event_id,destination,status) VALUES(?,?,?)').run(id,dest,eligible?'pending':'no_consent');
 return id;
}
function payment(o,previousCancelled=0){
 if(o.mode!=='live')return;
 if(['paid','partially_refunded','refunded'].includes(o.status)&&o.grantId)record(o.userId,'purchase',o.id,{transaction_id:o.id,value:o.price,currency:'KRW',item_id:o.pkgKey||'hearts',item_name:o.name},o.paidAt,o.adContext||{});
 if((o.cancelledAmount||0)>previousCancelled)record(o.userId,'refund',o.id+':'+o.cancelledAmount,{transaction_id:o.id,value:o.price-o.cancelledAmount,currency:'KRW',purchaseAt:o.paidAt},Date.now(),o.adContext||{});
}
function pending(user){
 if(user.isTester||!context(user.id).granted)return [];
 return db.sql.prepare("SELECT e.*,d.destination FROM ad_events e JOIN ad_deliveries d ON d.event_id=e.id WHERE e.user_id=? AND d.destination IN ('google_browser','meta_browser') AND d.status IN ('pending','retry') AND e.created_at>? ORDER BY e.created_at LIMIT 30").all(user.id,Date.now()-7*86400000).map(r=>({id:r.id,name:r.name,destination:r.destination,...JSON.parse(r.data)}));
}
function acknowledge(user,id,destination){if(!['google_browser','meta_browser'].includes(destination))return;db.sql.prepare("UPDATE ad_deliveries SET status='client_dispatched',delivered_at=? WHERE event_id=? AND destination=? AND status IN ('pending','retry') AND event_id IN (SELECT id FROM ad_events WHERE user_id=?)").run(Date.now(),id,destination,user.id);}
let processing=false;
async function flush(){
 if(processing)return;processing=true;
 try{const cutoff=Date.now()-90*86400000;db.sql.prepare('DELETE FROM ad_context WHERE updated_at<?').run(cutoff);db.sql.prepare("UPDATE ad_events SET data='{}' WHERE created_at<?").run(cutoff);db.sql.prepare("UPDATE payment_orders SET data=json_remove(data,'$.adContext') WHERE created_at<?").run(cutoff);
 await checkGoogleReceipts();
 for(const row of db.sql.prepare("SELECT d.*,e.name,e.data,e.user_id,e.created_at FROM ad_deliveries d JOIN ad_events e ON e.id=d.event_id WHERE d.destination IN ('meta_server','google_server') AND d.status IN ('pending','retry','blocked') AND d.next_at<=? ORDER BY e.created_at LIMIT 50").all(Date.now())){
  const c=context(row.user_id),data=JSON.parse(row.data),cfg=publicConfig();
  if(!c.granted||db.getUser(row.user_id)?.isTester){db.sql.prepare("UPDATE ad_deliveries SET status='consent_revoked' WHERE event_id=? AND destination=?").run(row.event_id,row.destination);continue;}
  if(row.destination==='google_server'){
   const google=require('./googleConversionGateway');
   if(row.name==='refund'){
    const original=db.sql.prepare("SELECT d.status FROM ad_deliveries d JOIN ad_events e ON e.id=d.event_id WHERE d.destination='google_server' AND e.name='purchase' AND json_extract(e.data,'$.transaction_id')=?").get(data.transaction_id);
    if(!original||!['accepted','accepted_with_warnings'].includes(original.status))continue;
    const latest=db.sql.prepare("SELECT max(created_at) at FROM ad_events WHERE name='refund' AND json_extract(data,'$.transaction_id')=?").get(data.transaction_id);
    if(latest.at>row.created_at){db.sql.prepare("UPDATE ad_deliveries SET status='superseded' WHERE event_id=? AND destination=?").run(row.event_id,row.destination);continue;}
   }
   let status='blocked',reason='SERVER_CREDENTIALS_MISSING',requestId=null;
   if(google.ready())try{const result=await google.send(data,data.purchaseAt||row.created_at);status=result.warnings?'ingested_with_warnings':'ingested';requestId=result.requestId;reason=result.warnings?'PROVIDER_FIELD_WARNING':null;}catch(e){status=e.message==='NO_AD_IDENTIFIER'?'unattributable':'retry';reason=e.message==='NO_AD_IDENTIFIER'?'NO_AD_IDENTIFIER':'TRANSPORT_OR_PROVIDER_ERROR';}
   db.sql.prepare('UPDATE ad_deliveries SET status=?,attempts=attempts+1,last_error=?,request_id=?,checks=0,next_at=?,delivered_at=? WHERE event_id=? AND destination=?').run(status,reason,requestId,Date.now()+(requestId?1800000:Math.min(3600000,60000*2**Math.min(row.attempts,6))),null,row.event_id,row.destination);continue;
  }
  const token=process.env.META_CAPI_ACCESS_TOKEN,api=process.env.META_GRAPH_VERSION;
  if(row.destination!=='meta_server'||!token||!/^v\d+\.\d+$/.test(api||'')||!/^\d+$/.test(cfg.metaPixelId)){
   db.sql.prepare("UPDATE ad_deliveries SET status='blocked',last_error=?,next_at=? WHERE event_id=? AND destination=?").run(row.destination==='ga4'?'REFUND_ADJUSTMENT_REQUIRED':'SERVER_CREDENTIALS_MISSING',Date.now()+60000,row.event_id,row.destination);continue;
  }
  if(Date.now()-row.created_at>7*86400000){db.sql.prepare("UPDATE ad_deliveries SET status='expired',last_error='PLATFORM_TIME_WINDOW' WHERE event_id=? AND destination=?").run(row.event_id,row.destination);continue;}
  const ctx=data.context||{},user_data={external_id:[crypto.createHash('sha256').update(ctx.externalId).digest('hex')]};
  for(const k of ['fbc','fbp'])if(ctx[k])user_data[k]=ctx[k];if(ctx.userAgent)user_data.client_user_agent=ctx.userAgent;
  const eventNames={purchase:'Purchase',sign_up:'CompleteRegistration',begin_checkout:'InitiateCheckout',first_chat:'Contact'};
  const payload={data:[{event_name:eventNames[row.name],event_time:Math.floor(row.created_at/1000),event_id:row.event_id,action_source:'website',event_source_url:'https://azitchat.com/',user_data,custom_data:{...(data.value!==undefined?{value:data.value,currency:'KRW'}:{}),...(data.transaction_id?{order_id:data.transaction_id}:{})}}]};
  try{
   const res=await fetch('https://graph.facebook.com/'+api+'/'+cfg.metaPixelId+'/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   const body=await res.json();if(!res.ok||body.events_received!==1)throw Error('PROVIDER_REJECTED');
   db.sql.prepare("UPDATE ad_deliveries SET status='accepted',attempts=attempts+1,last_error=NULL,delivered_at=? WHERE event_id=? AND destination=?").run(Date.now(),row.event_id,row.destination);
  }catch{db.sql.prepare("UPDATE ad_deliveries SET status='retry',attempts=attempts+1,last_error='TRANSPORT_OR_PROVIDER_ERROR',next_at=? WHERE event_id=? AND destination=?").run(Date.now()+Math.min(3600000,1000*2**Math.min(row.attempts+1,12)),row.event_id,row.destination);}
 }}finally{processing=false;}
}
async function checkGoogleReceipts(){
 const google=require('./googleConversionGateway');if(!google.ready())return;
 for(const r of db.sql.prepare("SELECT * FROM ad_deliveries WHERE destination='google_server' AND status IN ('ingested','ingested_with_warnings') AND next_at<=? LIMIT 10").all(Date.now())){
  try{const result=await google.status(r.request_id),d=result[0];let status=r.status;
   if(d?.requestStatus==='SUCCESS')status=d.warningInfo?.warningCounts?.length?'accepted_with_warnings':'accepted';
   else if(['FAILED','PARTIAL_SUCCESS'].includes(d?.requestStatus))status='provider_rejected';
   db.sql.prepare('UPDATE ad_deliveries SET status=?,provider_diagnostics=?,checks=checks+1,next_at=?,delivered_at=? WHERE event_id=? AND destination=?').run(status,JSON.stringify(result),Date.now()+Math.min(3600000,1800000*1.3**Math.min(r.checks+1,8)),status.startsWith('accepted')?Date.now():null,r.event_id,r.destination);
  }catch{db.sql.prepare("UPDATE ad_deliveries SET checks=checks+1,next_at=?,last_error='DIAGNOSTICS_UNAVAILABLE' WHERE event_id=? AND destination=?").run(Date.now()+3600000,r.event_id,r.destination);}
 }
}
function diagnostics(){return {configuration:{...publicConfig(),googleServerCredentials:require('./googleConversionGateway').ready(),metaServerCredentials:Boolean(process.env.META_CAPI_ACCESS_TOKEN),metaGraphVersion:process.env.META_GRAPH_VERSION||null},deliveries:db.sql.prepare('SELECT destination,status,count(*) count FROM ad_deliveries GROUP BY destination,status').all(),paidLiveOrders:db.sql.prepare("SELECT count(*) count FROM payment_orders WHERE json_extract(data,'$.mode')='live' AND json_extract(data,'$.grantId') IS NOT NULL").get().count,purchaseRecords:db.sql.prepare("SELECT count(*) count FROM ad_events WHERE name='purchase'").get().count};}
function start(){const t=setInterval(()=>flush().catch(()=>{}),30000);t.unref();return()=>clearInterval(t);}
module.exports={publicConfig,context,updateContext,record,payment,pending,acknowledge,flush,diagnostics,start};
