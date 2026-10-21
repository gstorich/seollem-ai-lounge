const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-batch-api-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),auth=require('../middleware/auth'),legal=require('../services/legalService'),llm=require('../services/llmService'),express=require('express');
(async()=>{let server;try{
 const id='batch-api';db.createUser({id});legal.accept(id,{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});
 const app=express();app.use(express.json());app.use('/api/chat',require('../routes/chat'));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/chat/send',headers={'Content-Type':'application/json',Authorization:'Bearer '+auth.generateToken({userId:id})};
 let calls=0,lastHistory;llm.generateReply=async(character,history,options)=>{calls++;lastHistory=history;return {isAiGenerated:true,text:'ㅋㅋ 원래 귀여운 타입이라고? 자신감 좋네',roomLeft:false,memory:{summary:"",agreements:[],userFacts:[],characterFacts:[],sharedEvents:[],openThreads:[],state:{scene:"대화",characterEmotion:"호기심",userEmotion:"미확인",relationship:"첫 만남",lastBeat:"대화",sourceIds:[]}}};};
 const messages=[{id:'rapid-1',text:'오타 아닌데요'},{id:'rapid-2',text:'그냥 이렇게 치는데요'},{id:'rapid-3',text:'제가 원래 귀여운 타입인데요'}];
 db.appendMessages(id,'chaewon',[...messages,{id:'future',text:'아직 보내지 않은 다음 묶음'}].map((m,i)=>({...m,sender:'user',createdAt:100+i,awaitingReply:true})));
 const body={characterId:'chaewon',messageId:'rapid-3',message:messages.map(m=>m.text).join('\n'),messages};
 const send=async(value)=>{const res=await fetch(base,{method:'POST',headers,body:JSON.stringify(value)});return {status:res.status,data:await res.json()};};
 const before=db.getUser(id).hearts,first=await send(body);assert.equal(first.status,200);assert.equal(calls,1);assert.equal(db.getUser(id).hearts,before-3.7,'One reply charges once for the whole batch');
 assert.deepEqual(lastHistory.map(m=>m.content),[body.message],'Individual synced copies and not-yet-submitted inputs must not be duplicated in model history');
 let room=db.getUser(id).savedRooms.chaewon;for(const m of messages){assert.equal(room.messages.filter(item=>item.id===m.id).length,1);assert.equal(room.messages.find(item=>item.id===m.id).text,m.text);assert(db.getChatRequest(id,m.id).success);}
 assert.equal(room.messages.filter(m=>m.sender==='ai').length,1);
 assert.equal((await send(body)).data.replyId,first.data.replyId);assert.equal(calls,1);assert.equal(db.getUser(id).hearts,before-3.7);
 const alias=await send({characterId:'chaewon',messageId:'rapid-1',message:messages[0].text});assert.equal(alias.status,200);assert.equal(alias.data.replyId,first.data.replyId);assert.equal(calls,1,'Retry of one already-answered constituent replays the batch response');
 const restoredRetry=await send({characterId:'chaewon',messageId:'rapid-3',message:messages.at(-1).text});assert.equal(restoredRetry.status,200);assert.equal(restoredRetry.data.replyId,first.data.replyId);assert.equal(calls,1,'Reentry retry restores the original batch from message IDs');
 const next=await send({characterId:'chaewon',messageId:'future',message:'아직 보내지 않은 다음 묶음',messages:[{id:'future',text:'아직 보내지 않은 다음 묶음'}]});assert.equal(next.status,200);for(const m of messages)assert.equal(lastHistory.filter(item=>item.content===m.text).length,1,'All answered constituent messages remain in future context');
 const malformed=await send({...body,messageId:'bad',messages:[{id:'bad',text:'다른 내용'}]});assert.equal(malformed.status,400);assert.equal(calls,2);
 const denied=await send({...body,messageId:'rapid-1',messages:[{id:'rapid-1',text:'바뀐 내용'}],message:'바뀐 내용'});assert.equal(denied.status,409);assert.equal(calls,2);
 console.log('PASS: batch input validation, complete original message preservation, no duplicate/future model inputs, one generation/debit, root and constituent replay, future context');
 }finally{if(server)await new Promise(resolve=>server.close(resolve));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
