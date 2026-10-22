const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-reply-recovery-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),auth=require('../middleware/auth'),legal=require('../services/legalService'),llm=require('../services/llmService'),express=require('express');
(async()=>{let server;try{
 const id='reply-recovery';db.createUser({id});legal.accept(id,{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});
 const app=express();app.use(express.json());app.use('/api/chat',require('../routes/chat'));app.use('/api/account',require('../routes/account'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api',headers={'Content-Type':'application/json',Authorization:'Bearer '+auth.generateToken({userId:id})};
 const first=await(await fetch(base+'/account/sync',{headers})).json();assert.equal((await fetch(base+'/account/sync')).status,401);
 let entered,release,calls=0;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
 llm.generateReply=async()=>{calls++;entered();await held;return {isAiGenerated:true,text:'첫 말풍선과 나중 말풍선이 모두 들어 있는 실제 답변',roomLeft:false,memory:{summary:'',userFacts:[],characterFacts:[],sharedEvents:[],openThreads:[],agreements:[],state:{scene:'',characterEmotion:'',userEmotion:'',relationship:'',lastBeat:'',sourceIds:[]}}};};
 const body=JSON.stringify({characterId:'chaewon',message:'새로고침 중 답변 복구',messageId:'recover-one'}),controller=new AbortController();
 const pending=fetch(base+'/chat/send',{method:'POST',headers,body,signal:controller.signal}).catch(e=>e);await started;
 const statusUrl=base+'/chat/requests/recover-one?characterId=chaewon';
 assert.equal((await fetch(statusUrl)).status,401);
 assert.equal((await(await fetch(statusUrl,{headers})).json()).state,'pending');
 assert.equal((await(await fetch(base+'/chat/requests/recover-one?characterId=hayoung',{headers})).json()).state,'unknown');
 db.createUser({id:'other-recovery'});legal.accept('other-recovery',{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});
 assert.equal((await(await fetch(statusUrl,{headers:{Authorization:'Bearer '+auth.generateToken({userId:'other-recovery'})}})).json()).state,'unknown');
 controller.abort();release();await pending;
 for(let i=0;i<100&&!db.getChatRequest(id,'recover-one')?.success;i++)await new Promise(r=>setTimeout(r,10));assert(db.getChatRequest(id,'recover-one').success,'Closing the HTTP client must not discard the provider reply');
 const update=await(await fetch(base+'/account/sync?after='+encodeURIComponent(first.syncVersion),{headers})).json();assert.notEqual(update.syncVersion,first.syncVersion);assert(update.savedRooms.chaewon.messages.some(m=>m.id==='reply_recover-one'));
 const history=await(await fetch(base+'/account/rooms/chaewon/messages',{headers})).json();assert(history.messages.some(m=>m.id==='reply_recover-one'&&m.text.includes('나중 말풍선')));
 const balance=db.getUser(id).hearts;const replay=await(await fetch(base+'/chat/send',{method:'POST',headers,body})).json();assert.equal(replay.replyId,'reply_recover-one');assert.equal(db.getUser(id).hearts,balance);assert.equal(calls,1,'Replay cannot generate or charge a second time');
 const recovered=await(await fetch(statusUrl,{headers})).json();assert.equal(recovered.state,'completed');assert.equal(recovered.result.partnerReply,history.messages.find(m=>m.id==='reply_recover-one').text);assert(!('fingerprint' in recovered.result));assert.equal(calls,1);assert.equal(db.getUser(id).hearts,balance);
 // A stale client snapshot was saved before generation, so immutable source rows
 // still say awaitingReply:true. The receipt must correct delivery in every read.
 const user=db.getUser(id);user.savedRooms.chaewon.messages.find(m=>m.id==='recover-one').awaitingReply=true;db.updateUser(id,{savedRooms:user.savedRooms});
 assert.equal((await(await fetch(base+'/account/sync?room=chaewon',{headers})).json()).savedRooms.chaewon.messages.find(m=>m.id==='recover-one').awaitingReply,false);
 const batch=JSON.stringify({characterId:'chaewon',message:'첫 문장\n다음 문장',messageId:'batch-last',messages:[{id:'batch-first',text:'첫 문장'},{id:'batch-last',text:'다음 문장'}]});
 assert.equal((await fetch(base+'/chat/send',{method:'POST',headers,body:batch})).status,200);
 const batchReceipt=await(await fetch(base+'/chat/requests/batch-first?characterId=chaewon',{headers})).json();assert.equal(batchReceipt.state,'completed');assert.deepEqual(batchReceipt.result.batchMessageIds,['batch-first','batch-last']);
 const readback=await(await fetch(base+'/account/rooms/chaewon/messages',{headers})).json();assert(readback.messages.filter(m=>['batch-first','batch-last'].includes(m.id)).every(m=>m.awaitingReply===false));
 llm.generateReply=async()=>{throw Error('provider unavailable');};
 await fetch(base+'/chat/send',{method:'POST',headers,body:JSON.stringify({characterId:'chaewon',message:'실패',messageId:'real-failure'})});
 const failed=await(await fetch(base+'/chat/requests/real-failure?characterId=chaewon',{headers})).json();assert.equal(failed.state,'failed');assert.equal(failed.failure.costDeducted,0);
 const current=await(await fetch(base+'/account/sync',{headers})).json();const unchanged=await(await fetch(base+'/account/sync?after='+encodeURIComponent(current.syncVersion),{headers})).json();assert.equal(unchanged.unchanged,true);
 console.log('PASS: browser disconnect preserves committed reply, authenticated revision sync recovers it after reload, complete history and idempotent replay without another debit');
 }finally{if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
