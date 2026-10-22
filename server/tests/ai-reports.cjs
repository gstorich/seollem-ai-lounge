const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-reports-')),salt=crypto.randomBytes(16).toString('hex'),password=crypto.randomUUID();
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),ADMIN_PASSWORD_HASH:salt+':'+crypto.scryptSync(password,salt,64).toString('hex'),ALLOWED_ORIGINS:'https://example.com',GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),auth=require('../middleware/auth'),legal=require('../services/legalService'),llm=require('../services/llmService'),reports=require('../services/aiReports'),characters=require('../services/characterService'),express=require('express');
characters.initializeRegistry();
(async()=>{let server;try{
 const user='report-guest',other='report-other',characterId='chaewon';for(const id of [user,other]){db.createUser({id});legal.accept(id,{version:legal.version,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,atLeast18:true});}
 const initial=Date.now()-1000;db.appendMessages(user,characterId,Array.from({length:12},(_,i)=>({id:i===6?'reply_target':'msg_'+i,sender:i===6?'ai':i%2?'ai':'user',text:i===6?'문제가 된 답변':'대화 '+i,createdAt:initial+i})));db.appendMessages(other,characterId,[{id:'other_reply',sender:'ai',text:'타인 답변',createdAt:initial}]);
 const app=express();app.use(express.json());app.use('/api/ai-reports',require('../routes/aiReports'));app.use('/api/admin',require('../routes/admin'));app.use('/api/chat',require('../routes/chat'));app.use('/api/match',require('../routes/match'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(route,{body,token=user,cookie,origin='https://example.com',adminHeader=true}={})=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+auth.generateToken({userId:token})}:{}),...(cookie?{Cookie:cookie}:{}),...(adminHeader?{'X-Azit-Admin':'1'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={};}return {status:r.status,data,cookie:r.headers.get('set-cookie'),cache:r.headers.get('cache-control')};};
 const input={characterId,messageId:'reply_target_1',category:'quality',detail:'앞뒤 맥락이 맞지 않습니다'};
 assert.equal((await request('/api/ai-reports',{token:null})).status,401);
 assert.equal((await request('/api/ai-reports',{body:{...input,messageId:'other_reply'}})).status,404);
 assert.equal((await request('/api/ai-reports',{body:{...input,messageId:'msg_0'}})).status,404);
 assert.equal((await request('/api/ai-reports',{body:{...input,category:'unknown'}})).status,400);
 const archive=require('../services/conversationArchive'),hydrate=archive.hydrateRows;archive.hydrateRows=async()=>{throw Error('archive unavailable');};
 assert.equal((await request('/api/ai-reports',{body:input})).status,503);assert.equal(reports.mine(user).total,0,'Unavailable evidence must not create an empty report');archive.hydrateRows=hydrate;
 const created=await request('/api/ai-reports',{body:{...input,text:'클라이언트가 조작한 원문'}});assert.equal(created.status,201);const id=created.data.report.id;assert.equal(created.data.report.messageId,'reply_target');assert.equal(created.cache,'no-store');
 assert.equal((await request('/api/ai-reports',{body:{...input,messageId:'reply_target'}})).data.duplicate,true,'Split and full reply share one report');
 assert.equal((await request('/api/ai-reports/'+id,{token:other})).status,404);
 assert.equal((await request('/api/ai-reports')).data.total,1,'Guest can review own result without phone');
 let own=(await request('/api/ai-reports/'+id)).data.report;assert.equal(own.messages.length,7);assert.equal(own.messages.filter(m=>m.target).length,1);assert(!own.messages.some(m=>m.id==='msg_0'||m.id==='msg_11'));assert(!JSON.stringify(own).includes('actions'));
 assert.equal((await request('/api/admin/ai-reports')).status,401);
 const login=await request('/api/admin/session',{body:{password}}),cookie=login.cookie.split(';')[0];assert.equal(login.status,200);
 const view=(await request('/api/admin/ai-reports/'+id,{cookie})).data.report;assert.equal(view.messages.length,7);
 let action={action:'review',version:view.version,note:'관리자 전용 검토 메모'};
 assert.equal((await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:action,origin:'https://evil.invalid'})).status,403);
 assert.equal((await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:action,adminHeader:false})).status,403);
 assert.equal((await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:{...action,note:'x'}})).status,400);
 let reviewing=await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:action});assert.equal(reviewing.status,200);assert.equal(reviewing.data.report.status,'reviewing');assert.equal((await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:action})).status,409);
 own=(await request('/api/ai-reports/'+id)).data.report;assert(!JSON.stringify(own).includes('관리자 전용'));
 db.updateUser(user,{metCharIds:[characterId]});
 const balance=db.getUser(user).hearts,version=characters.catalogVersion();
 let held=(await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:{action:'hold_character',version:reviewing.data.report.version,note:'응답 품질 문제로 캐릭터 점검',publicReply:'답변 내용을 점검하며 제공을 잠시 중지했습니다.'}})).data.report;
 assert(held.held);assert(!characters.isPublished(characterId));assert.notEqual(characters.catalogVersion(),version);assert(!characters.getAllCharacters().some(c=>c.id===characterId));
 for(const route of ['send','greeting','gift','idle-followup'])assert.equal((await request('/api/chat/'+route,{body:{characterId,messageId:'blocked_'+route,message:'점검',giftKey:'coffee'}})).data.error,'CHARACTER_UNDER_REVIEW');
 assert.equal((await request('/api/match/recall-previous',{body:{characterId}})).data.error,'CHARACTER_UNDER_REVIEW');
 assert.equal(db.getUser(user).hearts,balance,'Report and holds never charge hearts');
 assert.notEqual((await request('/api/match/request',{body:{characterId}})).status,200);
 const hold=reports.list().holds[0];assert.equal((await request('/api/admin/ai-reports/holds/'+characterId+'/release',{cookie,body:{createdAt:hold.createdAt-1,note:'검토 완료 후 재개',publicReply:'점검과 개선 후 다시 이용할 수 있습니다.'}})).status,409);
 const resumed=await request('/api/admin/ai-reports/'+id+'/actions',{cookie,body:{action:'resume_character',version:held.version,note:'실제 설정 검토와 점검을 완료',publicReply:'점검을 완료하여 캐릭터 제공을 재개했습니다.'}});assert.equal(resumed.status,200);assert(characters.isPublished(characterId));assert.equal(characters.catalogVersion(),version);
 own=(await request('/api/ai-reports/'+id)).data.report;assert.match(own.publicReply,/재개/);assert(!JSON.stringify(own).includes('실제 설정 검토'));
 // Hold arriving while the provider is running must prevent both publication and debit.
 let done,started;const began=new Promise(r=>started=r),wait=new Promise(r=>done=r);llm.generateReply=async()=>{started();await wait;return {isAiGenerated:true,text:'제공되면 안 되는 새 답변',memory:{},roomLeft:false};};
 const pending=request('/api/chat/send',{body:{characterId,messageId:'race',message:'새 메시지'}});await began;
 reports.act(id,'operator',{action:'hold_character',version:reports.get(id).version,note:'생성 도중 긴급 점검 중지',publicReply:'캐릭터 답변을 점검하고 있습니다.'});done();const blocked=await pending;assert.equal(blocked.data.costDeducted,0);assert.equal(db.getUser(user).hearts,balance);assert(!db.sql.prepare("SELECT 1 FROM conversation_messages WHERE message_id='reply_race'").get());
 // A report keeps its evidence after the original changes; no full history copied.
 db.sql.prepare("UPDATE conversation_messages SET data=json_set(data,'$.text','변경된 원본') WHERE message_id='reply_target'").run();assert.equal(reports.get(id).messages.find(m=>m.target).text,'문제가 된 답변');
 assert(db.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action LIKE 'ai_report_%'").get().n>=5);
 db.sql.prepare('UPDATE ai_content_reports SET created_at=? WHERE id=?').run(Date.now()-366*86400000,id);reports.prune();assert.equal(reports.get(id),null);assert(reports.isHeld(characterId),'Retention must not silently restore unsafe character');const expiredHold=reports.list().holds[0];assert.equal(expiredHold.reportId,'');reports.releaseHold(characterId,'operator',{createdAt:expiredHold.createdAt,note:'기간 경과 후에도 점검 확인',publicReply:'검토 후 제공을 재개합니다.'});assert(!reports.isHeld(characterId));
 // Ownership survives phone account merges.
 db.createUser({id:'member-report',phone:'01000000001'});const second=await reports.create(user,{...input,messageId:'msg_3'});reports.transfer(user,'member-report');db.sql.prepare('INSERT INTO aliases VALUES(?,?)').run(user,'member-report');assert(reports.ownDetail(second.report.id,'member-report'));assert.equal(reports.mine('member-report').total,1);
 console.log('PASS: guest report ownership, canonical split dedup, bounded evidence, admin auth/CSRF, private review notes, revision conflicts, public results, real character holds and resume, in-flight no-publication/no-charge, expiry and account transfer');
 }finally{if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
