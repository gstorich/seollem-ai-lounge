const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-idle-followup-'));
Object.assign(process.env,{SQLITE_FILE:path.join(dir,'db.sqlite'),DATABASE_FILE:path.join(dir,'data.json'),NODE_ENV:'test',GEMINI_API_KEY:'synthetic',OPENAI_API_KEY:''});
require('./mock-llm.cjs');
const db=require('../services/dbService'),idle=require('../services/idleFollowUp'),legal=require('../services/legalService'),store=require('../services/proactiveStore'),llm=require('../services/llmService'),auth=require('../middleware/auth');
const express=require('express');
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
(async()=>{let server;try{
 const id='idle-user',char='chaewon';db.createUser({id});legal.accept(id,{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});
 function userTurn(n){clock+=300000;const time=Date.now()-120000;db.saveChatRequest(id,'user'+n,{success:true});db.appendMessages(id,char,[{id:'user'+n,sender:'user',text:'오늘 산책 다녀왔어요',createdAt:time},{id:'answer'+n,sender:'ai',text:'산책은 어땠어요',createdAt:time+1}]);}
 userTurn(1);const balance=db.getUser(id).hearts;
 const app=express();app.use(express.json());app.use('/api/chat',require('../routes/chat'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/chat/idle-followup',token=auth.generateToken({userId:id});
 async function send(s=idle.state(id,char)){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({characterId:char,userMessageId:s.userMessageId,lastReplyId:s.lastReplyId})});return {status:r.status,data:await r.json()};}
 let calls=0,mode='normal',release,entered;
 const original=llm.generateReply;
 llm.generateReply=async(...args)=>{calls++;assert.equal(args[2].conversation.kind,'proactive');if(mode==='fail')throw Error('synthetic provider failure');const result=await original(...args);if(mode==='skip')result.roomLeft=true;if(mode==='hold'){entered();await new Promise(r=>release=r);}return result;};
 const first=await send();assert.equal(first.status,200);assert(first.data.isAiGenerated);assert.equal(first.data.costDeducted,0);assert.equal(idle.state(id,char).count,1);
 const before=calls;assert.equal((await send()).data.skipped,true);assert.equal(calls,before,'45s cooldown cannot be bypassed');
 function ageLast(){const u=db.getUser(id),room=u.savedRooms[char];room.messages.at(-1).createdAt=Date.now()-120000;db.updateUser(id,{savedRooms:u.savedRooms});}
 ageLast();const second=await send();assert.equal(second.status,200);assert.equal(idle.state(id,char).count,2);
 for(let i=0;i<3;i++){store.seen(id,Date.now());assert.equal(idle.state(id,char).count,2);assert.equal((await send()).data.skipped,true);}
 assert.equal(calls,2,'Read/reopen/repeated requests never reset budget');
 userTurn(2);assert.equal(idle.state(id,char).count,0,'Only a new user turn starts a fresh budget');
 const state=idle.state(id,char);mode='fail';const failed=await send(state);assert.equal(failed.status,503);assert.equal(failed.data.partnerReply,undefined);assert.equal(idle.state(id,char).count,0);assert.equal(db.getUser(id).hearts,balance);
 mode='skip';const skipped=await send(state);assert.equal(skipped.data.skipped,true);const n=calls;assert.equal((await send(state)).data.skipped,true);assert.equal(calls,n,'Skip is cached without closing room or generating repeated reminders');
 userTurn(3);mode='hold';const started=new Promise(r=>entered=r);const pending=send();await started;userTurn(4);release();assert.equal((await pending).status,503);assert.equal(idle.state(id,char).count,0,'A new user message cancels stale generated reminders');
 store.setEnabled(id,false);assert.equal((await send()).data.skipped,true);store.setEnabled(id,true);
 // Legacy local reminders already delivered also consume the current budget.
 db.appendMessages(id,char,[{id:'idle_followup_old1',sender:'ai',text:'旧',createdAt:Date.now()-60000},{id:'idle_followup_old2',sender:'ai',text:'旧',createdAt:Date.now()-60000}]);
 assert.equal(idle.state(id,char).count,2);assert.equal((await send()).data.skipped,true);
 assert.equal(db.getUser(id).hearts,balance);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND reason='chat'").get(id).n,0);
 const page=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');assert(!page.includes('pickCharacterFollowUpLine'));assert(!page.includes('idleFollowUpCount = 0'));assert(page.includes('ApiClient.idleFollowUp'));
 console.log('PASS idle reminders: actual API path, durable per-user-turn budget incl legacy, cooldown, read/reopen no reset, new-user reset, no fake user, zero charge, provider failure, cached skip, stale generation and opt-out');
}finally{Date.now=realNow;if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
