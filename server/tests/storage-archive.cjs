const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-archive-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),AZIT_ARCHIVE_KEY:crypto.randomBytes(32).toString('hex'),AZIT_R2_PREFIX:'azitchat-test/v1'});
const db=require('../services/dbService'),store=require('../services/objectStorage'),archive=require('../services/conversationArchive'),backup=require('../scripts/backup-store.cjs');
const objects=new Map();let reads=0,failPut=false;
store.configured=()=>true;store.putVerified=async(key,bytes)=>{if(failPut)throw Error('Upload failed');const packed=store.pack(bytes);assert(!packed.includes(Buffer.from('개인 대화')));objects.set(key,packed);assert.deepEqual(store.unpack(packed),bytes);return {sha256:store.hash(bytes),bytes:packed.length};};store.get=async key=>{reads++;if(!objects.has(key))throw Error('Storage offline');return store.unpack(objects.get(key));};store.list=async prefix=>[...objects.keys()].filter(k=>k.startsWith(prefix));store.remove=async key=>objects.delete(key);
(async()=>{try{
 const plain=Buffer.from('개인 대화 원문');const encrypted=store.pack(plain);assert.deepEqual(store.unpack(encrypted),plain);encrypted[40]^=1;assert.throws(()=>store.unpack(encrypted),'Tampered ciphertext must fail authentication');
 db.createUser({id:'storage-user'});db.createUser({id:'other-user'});
 const messages=Array.from({length:10005},(_,i)=>({id:'msg_'+String(i).padStart(6,'0'),sender:i%2?'ai':'user',text:'개인 대화 '+i,createdAt:1700000000000+Math.floor(i/2)}));
 db.appendMessages('storage-user','chaewon',messages);assert.equal(db.getUser('storage-user').savedRooms.chaewon.messages.length,120,'Operational account JSON stays bounded');assert.equal(db.sql.prepare('SELECT count(*) n FROM conversation_messages').get().n,10005,'Full transcript is preserved before compaction');
 failPut=true;await assert.rejects(archive.archiveBatch());assert.equal(db.sql.prepare('SELECT count(*) n FROM archive_message_refs').get().n,0,'Failed upload cannot mark records archived');failPut=false;
 let archived=0;for(;;){const n=await archive.archiveBatch();archived+=n;if(n<500)break;}assert.equal(archived,10005);assert.equal(await archive.archiveBatch(),0,'Idempotent backfill');assert(![...objects.keys()].some(k=>k.includes('storage-user')));
 const seen=new Set();let cursor,more=true;while(more){const page=await archive.page('storage-user','chaewon',{before:cursor});assert(page.messages.length<=40);for(const m of page.messages){assert(!seen.has(m.id));seen.add(m.id);}cursor=page.nextCursor;more=page.hasMore;}assert.equal(seen.size,10005,'Every message remains reachable with tied timestamps');assert(reads>0,'History actually reads archived R2 objects');assert.equal((await archive.page('other-user','chaewon')).messages.length,0,'Account isolation');await assert.rejects(archive.page('storage-user','chaewon',{before:'invalid'}),e=>e.status===400);
 const first=await archive.page('storage-user','chaewon');const saved=new Map(objects);objects.clear();const fallback=await archive.page('storage-user','chaewon');assert.deepEqual(fallback,first,'Object outage uses the operational copy without losing history');for(const [k,v]of saved)objects.set(k,v);
 // Legacy room objects and new multi-account batches coexist without cross-room leaks.
 const legacyRow={user_id:'storage-user',character_id:'legacy-room',message_id:'legacy-msg',created_at:1700000020000,data:JSON.stringify({id:'legacy-msg',sender:'ai',text:'legacy preserved',createdAt:1700000020000})};
 db.appendMessages('storage-user','legacy-room',[JSON.parse(legacyRow.data)]);
 const legacyPlain=Buffer.from(JSON.stringify({version:1,messages:[legacyRow]})),legacyKey=store.settings().prefix+'/conversations/legacy/'+store.hash(legacyPlain)+'.azr';
 const legacyResult=await store.putVerified(legacyKey,legacyPlain);
 db.sql.prepare('INSERT INTO archive_objects VALUES(?,?,?,?)').run(legacyKey,legacyResult.sha256,1,Date.now());
 db.sql.prepare('INSERT INTO archive_message_refs VALUES(?,?,?,?,?)').run('storage-user','legacy-room','legacy-msg',legacyKey,0);
 db.createUser({id:'batch-user'});db.createUser({id:'batch-other'});
 for(let i=0;i<100;i++)db.appendMessages(i%2?'batch-user':'batch-other','room-'+i,[{id:'batch-msg-'+i,sender:'ai',text:'private room '+i,createdAt:1700000030000+i}]);
 const objectCount=objects.size;failPut=true;await assert.rejects(archive.archiveBatch());failPut=false;
 assert.equal(db.sql.prepare("SELECT count(*) n FROM archive_message_refs WHERE message_id LIKE 'batch-msg-%'").get().n,0);
 assert.equal(await archive.archiveBatch(),100);assert.equal(objects.size-objectCount,1,'100 rooms share one uploaded object');
 const refs=db.sql.prepare("SELECT * FROM archive_message_refs WHERE message_id LIKE 'batch-msg-%' ORDER BY entry_index").all();
 assert.equal(new Set(refs.map(r=>r.object_key)).size,1);assert.equal(new Set(refs.map(r=>r.entry_index)).size,100);
 // Empty hot state forces the archive read path, including both legacy and shared objects.
 db.sql.prepare("UPDATE users SET data=json_set(data,'$.savedRooms',json('{}')) WHERE id IN ('batch-user','batch-other','storage-user')").run();
 for(let i=0;i<100;i++){const owner=i%2?'batch-user':'batch-other',other=i%2?'batch-other':'batch-user';const result=await archive.page(owner,'room-'+i);assert.equal(result.messages.length,1);assert.equal(result.messages[0].text,'private room '+i);assert.equal((await archive.page(other,'room-'+i)).messages.length,0);}
 assert.equal((await archive.page('storage-user','legacy-room')).messages[0].text,'legacy preserved');
 assert.equal(await archive.archiveBatch(),0,'Shared batches are idempotent');
 const source=path.join(dir,'snapshot.bin'),target=path.join(dir,'restored.bin'),bytes=crypto.randomBytes(9*1024*1024);fs.writeFileSync(source,bytes);const uploaded=await backup.upload(source);assert.equal(uploaded.parts,2);await backup.restore(uploaded.key,target);assert.deepEqual(fs.readFileSync(target),bytes,'Multi-part backup restores exactly');
 console.log('PASS: authenticated encryption/tamper rejection, opaque keys, verified and retryable R2 archiving, bounded account state, complete 10,005-message cursor history, cross-account isolation, outage fallback, multipart encrypted backup restoration');
}finally{db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
