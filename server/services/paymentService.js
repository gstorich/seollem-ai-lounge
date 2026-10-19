const crypto=require('node:crypto'),db=require('./dbService'),gateway=require('./portoneGateway');
const {units}=require('./heartWallet'),packages=require('../../products.json');
db.sql.exec(`CREATE TABLE IF NOT EXISTS payment_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payment_receipts(imp_uid TEXT PRIMARY KEY,order_id TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS payment_refunds(order_id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
const locks=new Set();
function error(code,status=400){return Object.assign(Error(code),{status});}
function get(id){const r=db.sql.prepare('SELECT data FROM payment_orders WHERE id=?').get(id);return r?JSON.parse(r.data):null;}
function save(o){o.updatedAt=Date.now();db.sql.prepare('UPDATE payment_orders SET data=? WHERE id=?').run(JSON.stringify(o),o.id);return o;}
function grant(o){return o.grantId?db.sql.prepare('SELECT * FROM heart_grants WHERE id=? AND user_id=?').get(o.grantId,o.userId):null;}
function refundRecord(id){const r=db.sql.prepare('SELECT data FROM payment_refunds WHERE order_id=?').get(id);return r?JSON.parse(r.data):null;}
function saveRefund(r){db.sql.prepare('INSERT INTO payment_refunds VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET data=excluded.data').run(r.orderId,JSON.stringify(r));}
async function locked(id,fn){if(locks.has(id))throw error('PAYMENT_BUSY',409);locks.add(id);try{return await fn();}finally{locks.delete(id);}}
function publicOrder(o){db.getUser(o.userId);const g=grant(o),r=refundRecord(o.id);return {id:o.id,name:o.name,price:o.price,hearts:o.hearts,createdAt:o.createdAt,status:o.status,cancelledAmount:o.cancelledAmount||0,remainingPaidHearts:(g?.remaining_units||0)/10,refundableAmount:g?Math.min(o.price-(o.cancelledAmount||0),Math.floor(o.price*g.remaining_units/g.granted_units)):0,refundPending:r?.status==='pending',reviewRequired:Boolean(o.reviewRequired)};}
function create(user,pkgKey){
 if(!gateway.ready('payment'))throw error('PAYMENT_NOT_READY',503);if(!user.phone)throw error('PHONE_VERIFICATION_REQUIRED',403);
 const pkg=packages.find(p=>p.id===pkgKey);if(!pkg)throw error('INVALID_PACKAGE');const id='azit_'+crypto.randomBytes(16).toString('hex'),createdAt=Date.now();
 const o={id,userId:user.id,name:pkg.name,price:pkg.price,hearts:pkg.hearts,status:'pending',createdAt,termsVersion:'2026-10-18',checkoutConfirmedAt:createdAt,mode:gateway.settings.mode,pgId:gateway.settings.pgId,channelKey:gateway.settings.channelKey,nonce:crypto.randomBytes(24).toString('hex'),cancelledAmount:0};
 db.sql.prepare('INSERT INTO payment_orders VALUES(?,?,?,?)').run(id,user.id,JSON.stringify(o),createdAt);
 return {order:publicOrder(o),userCode:gateway.settings.userCode,request:{channelKey:o.channelKey,pay_method:'card',merchant_uid:id,name:o.name,amount:o.price,currency:'KRW',buyer_tel:user.phone,custom_data:{azitOrder:o.nonce},m_redirect_url:gateway.settings.origin+'/payment/complete?orderId='+id,notice_url:gateway.settings.origin+'/api/payment/webhook'}};
}
function validate(o,p){
 let custom=p.custom_data;try{if(typeof custom==='string')custom=JSON.parse(custom);}catch{custom=null;}
 if(p.merchant_uid!==o.id||p.amount!==o.price||p.name!==o.name||p.currency!=='KRW'||p.pay_method!=='card'||p.pg_provider!=='danal_tpay'||p.pg_id!==o.pgId||custom?.azitOrder!==o.nonce||!/^imp_[a-zA-Z0-9_]+$/.test(p.imp_uid||'')||!Number.isInteger(p.cancel_amount)||p.cancel_amount<0||p.cancel_amount>o.price||!['paid','cancelled','failed','ready'].includes(p.status))throw error('PAYMENT_MISMATCH',409);
 if(o.impUid&&o.impUid!==p.imp_uid)throw error('PAYMENT_MISMATCH',409);
}
function apply(id,p){return db.transaction(()=>{
 const o=get(id);if(!o)throw error('ORDER_NOT_FOUND',404);validate(o,p);
 const bound=db.sql.prepare('SELECT order_id FROM payment_receipts WHERE imp_uid=?').get(p.imp_uid);if(bound&&bound.order_id!==id)throw error('PAYMENT_MISMATCH',409);
 if(p.cancel_amount<(o.cancelledAmount||0))throw error('STALE_PAYMENT',409);db.getUser(o.userId);
 if(!o.grantId&&['paid','cancelled'].includes(p.status)&&p.cancel_amount<o.price){db.sql.prepare('INSERT INTO payment_receipts VALUES(?,?)').run(p.imp_uid,id);db.creditHearts(o.userId,o.hearts,'payment:'+id);o.grantId=db.sql.prepare('SELECT id FROM heart_grants WHERE user_id=? AND reason=?').get(o.userId,'payment:'+id).id;o.impUid=p.imp_uid;o.paidAt=Date.now();}
 if(!o.grantId){o.status=p.cancel_amount>0?'cancelled_before_credit':p.status;o.cancelledAmount=p.cancel_amount;return save(o);}
 const r=refundRecord(id),g=grant(o);if(r?.status==='pending'&&p.cancel_amount>=r.targetCancelled){r.status='completed';r.completedAt=Date.now();saveRefund(r);}
 const target=Math.ceil(units(o.hearts)*p.cancel_amount/o.price),held=r?.units||0,additional=Math.max(0,target-(o.revokedUnits||0)-held),take=Math.min(g.remaining_units,additional);
 if(take){db.sql.prepare('UPDATE heart_grants SET remaining_units=remaining_units-?,removed_units=removed_units+? WHERE id=?').run(take,take,g.id);db.sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(o.userId,-take,'payment_cancel:'+id,Date.now());}
 o.revokedUnits=(o.revokedUnits||0)+take;if(additional>take)o.reviewRequired=true;o.cancelledAmount=p.cancel_amount;o.status=p.cancel_amount===o.price?'refunded':p.cancel_amount>0?'partially_refunded':'paid';db.getUser(o.userId);return save(o);
});}
async function reconcile(id,imp){if(!gateway.ready('payment'))throw error('PAYMENT_NOT_READY',503);return locked(id,async()=>{const o=get(id);if(!o)throw error('ORDER_NOT_FOUND',404);const p=imp?await gateway.payment(imp):o.impUid?await gateway.payment(o.impUid):await gateway.find(id);return apply(id,p);});}
async function refund(id,userId){
 if(!gateway.ready('payment'))throw error('PAYMENT_NOT_READY',503);
 return locked(id,async()=>{
  let o=get(id);if(!o||o.userId!==userId)throw error('ORDER_NOT_FOUND',404);if(!o.impUid)throw error('PAYMENT_NOT_PAID',409);
  let p=await gateway.payment(o.impUid);o=apply(id,p);const existing=refundRecord(id);if(existing?.status==='pending')throw error('REFUND_CHECK_PENDING',409);if(existing?.status==='completed')return publicOrder(o);
  const held=db.transaction(()=>{db.getUser(userId);const g=grant(o);if(!g||g.remaining_units<=0)throw error('NO_REFUNDABLE_HEARTS',409);const amount=Math.min(o.price-p.cancel_amount,Math.floor(o.price*g.remaining_units/g.granted_units));if(amount<1)throw error('CONTACT_SUPPORT_FOR_REFUND',409);
   const r={orderId:id,units:g.remaining_units,amount,targetCancelled:p.cancel_amount+amount,status:'pending',createdAt:Date.now()};db.sql.prepare('UPDATE heart_grants SET removed_units=removed_units+remaining_units,remaining_units=0 WHERE id=?').run(g.id);db.sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(userId,-r.units,'refund_hold:'+id,Date.now());saveRefund(r);db.getUser(userId);return r;});
  // Timeouts keep a durable hold; never automatically retry a money movement.
  let accepted=false;
  try{await gateway.cancel(o.impUid,held.amount,o.price-p.cancel_amount);accepted=true;p=await gateway.payment(o.impUid);o=apply(id,p);}catch(e){
   if(!accepted&&e.definitive){
    let latest;try{latest=await gateway.payment(o.impUid);validate(o,latest);}catch{throw error('REFUND_CHECK_PENDING',503);}
    if(latest.cancel_amount>=held.targetCancelled){o=apply(id,latest);return publicOrder(o);}
    db.transaction(()=>{const g=grant(o),r=refundRecord(id);if(r.status!=='pending')return;db.sql.prepare('UPDATE heart_grants SET remaining_units=remaining_units+?,removed_units=removed_units-? WHERE id=?').run(r.units,r.units,g.id);db.sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(userId,r.units,'refund_rejected:'+id,Date.now());r.status='rejected';r.units=0;saveRefund(r);apply(id,latest);});
    throw error('REFUND_REJECTED',503);
   }
   throw error('REFUND_CHECK_PENDING',503);
  }
  if(refundRecord(id).status==='pending')throw error('REFUND_CHECK_PENDING',503);return publicOrder(o);
 });
}
function list(userId){return db.sql.prepare('SELECT data FROM payment_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId).map(r=>publicOrder(JSON.parse(r.data)));}
function startWorker(){let running=false;const timer=setInterval(async()=>{if(running||!gateway.ready('payment'))return;running=true;try{const all=db.sql.prepare('SELECT data FROM payment_orders ORDER BY created_at DESC').all().map(r=>JSON.parse(r.data)),due=all.filter(o=>{const checkingRefund=refundRecord(o.id)?.status==='pending',pending=!o.grantId&&Date.now()-o.createdAt<86400000,paid=o.impUid&&o.status!=='refunded';return (checkingRefund||pending||paid)&&Date.now()-(o.checkedAt||0)>=(checkingRefund||pending?60000:86400000);});due.sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0));for(const o of due.slice(0,30)){try{await reconcile(o.id);}catch{}const fresh=get(o.id);if(fresh){fresh.checkedAt=Date.now();save(fresh);}}}finally{running=false;}},60000);timer.unref();return ()=>clearInterval(timer);}
module.exports={create,get,list,publicOrder,reconcile,refund,startWorker};
