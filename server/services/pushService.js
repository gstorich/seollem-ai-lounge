const webpush=require('web-push'),crypto=require('node:crypto');
const db=require('./dbService'),store=require('./proactiveStore');
const publicKey=process.env.VAPID_PUBLIC_KEY||'',privateKey=process.env.VAPID_PRIVATE_KEY||'';
const ready=Boolean(publicKey&&privateKey);
if(ready)webpush.setVapidDetails('https://azitchat.com/support',publicKey,privateKey);
function validSubscription(value){
 try{
   if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)return false;
   const u=new URL(value.endpoint);
   // Never send an authenticated server request to arbitrary client URLs.
   const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='android.googleapis.com'||u.hostname==='web.push.apple.com'||u.hostname==='updates.push.services.mozilla.com'||/^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
   if(!allowed||u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash)return false;
   const auth=Buffer.from(value.keys?.auth||'','base64url'),p256dh=Buffer.from(value.keys?.p256dh||'','base64url');
   if(auth.length!==16||p256dh.length!==65||p256dh[0]!==4)return false;
   crypto.ECDH.convertKey(p256dh,'prime256v1');return true;
 }catch{return false;}
}
function subscribe(id,value){
 if(!validSubscription(value))throw Error('INVALID_SUBSCRIPTION');
 const data={endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
 db.transaction(()=>{
   const owned=db.sql.prepare('SELECT count(*) n FROM push_subscriptions WHERE user_id=? AND endpoint!=?').get(id,value.endpoint).n;
   if(owned>=8)throw Error('DEVICE_LIMIT');
   db.sql.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,data=excluded.data,created_at=excluded.created_at').run(value.endpoint,id,JSON.stringify(data),Date.now());
 });
}
async function deliverPending(send=webpush.sendNotification){
 if(!ready&&send===webpush.sendNotification)return;
 const now=Date.now();
 const hour=new Date(now+9*3600000).getUTCHours();if(hour<10||hour>=22)return;
 for(const delivery of db.sql.prepare("SELECT * FROM proactive_deliveries WHERE push_status='pending' AND next_attempt<=? ORDER BY id LIMIT 10").all(now)){
   const user=db.getUser(delivery.user_id),message=user?.savedRooms?.[delivery.character_id]?.messages.find(m=>m.id===delivery.message_id);
   if(!store.preferences(delivery.user_id).enabled||!message||message.unread===false||now-delivery.created_at>DAY){
     db.sql.prepare("UPDATE proactive_deliveries SET push_status='cancelled' WHERE id=?").run(delivery.id);continue;
   }
   let retry=false;
   // Generic lock-screen content; private conversation text and phone never leave
   // the server in a push payload. A click loads the authenticated room instead.
   const payload=JSON.stringify({title:'아지트챗',body:'대화 상대에게 새 메시지가 왔어요',tag:'azit-contact-'+delivery.id,characterId:delivery.character_id});
   for(const row of db.sql.prepare('SELECT endpoint,data FROM push_subscriptions WHERE user_id=?').all(delivery.user_id)){
     if(db.sql.prepare('SELECT 1 FROM push_delivery_receipts WHERE delivery_id=? AND endpoint=?').get(delivery.id,row.endpoint))continue;
     try{await send(JSON.parse(row.data),payload,{TTL:3600,urgency:'normal',timeout:5000});db.sql.prepare('INSERT OR IGNORE INTO push_delivery_receipts VALUES(?,?)').run(delivery.id,row.endpoint);}
     catch(error){
       if([404,410].includes(error.statusCode))db.sql.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(row.endpoint,delivery.user_id);
       else retry=true;
     }
   }
   db.sql.prepare("UPDATE proactive_deliveries SET push_status=?,attempts=attempts+1,next_attempt=? WHERE id=?").run(retry&&delivery.attempts<2?'pending':'done',now+15*60000,delivery.id);
 }
}
const DAY=86400000;
async function sendNotificationToUser(userId, characterId, text, send = webpush.sendNotification) {
  if (!ready && send === webpush.sendNotification) return;
  try {
    const payload = JSON.stringify({
      tag: 'azit-chat-' + characterId,
      characterId
    });
    const rows = db.sql.prepare('SELECT endpoint, data FROM push_subscriptions WHERE user_id=?').all(userId);
    for (const row of rows) {
      try {
        await send(JSON.parse(row.data), payload, { TTL: 3600, urgency: 'high', timeout: 5000 });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          db.sql.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(row.endpoint, userId);
        }
      }
    }
  } catch (e) {
    console.warn('[push] sendNotificationToUser failed:', e.message);
  }
}
module.exports={ready,publicKey,validSubscription,subscribe,deliverPending,sendNotificationToUser};
