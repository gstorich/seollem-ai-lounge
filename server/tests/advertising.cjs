const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-ads-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'old.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),PORTONE_MODE:'test',PORTONE_PAYMENT_ENABLED:'true',PORTONE_V1_USER_CODE:'imp_test',PORTONE_PAYMENT_CHANNEL_KEY:'test',PORTONE_DANAL_PG_ID:'test',PORTONE_V1_API_KEY:'test',PORTONE_V1_API_SECRET:'test'});
const db=require('../services/dbService'),ads=require('../services/advertisingService'),pay=require('../services/paymentService'),gateway=require('../services/portoneGateway');
function user(id,tester=false){db.createUser({id,phone:id,hearts:0,isTester:tester,createdAt:Date.now()});return db.getUser(id);}
const u=user('01000001111'),v=user('01000002222');
ads.updateContext(u,{granted:true,gclid:'valid-click',fbc:'fb.1.12345.valid',fbp:'fb.1.12345.valid',phone:u.phone,message:'private text',externalId:u.phone});
const c=ads.context(u.id);assert.equal(c.granted,true);assert(!JSON.stringify(c).includes(u.phone));assert(!JSON.stringify(c).includes('private text'));
ads.updateContext(v,{granted:false});
const testUser=user('01000003333',true);ads.updateContext(testUser,{granted:true});assert.equal(ads.context(testUser.id).granted,false);
const order=pay.create(u,'starter').order;
let stored=pay.get(order.id);stored.mode='live';db.sql.prepare('UPDATE payment_orders SET data=? WHERE id=?').run(JSON.stringify(stored),order.id);
const receipt={merchant_uid:order.id,imp_uid:'imp_test_purchase',status:'paid',paid_at:Math.floor(Date.now()/1000),amount:order.price,name:order.name,currency:'KRW',pay_method:'card',pg_provider:'danal_tpay',pg_id:'test',custom_data:{azitOrder:stored.nonce},cancel_amount:0};
gateway.find=async()=>({...receipt});gateway.payment=async()=>({...receipt});
(async()=>{
 // An outbox failure rolls back payment credit and the order together.
 db.sql.exec("CREATE TEMP TRIGGER ad_fail BEFORE INSERT ON ad_events BEGIN SELECT RAISE(ABORT,'outbox unavailable'); END");
 await assert.rejects(()=>pay.reconcile(order.id),/outbox unavailable/);assert.equal(db.getUser(u.id).hearts,0);assert.equal(pay.get(order.id).status,'pending');
 db.sql.exec('DROP TRIGGER ad_fail');
 await pay.reconcile(order.id);await pay.reconcile(order.id);assert.equal(db.getUser(u.id).hearts,2500);
 assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='purchase'").get().n,1);
 const events=ads.pending(u);assert.equal(events.length,2);assert(events.every(e=>e.value===19900&&e.currency==='KRW'&&e.transaction_id===order.id));
 assert(!JSON.stringify(events).includes(u.phone));assert.equal(ads.pending(v).length,0);
 ads.acknowledge(v,events[0].id,events[0].destination);assert.equal(ads.pending(u).length,2);
 ads.acknowledge(u,events[0].id,events[0].destination);assert.equal(ads.pending(u).length,1);
 await ads.flush();assert(ads.diagnostics().deliveries.some(r=>r.status==='blocked'));
 process.env.META_CAPI_ACCESS_TOKEN='synthetic-token';process.env.META_GRAPH_VERSION='v25.0';db.sql.prepare('INSERT INTO app_settings VALUES(?,?)').run('meta_pixel_id','1234567890');
 let calls=0,body;const original=global.fetch;global.fetch=async(url,options)=>{calls++;body=JSON.parse(options.body);assert(!JSON.stringify(body).includes(u.phone));assert(!JSON.stringify(body).includes('private text'));assert.equal(body.data[0].event_id,events[0].id);assert.equal(body.data[0].custom_data.value,19900);if(calls===1)throw Error('timeout');return {ok:true,json:async()=>({events_received:1})};};
 db.sql.prepare("UPDATE ad_deliveries SET next_at=0 WHERE destination='meta_server'").run();await ads.flush();assert(ads.diagnostics().deliveries.some(r=>r.status==='retry'));
 db.sql.prepare("UPDATE ad_deliveries SET next_at=0 WHERE destination='meta_server'").run();await ads.flush();await ads.flush();assert.equal(calls,2);assert(ads.diagnostics().deliveries.some(r=>r.status==='accepted'));global.fetch=original;
 const t=pay.create(u,'starter').order; // Test mode never enters production learning.
 stored=pay.get(t.id);ads.payment({...stored,status:'paid',grantId:'fake',paidAt:Date.now()});assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='purchase'").get().n,1);
 ads.payment({...pay.get(order.id),status:'refunded',cancelledAmount:19900},0);ads.payment({...pay.get(order.id),status:'refunded',cancelledAmount:19900},0);assert.equal(db.sql.prepare("SELECT count(*) n FROM ad_events WHERE name='refund'").get().n,1);
 ads.updateContext(u,{granted:false});assert.equal(ads.pending(u).length,0);assert.equal(JSON.stringify(ads.context(u.id)).includes('valid-click'),false);assert(db.sql.prepare('SELECT data FROM ad_events WHERE user_id=?').all(u.id).every(r=>r.data==='{}'));
 db.sql.close();fs.rmSync(dir,{recursive:true,force:true});console.log('PASS: verified live payment/outbox atomicity, duplicate webhook/order deduplication, test exclusion, owner-only replay, Meta retries/stable event ID/provider receipt, refunds and consent revocation; no phone/chat data exported');
})().catch(e=>{console.error(e);process.exitCode=1;});
