const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-room-retention-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_FILE:path.join(dir,'db.json'),SQLITE_FILE:path.join(dir,'db.sqlite'),GEMINI_API_KEY:'',OPENAI_API_KEY:''});
const db=require('../services/dbService'),list=require('../../roomList'),catalog=require('../services/characterService').getAllCharacters(),auth=require('../middleware/auth'),express=require('express');
(async()=>{let server;try{
 const now=Date.now(),id='retention-user',rooms={};
 for(let i=0;i<100;i++){const c=catalog[i];rooms[c.id]={charId:c.id,firstMetAt:now-200000,messages:[{id:'m'+i,sender:'user',text:'test',createdAt:now-100000+i*100}],updatedAt:now+1000000-i};}
 db.createUser({id,hearts:100,savedRooms:rooms});assert.equal(Object.keys(db.getUser(id).savedRooms).length,100,'The 100th room is retained');
 const oldId=catalog[1].id,newId=catalog[100].id;
 require('../services/proactiveStore');db.sql.prepare('INSERT INTO proactive_jobs VALUES(?,?,?,?,?,0,0)').run(id,oldId,'source',now+99999,'pending');
 db.sql.prepare('INSERT INTO proactive_deliveries(user_id,character_id,message_id,created_at) VALUES(?,?,?,?)').run(id,oldId,'notice',now);
 db.saveConversationState(id,oldId,{summary:'memory',state:{}},'reply',0);
 db.appendMessages(id,catalog[0].id,[{id:'recent',sender:'user',text:'test',createdAt:now}]);
 db.appendMessages(id,newId,[{id:'new',sender:'ai',text:'test',createdAt:now+1}]);
 let user=db.getUser(id);assert.equal(Object.keys(user.savedRooms).length,100);assert(user.savedRooms[catalog[0].id]);assert(user.savedRooms[newId]);assert(!user.savedRooms[oldId],'Eviction follows real message time, not snapshot update time');
 assert(db.isRoomDeleted(id,oldId));assert.equal(db.getConversationState(id,oldId).revision,2);assert.equal(db.getConversationState(id,oldId).memory,null);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM proactive_jobs WHERE user_id=? AND character_id=?').get(id,oldId).n,0);
 assert.equal(db.sql.prepare('SELECT push_status FROM proactive_deliveries WHERE user_id=? AND character_id=?').get(id,oldId).push_status,'cancelled');
 const balance=user.hearts;assert.throws(()=>db.transaction(()=>{db.debit(id,3.7,'test');db.appendMessages(id,oldId,[{id:'late',sender:'ai',text:'late',createdAt:Date.now()}]);}),/ROOM_DELETED/);assert.equal(db.getUser(id).hearts,balance,'Late replies cannot charge or resurrect an evicted room');
 db.updateUser(id,{savedRooms:db.mergeRooms(user.savedRooms,{[oldId]:rooms[oldId]})});assert(!db.getUser(id).savedRooms[oldId],'Stale client snapshots cannot resurrect evicted rooms');
 const app=express();app.use(express.json({limit:'2mb'}));app.use('/api/account',require('../routes/account'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+auth.generateToken({userId:id}),'Content-Type':'application/json'};
 const snapshot=await(await fetch(base+'/api/account/state?compact=1',{headers})).json();assert.equal(snapshot.roomLimit,100);assert(snapshot.deletedRoomIds.includes(oldId));assert.equal(Object.keys(snapshot.savedRooms).length,100);
 assert.equal((await fetch(base+'/api/account/rooms/'+oldId+'/messages',{headers})).status,404);
 const stale=await(await fetch(base+'/api/account/state',{method:'PUT',headers,body:JSON.stringify({savedRooms:{[oldId]:rooms[oldId]}})})).json();assert(stale.deletedRoomIds.includes(oldId));assert(!db.getUser(id).savedRooms[oldId]);
 db.reopenRoom(id,oldId);assert(!db.isRoomDeleted(id,oldId));db.appendMessages(id,oldId,[{id:'reopened',sender:'ai',text:'new start',createdAt:Date.now()+2}]);
 assert.equal(Object.keys(db.getUser(id).savedRooms).length,100);const history=await require('../services/conversationArchive').page(id,oldId);assert.deepEqual(history.messages.map(m=>m.id),['reopened'],'Explicit reopening never shows the deleted conversation');
 const bulk={};for(let i=0;i<130;i++)bulk[catalog[200+i].id]={charId:catalog[200+i].id,messages:[{id:'bulk'+i,sender:'user',text:'test',createdAt:i+1}]};
 db.createUser({id:'bulk',savedRooms:bulk});assert.equal(Object.keys(db.getUser('bulk').savedRooms).length,100);assert.equal(db.deletedRoomIds('bulk').length,30);
 const phone='01000000002',guestRooms={},memberRooms={};
 for(let i=0;i<60;i++){const c=catalog[400+i],d=catalog[460+i];guestRooms[c.id]={charId:c.id,messages:[{id:'guest'+i,sender:'user',text:'test',createdAt:i+1}]};memberRooms[d.id]={charId:d.id,messages:[{id:'member'+i,sender:'user',text:'test',createdAt:i+61}]};}
 db.createUser({id:'merge-guest',hearts:0,savedRooms:guestRooms});db.createUser({id:phone,phone,hearts:0,savedRooms:memberRooms});db.deleteRoom('merge-guest',catalog[400].id);
 const linked=db.linkPhone('merge-guest',phone);assert.equal(Object.keys(linked.user.savedRooms).length,100);assert(db.isRoomDeleted(phone,catalog[400].id),'Room deletion markers follow a linked guest account');
 // Simulate an already persisted pre-upgrade account, then boot a fresh process.
 db.sql.prepare("DELETE FROM metadata WHERE key='room_limit_100_v1'").run();db.sql.prepare("DELETE FROM room_deletions WHERE user_id='bulk'").run();db.sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify({...db.getUser('bulk'),savedRooms:bulk}),'bulk');
 const check=spawnSync(process.execPath,['-e',"const db=require('./server/services/dbService');if(Object.keys(JSON.parse(db.sql.prepare(\"SELECT data FROM users WHERE id='bulk'\").get().data).savedRooms).length!==100)process.exit(2);"],{cwd:path.resolve(__dirname,'../..'),env:process.env,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
 const copy=structuredClone(bulk);const removed=list.trimRooms(copy);assert.equal(removed.length,30);assert.equal(Object.keys(copy).length,100);
 console.log('PASS: 100-room boundary, activity-based eviction, stale-device protection, late-reply rollback, proactive cancellation, deletion sync, clean reopening, bulk merge and startup migration');
}finally{if(server)await new Promise(r=>server.close(r));db.sql.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
