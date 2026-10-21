const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-adult-qa-'));
Object.assign(process.env,{NODE_ENV:'production',JWT_SECRET:'synthetic-test-secret-with-at-least-32-chars',SQLITE_FILE:path.join(dir,'db.sqlite'),DATABASE_FILE:path.join(dir,'legacy.json')});
const db=require('../services/dbService'),access=require('../services/contentAccess'),testAccess=require('../services/adultTestAccess'),identity=require('../services/identityService'),safety=require('../services/safetyMonitoring'),ops=require('../services/operationsService');
try{
 const user=db.createUser({id:'01000004001',phone:'01000004001',isTester:true,hearts:0,createdAt:Date.now()}),other=db.createUser({id:'01000004002',phone:'01000004002',hearts:0,createdAt:Date.now()});
 const now=Date.now(),put=(start=now,end=now+86400000,actor='operator')=>db.sql.prepare('INSERT OR REPLACE INTO adult_test_access VALUES(?,?,?,?,?)').run(user.id,user.phone,start,end,actor);
 assert(!access.verifiedAdult(user));put();assert(access.verifiedAdult(user));assert(!access.providerVerifiedAdult(user));assert(!identity.status(user).verified);assert(identity.status(user).testAccess.enabled);assert.equal(safety.ageGroup(user),'adult_test');assert(!access.verifiedAdult(other));
 assert(!testAccess.active({...user,isTester:false}));assert(!testAccess.active({...user,phone:other.phone}));assert(!testAccess.active({...user,identityVerification:{verified:true,isAdult:false}}));assert(!testAccess.active(user,now+86400000));
 put(now,now+86400001);assert(!testAccess.active(user));put(now+1,now+86400000);assert(!testAccess.active(user,now));put(now,now+86400000,'client');assert(!testAccess.active(user));
 put();ops.setAdultVerification('operator',user.id,false,'테스트 권한 해제');assert(!access.verifiedAdult(db.getUser(user.id)));assert.equal(db.sql.prepare('SELECT count(*) n FROM adult_test_access').get().n,0);
 console.log('PASS adult QA access: operator-only persisted grant, tester/phone binding, 24h expiry, no forged verification, minor denial and revocation');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
