const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),jwt=require('jsonwebtoken'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-conversations-')),base='http://127.0.0.1:19415',secret=crypto.randomBytes(48).toString('hex'),password='local-review-only',salt=crypto.randomBytes(16).toString('hex'),hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
let child,sql,logs='';
const env={...process.env,NODE_ENV:'test',PORT:'19415',HOST:'127.0.0.1',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'test.sqlite'),JWT_SECRET:secret,ADMIN_PASSWORD_HASH:hash,ALLOWED_ORIGINS:base,GEMINI_API_KEY:'',OPENAI_API_KEY:''};
async function start(){child=spawn(process.execPath,['server/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(logs);}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
async function request(route,{token,cookie,body,method=body===undefined?'GET':'POST'}={}){const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Origin:base,'X-Azit-Admin':'1',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:text?JSON.parse(text):null};}
(async()=>{try{
 await start();sql=new DatabaseSync(env.SQLITE_FILE);
 const guest=await request('/auth/guest',{body:{}}),guestId=guest.data.user.id,token=guest.data.token;
 const initialCount=sql.prepare('SELECT count(*) n FROM users').get().n;
 for(const authorization of [undefined,jwt.sign({userId:guestId},secret,{expiresIn:-1})]){
  const restored=await request('/auth/guest',{token:authorization,cookie:guest.cookie,body:{}});assert.equal(restored.data.user.id,guestId);assert.equal(restored.data.user.hearts,50);
 }
 assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,initialCount);
 assert.equal(sql.prepare("SELECT count(*) n FROM ledger WHERE reason='initial'").get().n,1,'Recovery must not award new guest hearts');
 const fake=await request('/auth/guest',{cookie:guest.cookie+'tampered',body:{}});assert.notEqual(fake.data.user.id,guestId);
 const phone='01000000009',now=Date.now(),characters=require('../services/characterService'),female=characters.getAllCharacters().find(c=>c.gender==='female'),male=characters.getAllCharacters().find(c=>c.gender==='male');
 sql.prepare('INSERT INTO users VALUES(?,?,?)').run(phone,phone,JSON.stringify({id:phone,phone,hearts:50,createdAt:now,savedRooms:{},metCharIds:[]}));
 const memberToken=jwt.sign({userId:phone},secret,{expiresIn:'1h'});
 const room=(charId,messages)=>({[charId]:{charId,messages}});
 const messages=[{id:'q1',sender:'user',text:'오늘 힘든 하루였어요. 커피 마시며 여행 이야기하고 싶어요. <script>alert(1)</script>',createdAt:now-86400000},{id:'a1',sender:'ai',text:'편하게 이야기해요.',createdAt:now-86400000+1},{id:'q2',sender:'user',text:'오늘도 카페에 왔어요.',createdAt:now}];
 assert.equal((await request('/account/state',{token,method:'PUT',body:{savedRooms:room(female.id,messages)}})).status,200);
 assert.equal((await request('/account/state',{token:memberToken,method:'PUT',body:{savedRooms:room(male.id,[{id:'m1',sender:'user',text:'주말 산책 좋아해요.',createdAt:now}])}})).status,200);
 for(const route of ['/admin/conversations','/admin/conversation-insights','/admin/conversations/'+guestId+'/'+female.id]){
  assert.equal((await request(route)).status,401);assert.equal((await request(route,{token})).status,401);
 }
 const login=await request('/admin/session',{body:{password}}),cookie=login.cookie;assert.equal(login.status,200);
 const all=(await request('/admin/conversations',{cookie})).data;assert.equal(all.total,2);
 assert.equal((await request('/admin/conversations?kind=guests',{cookie})).data.total,1);
 assert.equal((await request('/admin/conversations?kind=members',{cookie})).data.items[0].user_id,phone);
 assert.equal((await request('/admin/conversations?q='+encodeURIComponent('커피'),{cookie})).data.total,1);
 assert.equal((await request('/admin/conversations?q='+encodeURIComponent(male.name),{cookie})).data.total,1);
 assert.equal((await request('/admin/conversations?q='+encodeURIComponent("' OR 1=1 --"),{cookie})).data.total,0);
 const transcript=(await request('/admin/conversations/'+guestId+'/'+female.id,{cookie})).data.conversation;assert.deepEqual(transcript.messages.map(m=>m.id),['q1','a1','q2']);
 assert.equal((await request('/admin/conversations/'+guestId+'/'+female.id+'?page=1',{cookie})).data.conversation.messages.length,0);
 const insights=(await request('/admin/conversation-insights?days=7',{cookie})).data;assert.equal(insights.totalTurns,3);assert.equal(insights.activeUsers,2);assert.equal(insights.characters[0].key,female.id);assert.equal(insights.characters[0].returnRooms,1);assert(insights.topics.some(x=>x.label==='위로·고민'));assert(insights.flows.some(x=>x.label==='위로·고민 → 음식·술'));assert.equal((await request('/admin/conversation-insights?kind=members',{cookie})).data.totalTurns,1);
 assert.equal((await request('/admin/customers?kind=members',{cookie})).data.total,1);
 assert.equal((await request('/admin/customers?kind=guests&engagement=active',{cookie})).data.total,1);
 assert.equal((await request('/admin/customers?kind=guests&engagement=unused',{cookie})).data.total,1);
 const overview=(await request('/admin/overview',{cookie})).data;assert.equal(overview.totals.guests,2);assert.equal(overview.totals.engagedGuests,1);assert.equal(overview.totals.unusedGuests,1);
 await request('/account/rooms/'+female.id,{token,method:'DELETE'});assert.equal((await request('/admin/conversations/'+guestId+'/'+female.id,{cookie})).data.conversation.total,3,'Leaving a room must not erase admin records');
 const many=Array.from({length:105},(_,i)=>({id:'page_'+i,sender:i%2?'ai':'user',text:'페이지 확인',createdAt:now+i}));
 await request('/account/state',{token:memberToken,method:'PUT',body:{savedRooms:room(male.id,many)}});
 assert.equal((await request('/admin/conversations/'+phone+'/'+male.id+'?page=1',{cookie})).data.conversation.messages.length,6);
 const latest=(await request('/admin/conversations/'+phone+'/'+male.id+'?latest=1',{cookie})).data.conversation;
 assert.equal(latest.page,1);assert.equal(latest.messages.at(-1).id,'page_104');assert.equal(latest.phone,phone);
 assert.equal((await request('/admin/customers/'+phone,{cookie})).data.customer.phone,phone,'Admin can reveal the complete phone number');
 assert.equal((await request('/admin/customers/'+phone,{token})).status,401,'Customer token cannot reveal admin phone records');
 const insert=sql.prepare('INSERT INTO conversation_messages(user_id,character_id,message_id,created_at,data) VALUES(?,?,?,?,?)');
 insert.run(fake.data.user.id,female.id,'greeting_only',now+5000,JSON.stringify({sender:'ai',text:'첫 인사',createdAt:now+5000}));
 let ordered=(await request('/admin/conversations',{cookie})).data.items;
 assert.equal(ordered[0].user_id,phone,'Latest real conversation comes first');
 assert.equal(ordered.at(-1).user_id,fake.data.user.id,'A newer greeting-only room stays after real conversations');
 insert.run(guestId,female.id,'recent_reply',now+10000,JSON.stringify({sender:'ai',text:'최근 대화 답변',createdAt:now+10000}));
 ordered=(await request('/admin/conversations',{cookie})).data.items;
 assert.equal(ordered[0].user_id,guestId,'Latest AI reply updates the order of an engaged room');
 sql.prepare("DELETE FROM conversation_messages WHERE message_id IN ('greeting_only','recent_reply')").run();
 const audit=(await request('/admin/audit',{cookie})).data.items;assert(audit.some(x=>x.action==='conversation_view'));assert(!JSON.stringify(audit).includes('힘든 하루'));
 await stop();await start();assert.equal((await request('/admin/conversations/'+guestId+'/'+female.id,{cookie})).data.conversation.total,3);
 assert.equal((await request('/auth/guest',{cookie:guest.cookie,body:{}})).data.user.id,guestId);
 Object.assign(process.env,env);
 const db=require('../services/dbService');
 db.linkPhone(guestId,phone);
 assert.equal(sql.prepare('SELECT count(*) n FROM conversation_messages WHERE user_id=?').get(guestId).n,0);
 assert.equal((await request('/admin/conversations/'+phone+'/'+female.id,{cookie})).data.conversation.total,3,'Archived chats transfer to the verified member');
 const anonymousAfterLink=await request('/auth/guest',{cookie:guest.cookie,body:{}});assert.notEqual(anonymousAfterLink.data.user.id,phone,'Guest cookie cannot restore a verified phone account');
 console.log('PASS: admin-only full transcripts/search/pagination, guest/member isolation, engagement/scenario/topic/repeat rankings, immutable archive after room exit and restart, audited access, recovery cookie avoids duplicate guests and extra hearts');
 }catch(e){console.error(e);process.exitCode=1;}finally{await stop();sql?.close();fs.rmSync(dir,{recursive:true,force:true});}})();
