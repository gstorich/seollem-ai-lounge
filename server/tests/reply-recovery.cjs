const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-reply-recovery-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),auth=require('../middleware/auth'),legal=require('../services/legalService'),llm=require('../services/llmService'),express=require('express');
(async()=>{let server;try{
 const id='reply-recovery';db.createUser({id});legal.accept(id,{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});
 const app=express();app.use(express.json());app.use('/api/chat',require('../routes/chat'));app.use('/api/account',require('../routes/account'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api',headers={'Content-Type':'application/json',Authorization:'Bearer '+auth.generateToken({userId:id})};
 const first=await(await fetch(base+'/account/sync',{headers})).json();assert.equal((await fetch(base+'/account/sync')).status,401);
 let entered,release,calls=0;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
 llm.generateReply=async()=>{calls++;entered();await held;return {isAiGenerated:true,text:'첫 말풍선과 나중 말풍선이 모두 들어 있는 실제 답변',roomLeft:false,memory:{}};};
 const body=JSON.stringify({characterId:'chaewon',message:'새로고침 중 답변 복구',messageId:'recover-one'}),controller=new AbortController();
 const pending=fetch(base+'/chat/send',{method:'POST',headers,body,signal:controller.signal}).catch(e=>e);await started;controller.abort();release();await pending;
 for(let i=0;i<100&&!db.getChatRequest(id,'recover-one')?.success;i++)await new Promise(r=>setTimeout(r,10));assert(db.getChatRequest(id,'recover-one').success,'Closing the HTTP client must not discard the provider reply');
 const update=await(await fetch(base+'/account/sync?after='+encodeURIComponent(first.syncVersion),{headers})).json();assert.notEqual(update.syncVersion,first.syncVersion);assert(update.savedRooms.chaewon.messages.some(m=>m.id==='reply_recover-one'));
 const history=await(await fetch(base+'/account/rooms/chaewon/messages',{headers})).json();assert(history.messages.some(m=>m.id==='reply_recover-one'&&m.text.includes('나중 말풍선')));
 const balance=db.getUser(id).hearts;const replay=await(await fetch(base+'/chat/send',{method:'POST',headers,body})).json();assert.equal(replay.replyId,'reply_recover-one');assert.equal(db.getUser(id).hearts,balance);assert.equal(calls,1,'Replay cannot generate or charge a second time');
 const current=await(await fetch(base+'/account/sync',{headers})).json();const unchanged=await(await fetch(base+'/account/sync?after='+encodeURIComponent(current.syncVersion),{headers})).json();assert.equal(unchanged.unchanged,true);
 console.log('PASS: browser disconnect preserves committed reply, authenticated revision sync recovers it after reload, complete history and idempotent replay without another debit');
 }finally{if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
