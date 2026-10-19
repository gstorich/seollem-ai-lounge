'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-funnel-insights-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'db.sqlite')});
const db=require('../services/dbService'),ads=require('../services/advertisingService'),{insights}=require('../services/funnelInsights');
require('../services/paymentService');
const now=Date.parse('2026-10-20T01:00:00+09:00'),at=now-3600000;
function user(id,tester=false){return db.createUser({id,isTester:tester});}
function event(u,name,key,time=at,value){ads.record(u.id,name,key,value===undefined?{}:{value},time,{granted:true,at:Date.now()});}
try{
 const a=user('cohort-a'),b=user('cohort-b'),old=user('returning'),tester=user('tester',true),denied=user('denied');
 event(a,'new_visit','a-visit');event(a,'first_chat','a-chat',at+1);event(a,'sign_up','a-sign',at+2); // Chat before authentication is still a reached step.
 event(a,'view_pricing','a-pricing1',at+3);event(a,'view_pricing','a-pricing2',at+4);event(a,'purchase','a-purchase',at+5,19900);
 event(b,'new_visit','b-visit');event(b,'view_pricing','b-pricing',at+6);
 event(old,'new_visit','old-visit',now-40*86400000);event(old,'purchase','return-purchase',at+7,9900);
 event(tester,'new_visit','test');event(tester,'purchase','test-purchase',at+8,999999);
 ads.record(denied.id,'view_pricing','denied',{},at,{granted:false});
 event(a,'purchase','future',now+86400000,999999);
 db.sql.prepare("UPDATE ad_deliveries SET status='accepted' WHERE event_id IN (SELECT id FROM ad_events WHERE name='purchase') AND destination='meta_server'").run();
 db.sql.prepare("UPDATE ad_deliveries SET status='ingested' WHERE destination='google_server'").run();
 let d=insights(7,now),s=name=>d.stages.find(s=>s.name===name);
 assert.equal(d.cohortSize,2);assert.equal(s('purchase').cohortUsers,1);assert.equal(s('purchase').reach,50);assert.equal(s('purchase').users,2);assert.equal(d.revenue,29800);
 assert.equal(s('view_pricing').events,3);assert.equal(s('view_pricing').users,2);assert.equal(s('first_chat').cohortUsers,1);
 assert.equal(d.daily.length,7);assert.equal(d.daily.at(-1).day,'2026-10-20');assert.equal(d.daily.at(-1).purchase,2);assert.equal(d.daily[0].purchase,0);
 assert.equal(d.deliveries.find(r=>r.destination==='meta_server'&&r.name==='purchase').count,2);
 assert(!JSON.stringify(d).includes('cohort-a'));assert(!JSON.stringify(d).includes('999999'));
 const empty=insights(7,now-100*86400000);assert.equal(empty.cohortSize,0);assert.equal(empty.stages[0].reach,null);assert.equal(insights('invalid',now).days,30);
 ads.updateContext(a,{granted:false});d=insights(7,now);assert.equal(d.cohortSize,1);assert.equal(d.revenue,9900);
 console.log('PASS funnel insights: KST calendar days, zero filling, cohort versus returning accounts, repeated events, reordered steps, tester/consent exclusion, future exclusion, amounts, delivery states and no identities');
}finally{db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
