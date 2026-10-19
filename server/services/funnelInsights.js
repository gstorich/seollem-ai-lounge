'use strict';
const db=require('./dbService');
require('./advertisingService');
const stages=[['new_visit','신규 유입'],['sign_up','번호 인증'],['first_chat','첫 대화'],['view_pricing','결제 관심'],['begin_checkout','결제 시작'],['purchase','결제 완료']];
const day=86400000,kst=9*3600000;
db.sql.exec('CREATE INDEX IF NOT EXISTS ad_events_time ON ad_events(created_at)');
// Aggregate only opted-in measurement events. Never return identities or raw event payloads.
function insights(days=30,now=Date.now()){
 days=[7,30,90].includes(Number(days))?Number(days):30;
 const start=Math.floor((now+kst)/day)*day-kst-(days-1)*day,end=now+1;
 const eligible=`FROM ad_events e JOIN users u ON u.id=e.user_id WHERE e.created_at>=? AND e.created_at<? AND coalesce(json_extract(u.data,'$.isTester'),0)=0 AND json_extract(e.data,'$.context.granted')=1`;
 const activity=db.sql.prepare(`SELECT e.name,count(*) events,count(DISTINCT e.user_id) users ${eligible} GROUP BY e.name`).all(start,end);
 // Cohort steps may occur in any order after the first measured visit.
 const reached=db.sql.prepare(`WITH eligible AS (SELECT e.* ${eligible}), entrants AS (SELECT user_id,min(created_at) entered FROM eligible WHERE name='new_visit' GROUP BY user_id) SELECT e.name,count(DISTINCT e.user_id) users FROM eligible e JOIN entrants c ON c.user_id=e.user_id AND e.created_at>=c.entered GROUP BY e.name`).all(start,end);
 const counts=new Map(reached.map(r=>[r.name,r.users])),base=counts.get('new_visit')||0;
 const dailyRows=db.sql.prepare(`SELECT strftime('%Y-%m-%d',e.created_at/1000,'unixepoch','+9 hours') day,e.name,count(DISTINCT e.user_id) users ${eligible} GROUP BY day,e.name`).all(start,end);
 const daily=Array.from({length:days},(_,i)=>({day:new Date(start+i*day+kst).toISOString().slice(0,10),...Object.fromEntries(stages.map(([name])=>[name,0]))}));
 const byDay=new Map(daily.map(r=>[r.day,r]));for(const r of dailyRows)if(byDay.has(r.day)&&stages.some(([name])=>name===r.name))byDay.get(r.day)[r.name]=r.users;
 const deliveries=db.sql.prepare(`SELECT e.name,d.destination,d.status,count(*) count FROM ad_deliveries d JOIN ad_events e ON e.id=d.event_id JOIN users u ON u.id=e.user_id WHERE e.created_at>=? AND e.created_at<? AND coalesce(json_extract(u.data,'$.isTester'),0)=0 AND json_extract(e.data,'$.context.granted')=1 AND d.destination IN ('meta_server','google_server') GROUP BY e.name,d.destination,d.status`).all(start,end);
 const revenue=db.sql.prepare(`SELECT coalesce(sum(json_extract(e.data,'$.value')),0) gross ${eligible} AND e.name='purchase'`).get(start,end).gross;
 return {days,start,end:now,cohortSize:base,stages:stages.map(([name,label])=>({name,label,cohortUsers:counts.get(name)||0,reach:base?Math.round((counts.get(name)||0)/base*1000)/10:null,...(activity.find(r=>r.name===name)||{events:0,users:0})})),daily,deliveries,revenue,health:db.sql.prepare('SELECT name,status,checked_at FROM ad_destination_health').all(),paymentEnabled:require('./portoneGateway').ready('payment'),scope:'consented_measurement',timezone:'Asia/Seoul'};
}
module.exports={insights};
