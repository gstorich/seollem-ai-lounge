const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite'),jwt=require('jsonwebtoken');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-matching-')),secret=crypto.randomBytes(48).toString('hex'),base='http://127.0.0.1:19414/api';
let child,sql,logs='';
async function request(route,token,body){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(route==='/auth/guest'&&data.token)assert.equal((await request('/legal/accept',data.token,{version:'2026-10-19.2',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200);return {status:response.status,...data};}
(async()=>{try{
 child=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'19414',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'test.sqlite'),JWT_SECRET:secret,GEMINI_API_KEY:'',OPENAI_API_KEY:'',DEFAULT_GUEST_HEARTS:'1.9'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,logs);
 sql=new DatabaseSync(path.join(dir,'test.sqlite'));
 const guest=await request('/auth/guest',null,{}),token=guest.token;
 function update(updates){const wallet=require('../services/heartWallet').createWallet(sql);const {hearts,...rest}=updates;if(hearts!==undefined)wallet.change(guest.user.id,Math.round((hearts-wallet.expire(guest.user.id).hearts)*10),'test_balance');const user=JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get(guest.user.id).data);Object.assign(user,rest);sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),user.id);}
 for(const hearts of [0,1.9,3.6]){
  update({hearts});const before=await request('/account/state',token);
  const access=await request('/match/eligibility',token);assert.equal(access.canMatch,false);assert.equal(access.heartsRemaining,hearts);assert.equal(access.requiredHearts,3.7);
  const blocked=await request('/match/request',token,{characterId:'p_0001'});assert.equal(blocked.status,402);assert.equal(blocked.error,'INSUFFICIENT_HEARTS');assert.equal(blocked.phoneVerified,false);assert.equal(blocked.phoneBonusHearts,100);
  const after=await request('/account/state',token);assert.deepEqual(after.savedRooms,before.savedRooms);assert.deepEqual(after.metCharIds,before.metCharIds);assert.equal(after.prevCharId,before.prevCharId);assert.equal(after.user.hearts,hearts);
 }
 for(const route of ['/payment/prepare','/payment/verify']){
  assert.equal((await request(route,null,{})).status,401);
  const denied=await request(route,token,{phone:'01000000001',pkgKey:'starter'});assert.equal(denied.status,403);assert.equal(denied.error,'PHONE_VERIFICATION_REQUIRED');
 }
 const service=require('../services/characterService');
 const catalog=service.getAllCharacters();
 assert.equal(catalog.filter(c=>c.gender==='male').length,1106);
 assert.equal(catalog.filter(c=>c.gender==='female').length,1250);
 for(const gender of ['male','female']){
  const ids=catalog.filter(c=>c.gender===gender).map(c=>c.id);
  assert.equal(service.findMatch({gender},ids).gender,gender,'Exhausted preferred gender pool resets within that gender');
 }
 const stateResponse=await fetch(base+'/account/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({matchFilter:{gender:'male',ages:['40'],traits:[],regions:[]}})});
 assert.equal(stateResponse.status,200);assert.equal((await request('/account/state',token)).matchFilter.gender,'male');
 update({hearts:3.7});
 const maleMatch=await request('/match/request',token,{});assert.equal(maleMatch.character.gender,'male');assert.equal(maleMatch.character.ageDecade,'40');
 assert.match(service.buildSystemPrompt(service.getCharacterById(maleMatch.character.id)),/문장을 중간에서 끊지/);
 update({hearts:3.7});assert.equal((await request('/match/eligibility',token)).canMatch,true);
 const matched=await request('/match/request',token,{characterId:'p_0001'});assert.equal(matched.status,200);assert.equal(matched.character.id,'p_0001');assert.equal(matched.heartsRemaining,3.7);assert.equal((await request('/account/state',token)).user.hearts,3.7,'Matching itself does not debit hearts');
 update({hearts:0});assert.equal((await request('/match/request',token,{characterId:'p_0002'})).status,402,'Balance is checked again after preflight');
 update({hearts:0,isVipUnlimited:true});assert.equal((await request('/match/request',token,{characterId:'p_0002'})).status,200,'Existing unlimited entitlement remains valid');
 const phone='01000000001',member={id:phone,phone,hearts:0,createdAt:Date.now(),savedRooms:{},metCharIds:[]};sql.prepare('INSERT INTO users VALUES(?,?,?)').run(phone,phone,JSON.stringify(member));const memberToken=jwt.sign({userId:phone},secret,{expiresIn:'1h'});
 assert.equal((await request('/legal/accept',memberToken,{version:'2026-10-19.2',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200);
 const memberBlocked=await request('/match/request',memberToken,{});assert.equal(memberBlocked.status,402);assert.equal(memberBlocked.phoneVerified,true);
 for(const route of ['/payment/prepare','/payment/verify']){const pending=await request(route,memberToken,{pkgKey:'starter'});assert.equal(pending.status,503);assert.equal(pending.error,'PAYMENT_NOT_READY');}
 assert.equal(sql.prepare('SELECT count(*) n FROM orders').get().n,0);
 console.log('PASS: sub-turn balance matching gate, no rejected-match mutation, exact threshold, authoritative recheck, existing VIP entitlement, verified-phone payment prerequisite and production payment guard');
}catch(e){console.error(e);process.exitCode=1;}finally{if(child&&child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}sql?.close();fs.rmSync(dir,{recursive:true,force:true});}})();
