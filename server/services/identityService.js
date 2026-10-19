const crypto=require('node:crypto'),db=require('./dbService'),gateway=require('./portoneGateway');
db.sql.exec('CREATE TABLE IF NOT EXISTS identity_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,data TEXT NOT NULL)');
function error(code,status=400){return Object.assign(Error(code),{status});}
function status(user){return {verified:Boolean(user.identityVerification?.verified),isAdult:Boolean(user.identityVerification?.isAdult),verifiedAt:user.identityVerification?.verifiedAt||null};}
function create(user){if(!gateway.ready('identity'))throw error('IDENTITY_NOT_READY',503);if(!user.phone)throw error('PHONE_VERIFICATION_REQUIRED',403);const id='identity_'+crypto.randomUUID(),now=Date.now();db.sql.prepare('DELETE FROM identity_requests WHERE expires_at<?').run(now-86400000);if(db.sql.prepare('SELECT count(*) n FROM identity_requests WHERE user_id=? AND expires_at>?').get(user.id,now-3600000).n>=8)throw error('IDENTITY_RATE_LIMIT',429);db.sql.prepare('INSERT INTO identity_requests VALUES(?,?,?,?)').run(id,user.id,now+15*60000,JSON.stringify({phone:user.phone,channel:gateway.settings.identityChannel,mode:gateway.settings.mode,storeId:gateway.settings.storeId}));return {storeId:gateway.settings.storeId,channelKey:gateway.settings.identityChannel,identityVerificationId:id,customer:{phoneNumber:user.phone},redirectUrl:gateway.settings.origin+'/verification/complete'};}
async function complete(user,id){
 const row=typeof id==='string'&&/^identity_[a-f0-9-]{36}$/.test(id)?db.sql.prepare('SELECT * FROM identity_requests WHERE id=? AND user_id=?').get(id,user.id):null;if(!row)throw error('IDENTITY_NOT_FOUND',404);
 const own=JSON.parse(row.data);if(own.result)return own.result;if(row.expires_at<Date.now())throw error('IDENTITY_EXPIRED',409);
 if(!gateway.ready('identity'))throw error('IDENTITY_NOT_READY',503);
 const result=await gateway.identity(id,own.storeId),customer=result.verifiedCustomer;
 // Phone data requires a Danal contract option. Missing phone fails closed rather
 // than attributing somebody else's identity to an existing phone account.
 if(result.id!==id||result.status!=='VERIFIED'||result.channel?.key!==own.channel||result.channel?.pgProvider!=='DANAL'||result.channel?.type!==(own.mode==='live'?'LIVE':'TEST')||!customer||customer.phoneNumber!==own.phone||!/^\d{4}-\d{2}-\d{2}$/.test(customer.birthDate||''))throw error('IDENTITY_MISMATCH',409);
 const birth=new Date(customer.birthDate+'T00:00:00Z');if(!Number.isFinite(+birth)||birth.toISOString().slice(0,10)!==customer.birthDate||+birth>Date.now())throw error('IDENTITY_MISMATCH',409);
 const now=new Date(Date.now()+9*3600000),anniversary=Number(now.toISOString().slice(0,10).replaceAll('-',''))-190000,isAdult=Number(customer.birthDate.replaceAll('-',''))<=anniversary;
 return db.transaction(()=>{const fresh=db.sql.prepare('SELECT data FROM identity_requests WHERE id=?').get(id),current=JSON.parse(fresh.data);if(current.result)return current.result;const minimal={verified:true,isAdult,isAtLeast18:Number(customer.birthDate.replaceAll('-',''))<=Number(now.toISOString().slice(0,10).replaceAll('-',''))-180000,verifiedAt:Date.now()};db.updateUser(user.id,{identityVerification:minimal});current.result=minimal;db.sql.prepare('UPDATE identity_requests SET data=? WHERE id=?').run(JSON.stringify(current),id);return minimal;});
}
module.exports={status,create,complete};
