const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-system-')),base='http://127.0.0.1:19438/api';
const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'19438',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),GEMINI_API_KEY:'synthetic-test-key',OPENAI_API_KEY:''};
let child,sql,logs='';
async function start(){child=spawn(process.execPath,['--require',path.join(__dirname,'mock-llm.cjs'),'server/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}throw Error(logs);}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
async function req(route,token,body,method=body===undefined?'GET':'POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
(async()=>{try{
 await start();sql=new DatabaseSync(env.SQLITE_FILE);
 const {data:guest}=await req('/auth/guest',null,{}),token=guest.token,id=guest.user.id;
 await req('/legal/accept',token,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true});
 const failure=await req('/chat/send',token,{characterId:'chaewon',message:'network-test',messageId:'network-failure'});
 assert.equal(failure.status,503);assert.equal(failure.data.costDeducted,0);
 let state=(await req('/account/state',token)).data;
 const error=state.savedRooms.chaewon.messages.find(m=>m.id==='system_error_network-failure');assert.equal(error.sender,'system');assert.equal(error.systemKind,'generation_error');assert.equal(state.user.hearts,50);
 await stop();await start();
 assert((await req('/account/rooms/chaewon/messages',token)).data.messages.some(m=>m.id===error.id&&m.sender==='system'),'Error notice survives server restart and history fetch');
 const result=await req('/chat/send',token,{characterId:'chaewon',message:'room-left-test',messageId:'terminal'});
 assert.equal(result.status,200);assert.equal(result.data.roomLeft,true);assert.equal(result.data.systemMessages.length,1);
 state=(await req('/account/state',token)).data;const closed=state.savedRooms.chaewon;
 assert(closed.roomLeft);assert.equal(closed.messages.at(-1).systemKind,'partner_left');assert.equal(closed.messages.filter(m=>m.systemKind==='partner_left').length,1);
 const hearts=state.user.hearts,charges=sql.prepare("SELECT count(*) n FROM ledger WHERE user_id=? AND reason='chat'").get(id).n;
 const stale={savedRooms:{chaewon:{messages:closed.messages.filter(m=>m.sender!=='system'),roomLeft:false}}};
 assert.equal((await req('/account/state',token,stale,'PUT')).status,200);
 state=(await req('/account/sync',token)).data;assert(state.savedRooms.chaewon.roomLeft);assert(state.savedRooms.chaewon.messages.some(m=>m.systemKind==='partner_left'),'A late client snapshot cannot erase the server closure');
 for(const route of ['/chat/send','/chat/greeting','/chat/gift']){const denied=await req(route,token,{characterId:'chaewon',message:'after end',messageId:'blocked'+route.replaceAll('/','_'),giftKey:'coffee'});assert.equal(denied.status,400);assert.equal(denied.data.roomLeft,true);assert.equal(denied.data.costDeducted,0);}
 assert.equal((await req('/account/state',token)).data.user.hearts,hearts);assert.equal(sql.prepare("SELECT count(*) n FROM ledger WHERE user_id=? AND reason='chat'").get(id).n,charges);
 const replay=await req('/chat/send',token,{characterId:'chaewon',message:'room-left-test',messageId:'terminal'});assert.equal(replay.data.replyId,result.data.replyId);assert.equal(replay.data.systemMessages[0].id,result.data.systemMessages[0].id);
 // Simulate a legacy saved room that has only the old roomLeft receipt.
 await stop();let user=JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get(id).data);delete user.savedRooms.chaewon.roomLeft;user.savedRooms.chaewon.messages=user.savedRooms.chaewon.messages.filter(m=>m.systemKind!=='partner_left');
 sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),id);sql.prepare("DELETE FROM conversation_messages WHERE user_id=? AND json_extract(data,'$.systemKind')='partner_left'").run(id);
 await start();state=(await req('/account/state',token)).data;assert(state.savedRooms.chaewon.roomLeft);assert.equal(state.savedRooms.chaewon.messages.filter(m=>m.systemKind==='partner_left').length,1,'Legacy closure is reconstructed once from the actual provider receipt');
 await stop();await start();assert.equal((await req('/account/state',token)).data.savedRooms.chaewon.messages.filter(m=>m.systemKind==='partner_left').length,1);
 await req('/account/rooms/chaewon',token,undefined,'DELETE');await stop();await start();assert(!(await req('/account/state',token)).data.savedRooms.chaewon,'Explicitly deleted rooms are never resurrected by repair');
 const spoof=await req('/account/state',token,{savedRooms:{jieun:{roomLeft:true,messages:[{id:'fake-left',sender:'system',systemKind:'partner_left',text:'fake'}]}}},'PUT');assert.equal(spoof.status,200);assert.equal((await req('/account/state',token)).data.savedRooms.jieun.roomLeft,false,'Client cannot forge a character departure');
 console.log('PASS: durable centered system notices, provider-authoritative closure, stale snapshots/restarts/replays, no duplicate notices or charges, legacy repair, explicit deletion and forged closure rejection');
 }catch(e){console.error(e);console.error(logs.slice(-2200));process.exitCode=1;}finally{await stop();sql?.close();fs.rmSync(dir,{recursive:true,force:true});}})();
