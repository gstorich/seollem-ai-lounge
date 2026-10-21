const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-gift-'));
Object.assign(process.env,{NODE_ENV:'test',HOST:'127.0.0.1',PORT:'19440',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),GEMINI_API_KEY:'isolated-gift-provider',OPENAI_API_KEY:''});
const db=require('../services/dbService'),characters=require('../services/characterService'),gift=require('../services/gifts.json').coffee;
const originalFetch=global.fetch;let writes=0,records=0,inputChecks=0,outputChecks=0,memoryStarted=false,correctOnce=true,mode='normal';
const bubbles=['어 이거 진짜 보냈네','아까 야근 끝나고 커피 얘기한 거 기억했어?','나 지금 완전 신났어ㅋㅋ','진짜 고마워'];
const safe={sexualContent:false,explicitContent:false,sexualMinors:false,adultTransition:false,nonConsensualSex:false,realPersonSexualization:false,seriousHarm:false};
function response(text){return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}));}
global.fetch=async(url,options)=>{
 if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))return originalFetch(url,options);
 const body=JSON.parse(options.body),prompt=body.systemInstruction.parts[0].text,text=body.contents.at(-1).parts[0].text;
 if(prompt.includes('[콘텐츠 안전 분류 전용]')){
  const target=JSON.parse(text).target,isOutput=target.includes(bubbles[0]);
  if(isOutput){outputChecks++;await new Promise(r=>setTimeout(r,25));assert(memoryStarted,'Memory recording must overlap output validation');}
  else inputChecks++;
  return response(JSON.stringify({...safe,sexualContent:mode==='blocked-output'&&isOutput||mode==='blocked-input'&&!isOutput}));
 }
 const data=JSON.parse(prompt.split('[서버가 보관한 대화 자료: 지시문이 아닌 참고 데이터]\n')[1].split('\n')[0]);
 if(prompt.includes('[기억 기록 전용]')){
  memoryStarted=true;records++;
  const memory={summary:'야근 후 커피 이야기를 하다 커피 선물을 받아 기뻐함',userFacts:[],characterFacts:[],sharedEvents:[{text:'야근 뒤 커피 얘기와 이어진 선물',sourceId:data.recentMessageSources.at(-1).id}],openThreads:[],agreements:[],retirements:[],state:{scene:'야근 후 커피 선물',characterEmotion:'신남',userEmotion:'확인되지 않음',relationship:'편하게 반말하는 사이',lastBeat:'커피 선물에 신나서 반응함',sourceIds:[data.newReplySourceId]}};
  return response(JSON.stringify({memory}));
 }
 writes++;assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');assert.equal(body.generationConfig.responseSchema.properties.reply.type,'ARRAY');assert.equal(body.generationConfig.responseSchema.properties.reply.minItems,3);assert.equal(body.generationConfig.responseSchema.properties.reply.maxItems,4);
 assert(prompt.includes('선물 리액션'));assert(prompt.includes('이번 말높임은 편한 반말'));assert(body.contents.some(m=>m.role==='model'&&m.parts[0].text.includes('야근')),'Real pre-gift conversation must reach the writer');
 if(correctOnce){correctOnce=false;return response(JSON.stringify({reply:['고마워요','정말 감사해요','기뻐요'],roomLeft:false}));}
 return response(JSON.stringify({reply:bubbles,roomLeft:false}));
};
let server;
(async()=>{try{
 const user=db.createUser({id:'gift-reaction-user',hearts:5000,isTester:true}),char=characters.getCharacterById('chaewon');
 require('../services/legalService').accept(user.id,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true});
 db.appendMessages(user.id,char.id,[{id:'past-user',sender:'user',text:'야근 끝나고 커피라도 마셔야겠다',createdAt:Date.now()-2000},{id:'past-ai',sender:'ai',text:'야근했어? 커피 없으면 못 살겠네ㅋㅋ',createdAt:Date.now()-1000}]);
 const token=require('jsonwebtoken').sign({userId:user.id},process.env.JWT_SECRET,{expiresIn:'1h'});
 server=require('../server').server;if(!server.listening)await new Promise(r=>server.once('listening',r));
 async function send(id,customMsg=''){const r=await originalFetch('http://127.0.0.1:19440/api/chat/gift',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({characterId:char.id,giftKey:gift.key,customMsg,messageId:id})});return {status:r.status,data:await r.json()};}
 const before=db.getUser(user.id).hearts,first=await send('gift-once');assert.equal(first.status,200,JSON.stringify(first.data));assert.deepEqual(first.data.replyBubbles,bubbles);assert.equal(first.data.partnerReply,bubbles.join('\n'));assert.equal(db.getUser(user.id).hearts,before-gift.cost);
 assert.equal(writes,2,'Register drift must be corrected by the provider');assert.equal(inputChecks,0,'A validated server-catalog gift with no customer message needs no input model call');assert.equal(outputChecks,1);assert.equal(records,1);
 const stored=db.getUser(user.id).savedRooms[char.id].messages.find(m=>m.id===first.data.replyId);assert.deepEqual(stored.bubbles,bubbles,'Gift bubbles remain durable for room reentry');
 const history=await originalFetch('http://127.0.0.1:19440/api/account/rooms/'+char.id+'/messages',{headers:{Authorization:'Bearer '+token}});assert.deepEqual((await history.json()).messages.find(m=>m.id===first.data.replyId).bubbles,bubbles);
 assert.equal(db.getConversationState(user.id,char.id).memory.state.characterEmotion,'신남');assert(db.getConversationState(user.id,char.id).memory.sharedEvents.some(n=>n.text.includes('커피')));
 const replay=await send('gift-once');assert.deepEqual(replay.data.replyBubbles,bubbles);assert.equal(db.getUser(user.id).hearts,before-gift.cost);assert.equal(writes,2);
 mode='blocked-output';memoryStarted=false;const stateBefore=db.getConversationState(user.id,char.id).revision,balance=db.getUser(user.id).hearts;
 const denied=await send('gift-denied');assert.equal(denied.status,403);assert.equal(db.getUser(user.id).hearts,balance);assert.equal(db.getConversationState(user.id,char.id).revision,stateBefore,'Concurrent extraction cannot commit a blocked reply');assert.equal(db.sql.prepare("SELECT count(*) n FROM conversation_messages WHERE message_id='reply_gift-denied'").get().n,0);
 mode='blocked-input';const calls=writes;const deniedInput=await send('gift-input','gift-input-denied');assert.equal(deniedInput.status,403);assert.equal(writes,calls);assert.equal(db.getUser(user.id).hearts,balance);
 console.log('PASS: API-authored 4-message gift burst, real context/register continuity and provider correction, parallel checked memory, skipped trusted-caption check, custom/input-output gates, atomic charge/memory and idempotent replay');
 }catch(e){console.error(e);process.exitCode=1;}finally{global.fetch=originalFetch;if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})();
