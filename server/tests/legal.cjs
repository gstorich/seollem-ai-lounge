const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-legal-'));
Object.assign(process.env,{NODE_ENV:'test',HOST:'127.0.0.1',PORT:'19423',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),legal=require('../services/legalService'),auth=require('../middleware/auth');
const confirmation={version:legal.version,atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true};
let server;
(async()=>{try{
 const user=db.createUser({id:'legal-guest'}),token=auth.generateToken({userId:user.id});
 assert(!legal.accepted(user));
 for(const change of [{version:'old'},{atLeast18:false},{termsAccepted:false},{privacyAcknowledged:false},{aiNoticeAcknowledged:false}])assert.throws(()=>legal.accept(user.id,{...confirmation,...change}));
 assert.equal(db.sql.prepare('SELECT count(*) n FROM legal_acceptance_events').get().n,0);
 const config=require('../config');config.port=19423;config.host='127.0.0.1';server=require('../server').server;if(!server.listening)await new Promise(r=>server.once('listening',r));
 async function req(route,body,authToken=token){const r=await fetch('http://127.0.0.1:19423/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authToken?{Authorization:'Bearer '+authToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
 assert.equal((await req('/legal/status',undefined,'')).status,401);
 const before=db.getUser(user.id).hearts;
 for(const route of ['/chat/send','/chat/greeting','/chat/gift']){const denied=await req(route,{characterId:'chaewon',message:'general',messageId:route.replaceAll('/','_'),giftKey:'coffee'});assert.equal(denied.status,428);assert.equal(denied.data.costDeducted,0);}
 await fetch('http://127.0.0.1:19423/api/account/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({legalAcceptance:{version:legal.version,atLeast18:true},atLeast18:true})});assert(!legal.accepted(db.getUser(user.id)),'Client state cannot forge consent');
 assert.equal(db.getUser(user.id).hearts,before);assert.equal(db.sql.prepare('SELECT count(*) n FROM conversation_messages').get().n,0);
 assert.equal((await req('/legal/accept',confirmation)).status,200);const accepted=legal.status(db.getUser(user.id));assert(accepted.accepted);assert(accepted.acceptedAt>0);
 assert.equal((await req('/legal/accept',confirmation)).status,200);assert.equal(db.sql.prepare('SELECT count(*) n FROM legal_acceptance_events').get().n,1,'Repeated consent is idempotent');
 assert.equal((await req('/chat/send',{characterId:'chaewon',message:'general',messageId:'after-legal'})).status,503,'Accepted users reach the normal provider gate');
 const linked=db.linkPhone(user.id,'01000001801').user;assert(legal.accepted(linked));assert.equal(db.sql.prepare('SELECT user_id FROM legal_acceptance_events').get().user_id,linked.id);
 const next=db.createUser({id:'second-legal'});legal.accept(next.id,confirmation);db.linkPhone(next.id,linked.phone);assert(legal.accepted(db.getUser(linked.id)));assert.equal(db.sql.prepare('SELECT count(*) n FROM legal_acceptance_events WHERE user_id=?').get(linked.id).n,2,'Guest-to-member merge preserves the consent evidence');
 const memberToken=auth.generateToken({userId:linked.id});assert.equal((await req('/legal/stop',{},memberToken)).status,200);assert(!legal.accepted(db.getUser(linked.id)));assert.equal((await req('/chat/send',{characterId:'chaewon',message:'general',messageId:'after-stop'},memberToken)).status,428);
 db.updateUser(linked.id,{identityVerification:{verified:true,isAtLeast18:false,isAdult:false,verifiedAt:Date.now()}});
 assert.equal((await req('/legal/accept',confirmation,memberToken)).status,403);assert.equal((await req('/chat/greeting',{characterId:'chaewon',messageId:'under18'},memberToken)).status,403);
 for(const route of ['/terms','/privacy','/refund','/safety','/policies','/terms-20261019-v1','/privacy-20261019-v1','/refund-20261019-v1']){const r=await fetch('http://127.0.0.1:19423'+route);assert.equal(r.status,200,route);const html=await r.text();assert(html.includes('<h1>'));if(!route.includes('-v1'))assert(html.includes('3층'),route);}
 const {execFileSync}=require('node:child_process');const result=execFileSync(process.execPath,['-e',"const l=require('./server/services/legalService'),d=require('./server/services/dbService');process.stdout.write(JSON.stringify({accepted:l.accepted(d.getUser('01000001801')),events:d.sql.prepare('SELECT count(*) n FROM legal_acceptance_events').get().n}));"],{cwd:path.resolve(__dirname,'../..'),env:process.env,encoding:'utf8'});assert.deepEqual(JSON.parse(result),{accepted:false,events:3});
 console.log('PASS: explicit versioned consent/age/AI notice, default denial, no charge or chat before acceptance, idempotency, phone merge, stop, known-under18 enforcement, history pages and restart evidence');
 }finally{if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
