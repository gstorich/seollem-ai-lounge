const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite'),jwt=require('jsonwebtoken');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-operations-')),secret=crypto.randomBytes(48).toString('hex'),password=crypto.randomBytes(18).toString('hex'),salt=crypto.randomBytes(16).toString('hex'),hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex'),base='http://127.0.0.1:19412',origin='https://example.com';
const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'19412',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'test.sqlite'),JWT_SECRET:secret,ADMIN_PASSWORD_HASH:hash,ALLOWED_ORIGINS:origin,GEMINI_API_KEY:'',OPENAI_API_KEY:'',GA_MEASUREMENT_ID:'G-ZZZZZZ9999'};
let child,logs='',sql;
async function start(){child=spawn(process.execPath,['server/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(logs);}
async function stop(){if(child&&child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}}
async function req(route,{method='GET',body,token,cookie,headers={}}={}){const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Origin:origin,'X-Azit-Admin':'1',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});let d;try{d=await r.json();}catch{d={};}return {status:r.status,data:d,cookie:r.headers.get('set-cookie'),cache:r.headers.get('cache-control')};}
(async()=>{try{
 await start();sql=new DatabaseSync(env.SQLITE_FILE);
 const guest=(await req('/auth/guest',{method:'POST',body:{}})).data,other=(await req('/auth/guest',{method:'POST',body:{}})).data;
 const phone='01000000001',user={id:phone,phone,hearts:50,createdAt:Date.now(),updatedAt:Date.now(),savedRooms:{},metCharIds:[]};sql.prepare('INSERT INTO users VALUES(?,?,?)').run(phone,phone,JSON.stringify(user));const memberToken=jwt.sign({userId:phone},secret,{expiresIn:'1h'});
 assert.equal((await req('/admin/overview')).status,401);
 assert.equal((await req('/admin/overview',{token:memberToken})).status,401,'Customer JWT cannot access admin');
 assert.equal((await req('/admin/session',{method:'POST',body:{password:'wrong'}})).status,401);
 const login=await req('/admin/session',{method:'POST',body:{password}});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/Secure/);assert.match(login.cookie,/SameSite=Strict/);assert.match(login.cookie,/__Host-azit_admin=/);const cookie=login.cookie.split(';')[0];
 assert.equal((await req('/admin/overview',{cookie})).status,200);
 assert.equal((await req('/admin/overview',{cookie})).cache,'no-store');
 assert.equal((await req('/admin/analytics',{method:'PUT',cookie,body:{measurementId:'G-ABCDEF1234'},headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await req('/admin/analytics',{method:'PUT',cookie,body:{measurementId:'G-ABCDEF1234'},headers:{'X-Azit-Admin':''}})).status,403);
 assert.equal((await req('/support/tickets',{method:'POST',token:guest.token,body:{category:'other',subject:'테스트',body:'내용'}})).status,403,'Guest must verify phone');
 const created=await req('/support/tickets',{method:'POST',token:memberToken,body:{category:'hearts',subject:'잔액 확인',body:'하트 사용 내역을 확인해주세요.'}});assert.equal(created.status,201);const ticketId=created.data.ticket.id;
 assert.equal((await req('/support/tickets/'+ticketId,{token:other.token})).status,404,'Ticket isolation');
 assert.equal((await req('/support/tickets/'+ticketId+'/replies',{method:'POST',token:other.token,body:{body:'타 계정 접근'}})).status,404);
 assert.equal((await req('/admin/tickets/'+ticketId+'/replies',{method:'POST',cookie,body:{body:'내부 운영 기록',internal:true}})).status,200);
 await req('/admin/tickets/'+ticketId+'/replies',{method:'POST',cookie,body:{body:'확인했습니다. 이용 내역을 안내드립니다.'}});
 const mine=(await req('/support/tickets/'+ticketId,{token:memberToken})).data.ticket;assert.equal(mine.status,'answered');assert.equal(mine.messages.length,2);assert(!JSON.stringify(mine).includes('내부 운영 기록'));
 await req('/support/tickets/'+ticketId+'/replies',{method:'POST',token:memberToken,body:{body:'추가 확인 부탁드립니다.'}});assert.equal((await req('/admin/tickets/'+ticketId,{cookie})).data.ticket.status,'open');
 const operation={delta:10,reason:'고객 문의 보상',requestId:crypto.randomUUID()};
 const adjustments=await Promise.all([req('/admin/customers/'+phone+'/hearts',{method:'POST',cookie,body:operation}),req('/admin/customers/'+phone+'/hearts',{method:'POST',cookie,body:operation})]);assert(adjustments.every(x=>x.status===200));assert.equal(JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get(phone).data).hearts,60);
 assert.equal((await req('/admin/customers/'+phone+'/hearts',{method:'POST',cookie,body:{...operation,delta:20}})).status,400);
 assert.equal((await req('/admin/customers/'+phone+'/hearts',{method:'POST',cookie,body:{delta:-100,reason:'초과 차감 검증',requestId:crypto.randomUUID()}})).status,400);
 assert.equal(sql.prepare("SELECT count(*) n FROM ledger WHERE user_id=? AND reason='admin_adjustment'").get(phone).n,1);
 assert.equal((await req('/admin/analytics',{method:'PUT',cookie,body:{measurementId:'G-ABCDEF1234',propertyId:'123456789'}})).status,200);
 assert.equal((await req('/public-config')).data.gaMeasurementId,'G-ABCDEF1234');
 assert.deepEqual(Object.keys((await req('/public-config')).data).sort(),['advertising','gaMeasurementId']);
 await req('/admin/analytics',{method:'PUT',cookie,body:{measurementId:'',propertyId:''}});assert.equal((await req('/public-config')).data.gaMeasurementId,'','Empty saved setting disables environment default');
 await req('/admin/analytics',{method:'PUT',cookie,body:{measurementId:'G-ABCDEF1234',propertyId:'123456789'}});
 const audits=(await req('/admin/audit',{cookie})).data.items;assert(audits.some(x=>x.action==='heart_adjustment'));assert(!JSON.stringify(audits).includes(password));
 await stop();await start();assert.equal((await req('/admin/tickets/'+ticketId,{cookie})).data.ticket.messages.length,4);assert.equal((await req('/admin/customers/'+phone,{cookie})).data.customer.hearts,60);
 const setAdult=await req('/admin/customers/'+phone+'/adult-verification',{method:'POST',cookie,body:{isAdult:true,reason:'테스트'}});assert.equal(setAdult.status,200);assert.equal(setAdult.data.isAdult,true);assert.equal((await req('/admin/customers/'+phone,{cookie})).data.customer.isAdult,true);
 const unsetAdult=await req('/admin/customers/'+phone+'/adult-verification',{method:'POST',cookie,body:{isAdult:false,reason:'해제'}});assert.equal(unsetAdult.status,200);assert.equal(unsetAdult.data.isAdult,false);assert.equal((await req('/admin/customers/'+phone,{cookie})).data.customer.isAdult,false);
 const expired=jwt.sign({role:'admin',version:crypto.createHash('sha256').update(hash).digest('hex')},secret,{audience:'azit-admin',expiresIn:-1});assert.equal((await req('/admin/overview',{cookie:'__Host-azit_admin='+expired})).status,401);
 for(let i=0;i<5;i++)await req('/admin/session',{method:'POST',body:{password:'wrong'}});
 assert.equal((await req('/admin/session',{method:'POST',body:{password:'wrong'}})).status,429);
 console.log('PASS: admin password/session/expiry/rate limit, CSRF, ticket ownership and internal-note privacy, durable support replies, atomic idempotent heart adjustments, audit trail, analytics settings and restart recovery');
 }catch(e){console.error(e);process.exitCode=1;}finally{await stop();sql?.close();fs.rmSync(dir,{recursive:true,force:true});}})();
