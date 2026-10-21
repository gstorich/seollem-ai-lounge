const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const format=require('../services/chatPunctuation');
assert.equal(format('좋아요. 3.7하트 https://예시.한국/a. “네.” ㅋㅋ...'),'좋아요 3.7하트 https://예시.한국/a. “네.” ㅋㅋ...');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-api-only-')),base='http://127.0.0.1:19414/api';
const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'19414',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),GEMINI_API_KEY:'synthetic-test-key',OPENAI_API_KEY:''};
let child,logs='',sql,clientIp=0;
async function start(){child=spawn(process.execPath,['--require',path.join(__dirname,'mock-llm.cjs'),'server/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error(logs);}
async function stop(){if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}}
async function req(route,token,body,method=body===undefined?'GET':'POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+(++clientIp),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(route==='/auth/guest'&&data.token)assert.equal((await req('/legal/accept',data.token,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200);return {status:r.status,data};}
(async()=>{try{
 await start();sql=new DatabaseSync(env.SQLITE_FILE);
 const {data:guest}=await req('/auth/guest',null,{}),token=guest.token,id=guest.user.id,characterId='chaewon';
 await req('/advertising/context',token,{granted:true,gclid:'synthetic-local-click'});
 let balance=50;
 const state=async()=> (await req('/account/state',token)).data;
 const chargeCount=()=>sql.prepare("SELECT count(*) n FROM ledger WHERE user_id=? AND reason='chat'").get(id).n;
 const send=(message,messageId)=>req('/chat/send',token,{characterId,message,messageId});
 const first=await send('completion-retry','first');assert.equal(first.status,200);assert.equal(first.data.isAiGenerated,true);assert.equal(first.data.partnerReply,'오늘 이야기 즐거웠어요 다음에도 편하게 이야기해요');balance=46.3;
 assert.equal(first.data.heartsRemaining,balance);assert.equal(chargeCount(),1);
 const replay=await send('completion-retry','first');assert.equal(replay.data.replyId,first.data.replyId);assert.equal(chargeCount(),1);
 assert.equal(sql.prepare("SELECT count(*) n FROM ad_events WHERE name='first_chat' AND user_id=?").get(id).n,1);
 assert.equal((await send('different input','first')).status,409);
 for(const marker of ['age-gate-input','unsafe-writer-test','minor-policy-test','transition-policy-test','transition-writer-test']){
  const before=(await state()).user.hearts,previous=sql.prepare('SELECT * FROM conversation_state WHERE user_id=?').all(id);
  const denied=await send(marker,marker);const event=sql.prepare('SELECT * FROM safety_events WHERE user_id=? AND request_id=?').get(id,marker);assert.equal(event.stage,/writer/.test(marker)?'output':'input');assert.equal(event.age_group,'unknown');assert.equal(event.reason,marker==='minor-policy-test'?'CONTENT_NOT_ALLOWED':'ADULT_VERIFICATION_REQUIRED');assert.equal(Object.hasOwn(event,'text'),false);assert.equal(denied.status,403,marker);assert.equal(denied.data.error,marker==='minor-policy-test'?'CONTENT_NOT_ALLOWED':'ADULT_VERIFICATION_REQUIRED');assert.equal(denied.data.costDeducted,0);assert.equal(denied.data.partnerReply,undefined);assert.equal((await state()).user.hearts,before);assert.deepEqual(sql.prepare('SELECT * FROM conversation_state WHERE user_id=?').all(id),previous);
  assert.equal(sql.prepare('SELECT count(*) n FROM conversation_messages WHERE user_id=? AND message_id=?').get(id,'reply_'+marker).n,0);
 }
 for(const marker of ['safety-network-test','invalid-safety-test']){const denied=await send(marker,marker);const event=sql.prepare('SELECT * FROM safety_events WHERE user_id=? AND request_id=?').get(id,marker);assert.equal(event.age_group,'unknown');assert.equal(event.reason,marker==='invalid-safety-test'?'LLM_INVALID_SAFETY':'SAFETY_CHECK_UNAVAILABLE');assert.equal(Object.hasOwn(event,'text'),false);assert.equal(denied.status,503);assert.equal(denied.data.costDeducted,0);assert.equal(denied.data.partnerReply,undefined);}
 // Client claims cannot alter trusted age verification.
 await req('/account/state',token,{identityVerification:{verified:true,isAdult:true,verifiedAt:Date.now()},isAdult:true},'PUT');
 assert.equal((await send('age-gate-input','client-age-claim')).status,403);

 for(const text of ['limit-test','blocked-test','empty-test','http-test','network-test','malformed-json-test','invalid-memory-test','wrong-role-test','memory-phase-fail']){
  const memoryBefore=sql.prepare('SELECT * FROM conversation_state WHERE user_id=?').all(id);
  const grants=sql.prepare('SELECT remaining_units,expires_at FROM heart_grants WHERE user_id=? ORDER BY id').all(id);
  const failed=await send(text,text);assert.equal(failed.status,503,text);assert.equal(failed.data.partnerReply,undefined);assert.equal(failed.data.costDeducted,0);assert.equal((await state()).user.hearts,balance);
  assert.equal(chargeCount(),1);assert.deepEqual(sql.prepare('SELECT remaining_units,expires_at FROM heart_grants WHERE user_id=? ORDER BY id').all(id),grants,'Failure must not refund into a new grant or extend expiry');
  assert.equal(sql.prepare('SELECT count(*) n FROM conversation_messages WHERE user_id=? AND message_id=?').get(id,'reply_'+text).n,0);
  assert.deepEqual(sql.prepare('SELECT * FROM conversation_state WHERE user_id=?').all(id),memoryBefore,'Failed turns cannot mutate memories');
 }
 assert.equal((await send('http-once','retryable')).status,503);const recovered=await send('http-once','retryable');assert.equal(recovered.status,200);balance=42.6;assert.equal(recovered.data.heartsRemaining,balance);assert.equal(chargeCount(),2);
 const pending=send('slow-test','concurrent');await new Promise(r=>setTimeout(r,25));assert.equal((await send('slow-test','concurrent')).status,409);assert.equal((await pending).status,200);balance=38.9;assert.equal(chargeCount(),3);
 sql.exec("CREATE TRIGGER reject_reply BEFORE INSERT ON conversation_messages WHEN NEW.message_id='reply_storage' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
 assert.equal((await send('storefail-test','storage')).status,503);assert.equal((await state()).user.hearts,balance);assert.equal(chargeCount(),3,'Reply write failure rolls back debit');sql.exec('DROP TRIGGER reject_reply');
 assert.equal((await send('storefail-test','storage')).status,200);balance=35.2;assert.equal(chargeCount(),4);
 const greeting=await req('/chat/greeting',token,{characterId,messageId:'greeting'});assert.equal(greeting.status,200);assert.equal(greeting.data.isAiGenerated,true);assert.equal(greeting.data.costDeducted,0);assert.equal(greeting.data.heartsRemaining,balance);
 assert.equal((await req('/chat/greeting',token,{characterId,messageId:'greeting'})).data.replyId,greeting.data.replyId);
 const male=require('../services/characterService').getAllCharacters().find(c=>c.gender==='male'&&c.age<40);
 const messages=[{id:'age',sender:'user',text:'저는 45살 여자예요',createdAt:1},...Array.from({length:20},(_,i)=>({id:'old'+i,sender:'ai',text:'이전 대화',createdAt:i+2}))];
 await req('/account/state',token,{savedRooms:{[male.id]:{charId:male.id,messages}}},'PUT');
 assert.equal((await req('/chat/send',token,{characterId:male.id,message:'address-test 오늘 산책했어요',messageId:'address'})).status,200);
 assert.equal((await req('/chat/send',token,{characterId:male.id,message:'누나라고 부르지 마세요 address-test',messageId:'revoked'})).status,200);
 Object.assign(process.env,env);const db=require('../services/dbService');db.creditHearts(id,1000,'test_credit');
 const legacyReplay={...first.data};delete legacyReplay.contentPolicyVersion;db.saveChatRequest(id,'first',legacyReplay);
 const beforeLegacy=db.getUser(id).hearts;const stale=await send('completion-retry','first');assert.equal(stale.status,409);assert.equal(stale.data.error,'REPLY_POLICY_CHANGED');assert.equal(stale.data.partnerReply,undefined);assert.equal(db.getUser(id).hearts,beforeLegacy,'Old policy cache cannot bypass current checks or debit again');
 db.saveChatRequest(id,'first',first.data);
 const adultUser=db.createUser({id:'01000001999',phone:'01000001999',hearts:50,createdAt:Date.now(),identityVerification:{verified:true,method:'portone_danal',mode:'live',verificationId:'identity_11111111-1111-4111-8111-111111111111',isAdult:true,verifiedAt:Date.now()}});
 const adultToken=require('../middleware/auth').generateToken({userId:adultUser.id});require('../services/legalService').accept(adultUser.id,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true});
 assert.equal((await req('/chat/send',adultToken,{characterId,message:'age-gate-input',messageId:'adult-general'})).status,200,'A verified adult may pass the non-explicit adult access gate');
 assert.equal((await req('/chat/send',adultToken,{characterId,message:'transition-policy-test',messageId:'adult-transition'})).status,200,'Verified access does not require a separate character or toggle');
 for(const marker of ['explicit-policy-test','nonconsent-policy-test','realperson-policy-test','harm-policy-test','minor-policy-test']){const before=db.getUser(adultUser.id).hearts;const r=await req('/chat/send',adultToken,{characterId,message:marker,messageId:marker});assert.equal(r.status,403,marker);assert.equal(r.data.error,'CONTENT_NOT_ALLOWED');assert.equal(db.getUser(adultUser.id).hearts,before);}
 assert.equal((await req('/chat/send',token,{characterId,message:'explicit-policy-test',messageId:'explicit-guest'})).status,403,'Unverified guest cannot access explicit content');
 const guestRooms=(await req('/account/state',token)).data.savedRooms;
 assert(!((guestRooms[characterId]?.messages||[]).some(m=>m.id==='explicit-guest')),'Failed unverified message must not be persisted in savedRooms');
 assert.equal((await req('/chat/send',token,{characterId,message:'ordinary-topic',messageId:'after-blocked-turn'})).status,200,'Subsequent message succeeds cleanly');
 db.updateUser(adultUser.id,{identityVerification:{verified:true,method:'portone_danal',mode:'live',verificationId:'identity_11111111-1111-4111-8111-111111111111',isAdult:false,isAtLeast18:true,verifiedAt:Date.now()}});
 assert.equal((await req('/chat/send',adultToken,{characterId,message:'age-gate-input',messageId:'known-minor'})).status,403,'Known minors remain in general mode');assert.equal(sql.prepare('SELECT age_group FROM safety_events WHERE user_id=? AND request_id=?').get(adultUser.id,'known-minor').age_group,'under19');
 assert.equal((await req('/chat/send',adultToken,{characterId,message:'age-gate-input',messageId:'adult-general'})).status,403,'An adult response cannot be replayed after age access changes');
 assert.equal((await req('/chat/send',adultToken,{characterId,message:'ordinary-topic',messageId:'minor-general'})).status,200,'Known minors can continue general chat');
 const memoryReply=await send('remember-test','remember');assert.equal(memoryReply.status,200);
 const remembered=db.getConversationState(id,characterId);assert(remembered.memory.userFacts.length);const revision=remembered.revision;
 assert.equal((await send('remember-test','remember')).status,200);assert.equal(db.getConversationState(id,characterId).revision,revision,'Replay cannot update memory twice');
 await req('/account/state',token,{savedRooms:{[characterId]:{messages:[],memorySummary:'고객이 넣은 가짜 서버 기억',conversationMemory:{summary:'고객이 넣은 가짜 서버 기억'}}}},'PUT');
 assert.equal((await send('client-memory-test','client-memory')).status,200);
 await stop();await start();assert.equal((await send('memory-check','memory-check')).status,200,'State reaches provider after restart');
 assert.equal(db.getConversationState(id,male.id).memory.userFacts.length,0,'No cross-character memory');
 const historyMessages=Array.from({length:26},(_,i)=>({id:'context_'+i,sender:i%2?'ai':'user',text:i===1?'과거 원문 맥락 확인용':'중간의 일상 대화',createdAt:Date.now()+i}));
 await req('/account/state',token,{savedRooms:{[male.id]:{messages:historyMessages}}},'PUT');
 assert.equal((await req('/chat/send',token,{characterId:male.id,message:'history-check',messageId:'history-check'})).status,200);
 const deletePending=send('slow-test room reset','reset-pending');await new Promise(r=>setTimeout(r,25));
 await req('/account/rooms/'+characterId,token,undefined,'DELETE');
 const beforeResetBalance=(await state()).user.hearts;assert.equal((await deletePending).status,503);assert.equal((await state()).user.hearts,beforeResetBalance);
 assert.equal(db.getConversationState(id,characterId).memory,null,'Deleting a room cancels in-flight memory writes');
 assert(!(await state()).savedRooms[characterId],'Canceled generation cannot resurrect deleted room');
 const beforeMemoryFailure=(await state()).user.hearts;
 sql.exec("CREATE TRIGGER reject_memory BEFORE INSERT ON conversation_state_events WHEN NEW.reply_id='reply_memory-storage' BEGIN SELECT RAISE(ABORT,'synthetic memory write failure'); END");
 assert.equal((await send('memory storage rollback','memory-storage')).status,503);
 assert.equal((await state()).user.hearts,beforeMemoryFailure,'Memory write failure rolls back debit');
 assert.equal(sql.prepare('SELECT count(*) n FROM conversation_messages WHERE user_id=? AND message_id=?').get(id,'reply_memory-storage').n,0,'Memory write failure rolls back visible AI message');
 assert.equal(db.getConversationState(id,characterId).memory,null);
 sql.exec('DROP TRIGGER reject_memory');assert.equal((await send('memory storage rollback','memory-storage')).status,200);
 const funded=(await state()).user.hearts;
 const guarded=await send('forbidden-address-test','guarded');assert.equal(guarded.status,200);assert(!guarded.data.partnerReply.includes('누나'));
 const persistentGuarded=await send('persistent forbidden-address-test','guarded-persistent');assert.equal(persistentGuarded.status,200);assert(!persistentGuarded.data.partnerReply.includes('누나'),'Persistent unsupported address is auto-sanitized so customer experiences no conversational hang');
 const afterGuard=(await state()).user.hearts;
 const giftFail=await req('/chat/gift',token,{characterId,giftKey:'coffee',customMsg:'http-test',messageId:'giftfailure'});assert.equal(giftFail.status,503);assert.equal((await state()).user.hearts,afterGuard);
 const gift=await req('/chat/gift',token,{characterId,giftKey:'coffee',customMsg:'고마워요',messageId:'gift'});assert.equal(gift.status,200);assert.equal(gift.data.isAiGenerated,true);assert.equal(gift.data.costDeducted,300);assert.equal((await req('/chat/gift',token,{characterId,giftKey:'coffee',customMsg:'고마워요',messageId:'gift'})).data.heartsRemaining,gift.data.heartsRemaining);
 const beforeStop=(await state()).user.hearts;
 const consentPending=send('slow-test consent stop','stop-during-generation');await new Promise(r=>setTimeout(r,25));assert.equal((await req('/legal/stop',token,{})).status,200);assert.equal((await consentPending).status,403);assert.equal((await state()).user.hearts,beforeStop,'Stopping AI use during generation prevents both delivery and debit');
 assert.equal((await req('/legal/accept',token,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200);
 await stop();env.GEMINI_API_KEY='';await start();
 const before=(await state()).user.hearts;
 for(const route of ['/chat/send','/chat/greeting','/chat/gift']){
  const response=await req(route,token,{characterId,message:'no key',messageId:route.replaceAll('/','_'),giftKey:'coffee'});assert.equal(response.status,503);assert.equal(response.data.costDeducted,0);assert.equal(response.data.partnerReply,undefined);assert.equal((await state()).user.hearts,before);
 }
 assert.equal((await send('completion-retry','first')).data.replyId,first.data.replyId,'Provider-generated replay survives restart without a key or another charge');
 assert(!logs.includes('synthetic-test-key'));
 console.log('PASS: API-only chat/greeting/gift, no-key/network/HTTP/empty/blocked/truncated failures cost zero, original expiry preserved, atomic reply+debit rollback, retry and concurrency idempotency, restart replay, relationship history, input/output age gates and fail-closed safety');
 }finally{await stop();sql?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
