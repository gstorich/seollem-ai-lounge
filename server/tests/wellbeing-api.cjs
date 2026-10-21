const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-wellbeing-api-'));
Object.assign(process.env,{SQLITE_FILE:path.join(dir,'test.sqlite'),DATABASE_FILE:path.join(dir,'test.json'),NODE_ENV:'test'});
const db=require('../services/dbService'),express=require('express'),auth=require('../middleware/auth');
(async()=>{let server;try{
 db.createUser({id:'wb-owner'});db.createUser({id:'wb-other'});
 const app=express();app.use(express.json());app.use('/api/wellbeing',require('../routes/wellbeing'));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/wellbeing';
 const token=id=>auth.generateToken({userId:id});
 async function req(id,route='',method='GET',body){const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:'Bearer '+token(id)}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,cache:res.headers.get('cache-control'),data:await res.json()};}
 assert.equal((await req(null)).status,401);
 const input={date:'2026-10-21',mood:'',note:'친구와 공원 산책',characterId:null};
 const saved=await req('wb-owner','','POST',input);assert.equal(saved.status,200);const r=saved.data.record;
 const own=await req('wb-owner');assert.equal(own.cache,'no-store');assert.equal(own.data.sharingEnabled,false);assert.equal(own.data.records.length,1);
 assert.equal((await req('wb-other')).data.records.length,0);
 assert.equal((await req('wb-other','/'+r.id,'PUT',{...input,version:r.updatedAt})).status,404);
 assert.equal((await req('wb-other','/'+r.id,'DELETE')).status,404);
 assert.equal((await req('wb-owner','/'+r.id,'PUT',{...input,version:0})).status,409);
 assert.equal((await req('wb-owner','','POST',{...input,note:'a'.repeat(1001)})).status,400);
 const edited=await req('wb-owner','/'+r.id,'PUT',{...input,note:'수정 메모',version:r.updatedAt});assert.equal(edited.data.record.note,'수정 메모');
 assert.equal((await req('wb-owner','/'+r.id,'DELETE')).status,200);assert.equal((await req('wb-owner')).data.records.length,0);
 console.log('PASS wellbeing HTTP: authenticated CRUD, cross-account access rejected, no-store, private-only payload, version conflicts, bounds');
}finally{if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
