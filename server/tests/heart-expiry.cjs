const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-heart-expiry-'));
process.env.NODE_ENV='test';process.env.SQLITE_FILE=path.join(dir,'test.sqlite');process.env.DATABASE_FILE=path.join(dir,'legacy.json');
const realNow=Date.now;let now=Date.parse('2024-02-29T10:00:00+09:00');Date.now=()=>now;
const sql=new DatabaseSync(process.env.SQLITE_FILE);
sql.exec('CREATE TABLE users(id TEXT PRIMARY KEY,phone TEXT UNIQUE,data TEXT NOT NULL);CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,delta INTEGER NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);');
const acquired=Date.parse('2020-10-18T09:00:00+09:00');
sql.prepare('INSERT INTO users VALUES(?,?,?)').run('legacy',null,JSON.stringify({id:'legacy',hearts:40,createdAt:acquired,savedRooms:{},metCharIds:[]}));
sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run('legacy',500,'initial',acquired);
sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run('legacy',-100,'chat',acquired+1000);
const db=require('../services/dbService'),{expiresAfterTwoYears}=require('../services/heartWallet');
const balance=id=>db.getUser(id).hearts;
const expiryRows=id=>sql.prepare("SELECT count(*) n FROM ledger WHERE user_id=? AND reason='heart_expired'").get(id).n;
function reconcile(id){assert.equal(sql.prepare('SELECT coalesce(sum(delta),0) n FROM ledger WHERE user_id=?').get(id).n,Math.round(balance(id)*10));}
try{
 assert.equal(expiresAfterTwoYears(now),Date.parse('2026-02-28T10:00:00+09:00'));
 db.createUser({id:'leap',hearts:10});const leapExpiry=db.getHeartSummary('leap').nextExpiresAt;
 now=leapExpiry-1;assert.equal(balance('leap'),10);now++;assert.equal(balance('leap'),0);assert.equal(expiryRows('leap'),1);assert.equal(balance('leap'),0);assert.equal(expiryRows('leap'),1);assert.equal(db.debit('leap',0.1,'chat'),null);reconcile('leap');
 now=Date.parse('2024-01-01T12:00:00+09:00');db.createUser({id:'fifo',hearts:100});
 now=Date.parse('2025-01-01T12:00:00+09:00');db.creditHearts('fifo',50,'phone_bonus');
 now=Date.parse('2025-06-01T12:00:00+09:00');assert.equal(db.debit('fifo',80,'chat').hearts,70);
 let grants=db.getHeartGrants('fifo');assert.equal(grants.find(g=>g.reason==='initial').remainingHearts,20);assert.equal(grants.find(g=>g.reason==='phone_bonus').remainingHearts,50);
 now=Date.parse('2026-01-01T12:00:00+09:00');assert.equal(balance('fifo'),50);assert.equal(db.getHeartGrants('fifo').find(g=>g.reason==='initial').expiredHearts,20);
 now=Date.parse('2026-01-02T12:00:00+09:00');db.creditHearts('fifo',5,'admin_adjustment');assert.equal(db.getHeartSummary('fifo').nextExpiresAt,Date.parse('2027-01-01T12:00:00+09:00'));assert.equal(db.debit('fifo',0.1,'gift:test').hearts,54.9);reconcile('fifo');
 now=Date.parse('2024-10-01T08:00:00+09:00');db.createUser({id:'guest_first',hearts:50});
 now=Date.parse('2025-10-01T08:00:00+09:00');const linked=db.linkPhone('guest_first','01000000001');assert.equal(linked.user.hearts,150);assert(linked.bonusAwarded);
 assert.equal(db.getHeartGrants(linked.user.id).find(g=>g.reason==='initial').expiresAt,Date.parse('2026-10-01T08:00:00+09:00'));
 now=Date.parse('2026-10-01T08:00:00+09:00');assert.equal(balance(linked.user.id),100);const originalBonusExpiry=db.getHeartSummary(linked.user.id).nextExpiresAt;
 now=Date.parse('2026-10-02T08:00:00+09:00');db.createUser({id:'guest_return',hearts:50});const returning=db.linkPhone('guest_return',linked.user.id);assert.equal(returning.user.hearts,100);assert.equal(returning.bonusAwarded,false);assert.equal(db.getHeartSummary(linked.user.id).nextExpiresAt,originalBonusExpiry);assert(db.getHeartGrants(linked.user.id).some(g=>g.removedHearts===50));reconcile(linked.user.id);
 assert.equal(balance('legacy'),0);assert.equal(db.getHeartGrants('legacy')[0].acquiredAt,acquired);assert.equal(db.getHeartGrants('legacy')[0].expiresAt,expiresAfterTwoYears(acquired));assert.equal(expiryRows('legacy'),1);reconcile('legacy');
 now=Date.parse('2024-04-01T12:30:00+09:00');db.createUser({id:'offline',hearts:25});now=Date.parse('2026-04-01T12:30:00+09:00');db.expireHearts();assert.equal(JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get('offline').data).hearts,0,'Batch sweep expires accounts without login');assert.equal(expiryRows('offline'),1);
 const cached=JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get('fifo').data);cached.hearts=999;sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(cached),'fifo');assert.equal(balance('fifo'),54.9,'A cached balance cannot restore consumed grants');
 const before=sql.prepare('SELECT count(*) n FROM heart_grants').get().n;
 const child=spawnSync(process.execPath,['-e',"Date.now=()=>Date.parse('2026-10-18T12:00:00Z');const db=require('./server/services/dbService');console.log(JSON.stringify({fifo:db.getUser('fifo').hearts,phone:db.getUser('01000000001').hearts,legacy:db.getUser('legacy').hearts,grants:db.getHeartGrants('01000000001')}))"],{cwd:path.resolve(__dirname,'../..'),env:process.env,encoding:'utf8'});assert.equal(child.status,0,child.stderr);const restored=JSON.parse(child.stdout.trim());assert.equal(restored.fifo,54.9);assert.equal(restored.phone,100);assert.equal(restored.legacy,0);assert.equal(restored.grants.find(g=>g.reason==='phone_bonus').expiresAt,originalBonusExpiry);assert.equal(sql.prepare('SELECT count(*) n FROM heart_grants').get().n,before,'Restart cannot remint grants');
 now=originalBonusExpiry;assert.equal(balance(linked.user.id),0);db.createUser({id:'guest_after_expiry',hearts:50});const afterExpiry=db.linkPhone('guest_after_expiry',linked.user.id);assert.equal(afterExpiry.bonusAwarded,false);assert.equal(afterExpiry.user.hearts,0,'Expired bonuses do not recur on login');reconcile(linked.user.id);
 const workerScript=`const {DatabaseSync}=require('node:sqlite'),assert=require('node:assert/strict');const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE users(id TEXT PRIMARY KEY,phone TEXT,data TEXT);CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id TEXT,delta INTEGER,reason TEXT,created_at INTEGER)');sql.prepare('INSERT INTO users VALUES(?,?,?)').run('timer',null,JSON.stringify({id:'timer',hearts:0}));const wallet=require('./server/services/heartWallet').createWallet(sql);wallet.create('timer',100,Date.now());sql.prepare('UPDATE heart_grants SET expires_at=?').run(Date.now()+50);const stop=wallet.startWorker();setTimeout(()=>{try{assert.equal(JSON.parse(sql.prepare('SELECT data FROM users').get().data).hearts,0);assert.equal(sql.prepare("SELECT count(*) n FROM ledger WHERE reason='heart_expired'").get().n,1);stop();sql.close();}catch(e){console.error(e);process.exitCode=1;}},180);`;
 const worker=spawnSync(process.execPath,['-e',workerScript],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});assert.equal(worker.status,0,worker.stderr);
 console.log('PASS: two calendar years/KST/leap day/exact boundary, FIFO partial consumption, independent grant expiry, automatic sweep, ledger migration/reconciliation, phone transfer without extending expiry, no repeat bonus, cache tamper rejection and restart persistence');
}catch(e){console.error(e);process.exitCode=1;}finally{Date.now=realNow;sql.close();fs.rmSync(dir,{recursive:true,force:true});}
