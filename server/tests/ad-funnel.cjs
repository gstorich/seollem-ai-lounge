'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-funnel-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),META_CAPI_ACCESS_TOKEN:'test-token',META_GRAPH_VERSION:'v25.0',GOOGLE_ADS_OAUTH_CLIENT_ID:'test-client',GOOGLE_ADS_OAUTH_CLIENT_SECRET:'test-secret',GOOGLE_ADS_OAUTH_REFRESH_TOKEN:'test-refresh',GOOGLE_ADS_CUSTOMER_ID:'1234567890',GOOGLE_ADS_PURCHASE_ACTION_ID:'99999'});
const db=require('../services/dbService'),ads=require('../services/advertisingService'),funnel=require('../services/adFunnel');
require('../services/paymentService');
const put=db.sql.prepare('INSERT OR REPLACE INTO app_settings VALUES(?,?)');put.run('meta_pixel_id','123456789');put.run('google_ads_id','AW-123456789');
let index=1;const actionNames=new Map();for(const name of ['new_visit','sign_up','first_chat','view_pricing','begin_checkout','purchase']){const id=String(90000+index++);put.run('google_'+name+'_action_id',id);put.run('google_'+name+'_label','label_'+name);actionNames.set(id,name);}
const guest=db.createUser({id:'guest_funnel',hearts:50});
ads.updateContext(guest,{granted:false});ads.updateContext(guest,{granted:true,gclid:'synthetic-click',phone:'01012345678',message:'PRIVATE_CHAT'});ads.updateContext(guest,{granted:true});
assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='new_visit'").get().n,1);
for(const name of ['page_view','view_pricing']){const key=crypto.randomUUID();ads.clientEvent(guest,name,key);ads.clientEvent(guest,name,key);assert.equal(db.sql.prepare('SELECT count(*) n FROM ad_events WHERE name=?').get(name).n,1);}
for(const name of ['purchase','sign_up','first_chat','begin_checkout','refund','random'])assert.throws(()=>ads.clientEvent(guest,name,crypto.randomUUID()),/INVALID_AD_EVENT/);
assert.throws(()=>ads.clientEvent(guest,'view_pricing','phone=01012345678'),/INVALID_AD_EVENT/);
// Same transaction as message/reply commit: rolled back success never becomes a conversion.
assert.throws(()=>db.transaction(()=>{ads.firstChat(guest.id);throw Error('reply failed');}),/reply failed/);
assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='first_chat'").get().n,0);
db.transaction(()=>{ads.firstChat(guest.id);db.appendMessages(guest.id,'synthetic',[{id:'first',sender:'user',text:'PRIVATE_CHAT',createdAt:Date.now()}]);});ads.firstChat(guest.id);
assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='first_chat'").get().n,1);
// Only an actually consumed, valid OTP produces registration, and guest outbox ownership moves.
const phone='01012345678',challenge=crypto.randomUUID(),digest='synthetic-digest';db.reserveOtp({id:challenge,phone,sessionId:guest.id,ip:'127.0.0.1',digest});db.markOtp(challenge,'sent');
assert.equal(db.verifyOtp(challenge,phone,guest.id,'wrong'),false);assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='sign_up'").get().n,0);
const member=db.verifyOtp(challenge,phone,guest.id,digest).user;assert(member.phone);assert.equal(db.verifyOtp(challenge,phone,guest.id,digest),false);
assert.equal(db.sql.prepare('SELECT count(*) n FROM ad_events WHERE user_id=?').get(guest.id).n,0);
assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='sign_up'").get().n,1);
assert(ads.pending(member).some(e=>e.name==='first_chat'));assert(!JSON.stringify(ads.pending(member)).includes(phone));
ads.record(member.id,'begin_checkout','synthetic-order',{value:19900});ads.record(member.id,'purchase','synthetic-order',{value:19900,transaction_id:'synthetic-order'});
const before=ads.pending(member),names=new Set(before.map(e=>e.name));assert.deepEqual([...names].sort(),['page_view','new_visit','sign_up','first_chat','view_pricing','begin_checkout','purchase'].sort());
const sentMeta=[],sentGoogle=[];const original=global.fetch;
global.fetch=async(url,options)=>{
 if(url.includes('oauth2.'))return {ok:true,json:async()=>({access_token:'synthetic',expires_in:3600})};
 const body=JSON.parse(options.body);for(const value of [phone,'PRIVATE_CHAT','guest_funnel'])assert(!JSON.stringify(body).includes(value));
 if(url.includes('graph.facebook')){sentMeta.push(body.data[0]);return {ok:true,json:async()=>({events_received:1})};}
 sentGoogle.push(body);return {ok:true,json:async()=>({requestId:'synthetic-'+sentGoogle.length})};
};
(async()=>{try{
 await ads.flush();assert.equal(sentMeta.length,7);assert.equal(sentGoogle.length,6);
 assert.deepEqual(sentMeta.map(e=>e.event_name).sort(),['PageView','NewVisitor','CompleteRegistration','Contact','ViewContent','InitiateCheckout','Purchase'].sort());
 for(const body of sentGoogle){const name=actionNames.get(body.destinations[0].productDestinationId);assert(name);const e=before.find(e=>e.destination==='google_browser'&&e.name===name);assert.equal(body.events[0].transactionId,e.transaction_id||e.id);assert.equal(body.events[0].conversionValue,['purchase','begin_checkout'].includes(name)?19900:0);}
 for(const e of sentMeta)assert(before.some(b=>b.destination==='meta_browser'&&b.id===e.event_id));
 await ads.flush();assert.equal(sentMeta.length,7);assert.equal(sentGoogle.length,6);
 // Readiness probes validate only; never seed production learning. Failed new actions retry later.
 let probes=0,failProbe=true;global.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);assert.equal(b.validateOnly,true);probes++;const name=actionNames.get(b.destinations[0].productDestinationId);if(name==='first_chat'&&failProbe)return {ok:false,json:async()=>({error:{details:[{fieldViolations:[{reason:'NOT_FOUND'}]}]}})};return {ok:true,json:async()=>({requestId:'validate-only-'+probes})};};
 await ads.validateDestinations();assert.equal(probes,6);assert(ads.diagnostics().destinationHealth.some(h=>h.name==='first_chat'&&h.detail==='NOT_FOUND'&&h.status==='validation_failed'));
 await ads.validateDestinations();assert.equal(probes,6);failProbe=false;db.sql.prepare("UPDATE ad_destination_health SET checked_at=0 WHERE name='first_chat'").run();await ads.validateDestinations();assert.equal(probes,7);assert(ads.diagnostics().destinationHealth.every(h=>h.status==='validated'));
 assert.equal(db.sql.prepare('SELECT count(*) n FROM ad_events').get().n,7);
 // A downstream processing failure stays retryable, preserving the same conversion identity.
 db.sql.prepare("UPDATE ad_deliveries SET next_at=0 WHERE destination='google_server' AND status='ingested'").run();global.fetch=async(url,opts)=>url.includes('requestStatus:retrieve')?{ok:true,json:async()=>({requestStatusPerDestination:[{requestStatus:'FAILED'}]})}:Promise.reject(Error('not due yet'));
 await ads.flush();assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_deliveries WHERE destination='google_server' AND status='retry'").get().n,6);

 const denied=db.createUser({id:'denied'});ads.clientEvent(denied,'page_view',crypto.randomUUID());assert.equal(ads.pending(denied).length,0);
 const tester=db.createUser({id:'tester',isTester:true});ads.updateContext(tester,{granted:true});ads.clientEvent(tester,'view_pricing',crypto.randomUUID());assert.equal(ads.pending(tester).length,0);
 ads.updateContext(member,{granted:false});assert.equal(ads.pending(member).length,0);assert(db.sql.prepare('SELECT data FROM ad_events WHERE user_id=?').all(member.id).every(e=>e.data==='{}'));
 console.log('PASS: all seven funnel stages, per-action destinations and stable dedup IDs, verified OTP only, transactional first-chat rollback, guest/member ownership, no forged purchase endpoint, consent/tester exclusion and no private data');
}finally{global.fetch=original;db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
