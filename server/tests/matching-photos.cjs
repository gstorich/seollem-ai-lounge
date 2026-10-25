const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const photos=require('../../matchPhotos'),root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'azit-photo-match-')),base='http://127.0.0.1:19449/api';
let child,sql,logs='',token,userId;
async function request(route,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,...await r.json()};}
(async()=>{try{
 assert.equal(photos.photoKey('avatars/shared.jpg'),photos.photoKey('https://azitchat.com/avatars/shared.jpg?v=2#x'));
 assert.notEqual(photos.photoKey('https://other.test/avatars/shared.jpg'),photos.photoKey('avatars/shared.jpg'));
 assert.equal(photos.conflicts({id:'x',avatar:''},new Map()),false);
 child=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'19449',DATABASE_FILE:path.join(dir,'legacy.json'),SQLITE_FILE:path.join(dir,'test.sqlite'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),GEMINI_API_KEY:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,logs);
 const asset=await fetch(base.replace('/api','')+'/matchPhotos.js?v=20261025-kept-rooms');assert.equal(asset.status,200);assert.match(await asset.text(),/AzitMatchPhotos/);
 const guest=await request('/auth/guest',{});token=guest.token;userId=guest.user.id;
 assert.equal((await request('/legal/accept',{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200);
 sql=new DatabaseSync(path.join(dir,'test.sqlite'));
 function update(values){const u=JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get(userId).data);Object.assign(u,values);sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(u),userId);}
 function snapshot(){return {data:sql.prepare('SELECT data FROM users WHERE id=?').get(userId).data,recommendations:sql.prepare('SELECT count(*) n FROM match_recommendations').get().n,ledger:sql.prepare('SELECT count(*) n FROM ledger').get().n};}
 const catalog=(await request('/match/characters')).characters,lookup=id=>catalog.find(c=>c.id===id);
 update({isVipUnlimited:true});
 for(const gender of ['female','male']){
  const group=catalog.filter(c=>c.gender===gender),a=group.find(c=>group.some(d=>c.id!==d.id&&photos.photoKey(c.avatar)===photos.photoKey(d.avatar))),b=group.find(c=>c.id!==a.id&&c.avatar===a.avatar);
  const room={charId:a.id,messages:[],firstMetAt:Date.now()};
  update({savedRooms:{[a.id]:room},metCharIds:[a.id,b.id],prevCharId:b.id});
  let before=snapshot();let r=await request('/match/request',{characterId:b.id,allowRepeat:true});assert.equal(r.status,409);assert.equal(r.error,'MATCH_PHOTO_IN_USE');assert.deepEqual(snapshot(),before,'Rejected direct match must not mutate state or debit hearts');
  r=await request('/match/recall-previous',{characterId:b.id});assert.equal(r.status,409);assert.deepEqual(snapshot(),before,'Rejected paid recall must not debit hearts');
  update({savedRooms:{[a.id]:{...room,roomLeft:true}},metCharIds:[a.id]});
  r=await request('/match/request',{characterId:b.id});assert.equal(r.error,'MATCH_PHOTO_IN_USE','Retained closed room still reserves its photo');
  r=await request('/match/request',{filters:{gender}});assert.equal(r.status,200);assert.notEqual(r.character.avatar,a.avatar,'Server random selection excludes kept-room photos');
  update({savedRooms:{[a.id]:room},metCharIds:[a.id]});
  r=await request('/match/request',{characterId:a.id,allowRepeat:true});assert.equal(r.status,200);assert.equal(r.repeated,true,'Resuming the same character is allowed');
  const del=await fetch(base+'/account/rooms/'+a.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});assert.equal(del.status,200);
  r=await request('/match/request',{characterId:b.id});assert.equal(r.status,200,'Deleting the only room releases the photo for another character');
  const owners=photos.roomPhotoOwners({[a.id]:room},lookup),service=require('../services/characterService');
  assert.equal(service.findMatch({gender},group.filter(c=>c.id!==b.id).map(c=>c.id),owners),null,'All remaining candidates sharing a kept photo are excluded before ranking');
 }
 const males=catalog.filter(c=>c.gender==='male'),byPhoto=new Map();for(const c of males)byPhoto.set(photos.photoKey(c.avatar),c);
 const rooms=Object.fromEntries([...byPhoto.values()].map(c=>[c.id,{charId:c.id,messages:[]} ]));
 update({savedRooms:rooms,metCharIds:[]});let before=snapshot();let r=await request('/match/request',{filters:{gender:'male'}});assert.equal(r.status,404);assert.equal(r.error,'MATCH_POOL_EXHAUSTED');assert.deepEqual(snapshot(),before);
 r=await request('/match/request',{filters:{gender:'male'},allowRepeat:true});assert.equal(r.status,200);assert.equal(r.repeated,true);assert(rooms[r.character.id],'Exhaustion may resume an existing room, never introduce another character with its photo');
 // Execute the actual browser candidate function, including stale/local histories.
 for(const file of ['index.html','seollem_chat_standalone.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8'),source=html.slice(html.indexOf('    function getFilteredUnmetPool('),html.indexOf('    function pickRandomCharacter('));
  const chars=[{id:'a',avatar:'avatars/a.jpg',gender:'female'},{id:'b',avatar:'/avatars/a.jpg',gender:'female'},{id:'c',avatar:'avatars/c.jpg',gender:'female'}];
  const state={savedRooms:{a:{roomLeft:true}},metCharIds:['a'],matchFilter:{gender:'female'},currentChar:null};
  const context={state,CHARACTERS:chars,AzitMatchPhotos:photos,localStorage:{getItem:()=>null}};vm.createContext(context);vm.runInContext(source,context);
  assert.equal(context.getFilteredUnmetPool().map(c=>c.id).join(','),'c');
  state.savedRooms={};assert.equal(context.getFilteredUnmetPool().map(c=>c.id).join(','),'b,c','Past encounters alone do not reserve photos');
  state.currentChar=chars[0];assert.equal(context.getFilteredUnmetPool().map(c=>c.id).join(','),'c','Current pending room is also protected in browser');
 }
 console.log('PASS: retained-room photo deduplication in browser and API, both genders, closed rooms, deletion, direct choice, random choice, repeat/recall, exhaustion and no rejected-match side effects');
}catch(e){console.error(e);process.exitCode=1;}finally{if(child&&child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}sql?.close();fs.rmSync(dir,{recursive:true,force:true});}})();
