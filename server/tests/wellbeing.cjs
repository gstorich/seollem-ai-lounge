const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-wellbeing-'));
Object.assign(process.env,{SQLITE_FILE:path.join(dir,'test.sqlite'),DATABASE_FILE:path.join(dir,'test.json'),NODE_ENV:'test'});
const db=require('../services/dbService'),service=require('../services/wellbeingService');
try{
 db.createUser({id:'care-a'});db.createUser({id:'care-b'});
 const char=require('../services/characterService').getAllCharacters()[0].id;
 const input={date:'2026-10-21',mood:'좋아요',note:'내일 친구와 산책하기',characterId:null};
 let r=service.save('care-a',input);
 assert.equal(service.list('care-b').length,0);assert.equal(service.context('care-a',char).prompt,'');
 assert.equal(service.save('care-b',{...input,version:r.updatedAt},r.id),null);
 assert.equal(service.remove('care-b',r.id),false);
 assert.throws(()=>service.save('care-a',{...input,date:'2026-02-30'}));
 assert.throws(()=>service.save('care-a',{...input,characterId:char}));
 assert.throws(()=>service.save('care-a',{...input,version:0},r.id),e=>e.status===409);
 r=service.save('care-a',{...input,characterId:char,contextConsent:true,version:r.updatedAt},r.id);
 assert.equal(r.sharingScope,'self');const context=service.context('care-a',char);
 assert.match(context.prompt,/내일 친구와 산책/);assert.equal(service.context('care-b',char).prompt,'');assert.equal(service.context('care-a','other-char').prompt,'');
 r=service.save('care-a',{...input,version:r.updatedAt},r.id);
 assert.equal(service.context('care-a',char).prompt,'');assert.throws(()=>service.assertCurrent('care-a',char,context),/CHANGED/);
 db.linkPhone('care-a','01000000029');assert.equal(service.list('01000000029').length,1);assert.equal(service.list('care-a').length,1);
 assert(service.remove('01000000029',r.id));assert.equal(service.list('01000000029').length,0);
 const frontend=fs.readFileSync(path.join(__dirname,'../../wellbeing.js'),'utf8');assert.match(frontend,/interimResults=false/);assert.match(frontend,/e!==epoch/);assert.match(frontend,/나만 보기/);assert.match(frontend,/건강정보 등 민감한/);
 console.log('PASS: private records, explicit character consent, stale edit and generation rejection, scoped context, deletion, date validation, phone transfer, voice confirm-before-send');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
