const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const db=require('./dbService'),base=require('./frontendCharacters.json'),baseById=new Map(base.map(c=>[c.id,c]));
const {sql}=db;
sql.exec(`CREATE TABLE IF NOT EXISTS character_definitions(id TEXT PRIMARY KEY,data TEXT NOT NULL,published_data TEXT,enabled INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL,published_revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS character_previews(id TEXT PRIMARY KEY,character_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
const traits=['warm','calm','lively','chic','shy'];
const limits={name:60,job:100,area:100,regionGroup:30,bio:500,speechStyle:1200,personality:2500,backstory:3000,motivation:1200,flaws:1000,likes:1000,dislikes:1000,interactionRules:2000,firstMessageDirection:1200};
const definitionFields=['personality','backstory','motivation','flaws','likes','dislikes','interactionRules','firstMessageDirection','defaultRegister','replyLength','dialogueExamples'];
const row=id=>sql.prepare('SELECT * FROM character_definitions WHERE id=?').get(id);
function editable(character){
 const d=character.creatorDefinition||{};
 return {...Object.fromEntries(Object.keys(limits).map(key=>[key,character[key]||d[key]||''])),age:character.age,gender:character.gender||'female',traitKey:character.traitKey,avatar:character.avatar,
 defaultRegister:d.defaultRegister||'polite',replyLength:d.replyLength||'normal',dialogueExamples:d.dialogueExamples||[],personality:d.personality||character.speechStyle||'',motivation:d.motivation||character.conceptMission||'',firstMessageDirection:d.firstMessageDirection||'',interactionRules:d.interactionRules||character.conceptGuidance||''};
}
function validate(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('캐릭터 설정을 확인해주세요.');
 const clean={};for(const [key,max]of Object.entries(limits)){
   if(value[key]!==undefined&&typeof value[key]!=='string')throw Error(key+' 형식을 확인해주세요.');
   clean[key]=(value[key]||'').trim();if(clean[key].length>max)throw Error(key+' 입력이 너무 깁니다. (최대 '+max+'자)');
   if(['name','job','area','regionGroup','bio'].includes(key)&&/[<>]/.test(clean[key]))throw Error('공개 프로필에는 HTML 태그를 사용할 수 없습니다.');
 }
 if(!clean.name||!clean.personality||!clean.speechStyle)throw Error('이름·성격·말투를 입력해주세요.');
 if(!Number.isInteger(value.age)||value.age<19||value.age>99)throw Error('나이는 19~99세로 입력해주세요.');
 if(!['male','female'].includes(value.gender)||!traits.includes(value.traitKey))throw Error('성별·성격 분류를 확인해주세요.');
 if(!['polite','casual','mixed'].includes(value.defaultRegister)||!['short','normal','long'].includes(value.replyLength))throw Error('말높임·답장 길이를 확인해주세요.');
 if(typeof value.avatar!=='string'||!/^avatars\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(value.avatar)||!fs.existsSync(path.join(__dirname,'../..',value.avatar)))throw Error('제공되는 프로필 이미지를 선택해주세요.');
 if(!Array.isArray(value.dialogueExamples)||value.dialogueExamples.length>8)throw Error('대화 예시는 최대 8개입니다.');
 clean.dialogueExamples=value.dialogueExamples.map(e=>{
   if(!e||typeof e.user!=='string'||typeof e.reply!=='string'||!e.user.trim()||!e.reply.trim()||e.user.length>500||e.reply.length>800)throw Error('대화 예시의 상대 말과 답장을 모두 입력해주세요.');
   return {user:e.user.trim(),reply:e.reply.trim()};
 });
 return {...clean,age:value.age,gender:value.gender,traitKey:value.traitKey,avatar:value.avatar,defaultRegister:value.defaultRegister,replyLength:value.replyLength};
}
function materialize(id,value){
 const creatorDefinition=Object.fromEntries(definitionFields.map(k=>[k,value[k]]));
 return {id,name:value.name,age:value.age,ageDecade:String(Math.floor(value.age/10)*10),gender:value.gender,traitKey:value.traitKey,regionGroup:value.regionGroup,job:value.job,area:value.area,avatar:value.avatar,bio:value.bio,speechStyle:value.speechStyle,conceptTitle:value.personality.slice(0,70),conceptMission:value.motivation,conceptGuidance:value.interactionRules,whyJoined:value.motivation,creatorDefinition};
}
function detail(id){
 const saved=row(id),original=baseById.get(id);if(!saved&&!original)return null;
 return {id,source:original?'builtin':'custom',revision:saved?.revision||0,publishedRevision:saved?.published_revision||0,enabled:saved?Boolean(saved.enabled):true,hasPublished:saved?Boolean(saved.published_data):true,updatedAt:saved?.updated_at||null,definition:editable(saved?JSON.parse(saved.data):original)};
}
let cache=null;
function catalog(){
 // Local process writes invalidate this immutable snapshot; restarts rebuild it.
 if(cache)return cache;
 const all=new Map(baseById),enabled=new Set(baseById.keys());
 for(const r of sql.prepare('SELECT id,published_data,enabled FROM character_definitions').all()){
   if(r.published_data)all.set(r.id,JSON.parse(r.published_data));
   else all.delete(r.id);
   if(r.enabled&&r.published_data)enabled.add(r.id);else enabled.delete(r.id);
 }
 const version=crypto.createHash('sha256').update(JSON.stringify([...all.values()])+JSON.stringify([...enabled])).digest('hex').slice(0,24);
 return cache={all,enabled,version};
}
function save(id,value,expectedRevision){
 return db.transaction(()=>{
   const previous=row(id),original=baseById.get(id);
   if(!Number.isInteger(expectedRevision)||expectedRevision!==(previous?.revision||0))throw Object.assign(Error('다른 창에서 수정되었습니다. 다시 열어주세요.'),{status:409});
   if(!previous&&!original&&!/^custom_[a-f0-9-]{36}$/.test(id))throw Error('캐릭터 ID를 확인해주세요.');
   const data=materialize(id,validate(value)),revision=(previous?.revision||0)+1;
   sql.prepare('INSERT INTO character_definitions VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at').run(id,JSON.stringify(data),previous?.published_data||(original?JSON.stringify(original):null),previous?previous.enabled:(original?1:0),revision,previous?.published_revision||0,Date.now());
   cache=null;return detail(id);
 });
}
function publish(id,revision){return db.transaction(()=>{
 const r=row(id);if(!r)throw Error('먼저 초안을 저장해주세요.');
 if(revision!==r.revision)throw Object.assign(Error('초안이 변경되었습니다. 다시 열어주세요.'),{status:409});
 validate(editable(JSON.parse(r.data)));
 sql.prepare('UPDATE character_definitions SET published_data=data,published_revision=revision,enabled=1,updated_at=? WHERE id=?').run(Date.now(),id);cache=null;return detail(id);
});}
function pause(id){return db.transaction(()=>{
 const r=row(id),original=baseById.get(id);if(!r&&!original)throw Error('캐릭터를 찾을 수 없습니다.');
 if(r)sql.prepare('UPDATE character_definitions SET enabled=0,updated_at=? WHERE id=?').run(Date.now(),id);
 else sql.prepare('INSERT INTO character_definitions VALUES(?,?,?,0,0,0,?)').run(id,JSON.stringify(original),JSON.stringify(original),Date.now());
 cache=null;return detail(id);
});}
function list({q='',page=0,kind='all'}={}){
 const stored=new Map(sql.prepare('SELECT * FROM character_definitions').all().map(r=>[r.id,r])),ids=[...new Set([...baseById.keys(),...stored.keys()])];
 const items=ids.map(id=>{const r=stored.get(id),c=r?JSON.parse(r.data):baseById.get(id);return {id,name:c.name,gender:c.gender,age:c.age,job:c.job,avatar:c.avatar,source:baseById.has(id)?'builtin':'custom',revision:r?.revision||0,publishedRevision:r?.published_revision||0,enabled:r?Boolean(r.enabled):true,hasPublished:r?Boolean(r.published_data):true,updatedAt:r?.updated_at||0};}).filter(c=>(kind==='all'||c.source===kind)&&(c.id+' '+c.name+' '+c.job).includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 return {items:items.slice(page*24,page*24+24),total:items.length};
}
function assets(q=''){return fs.readdirSync(path.join(__dirname,'../../avatars')).filter(n=>/\.(jpg|jpeg|png|webp)$/.test(n)&&n.includes(q)).slice(0,80).map(n=>'avatars/'+n);}
module.exports={catalog,detail,list,save,publish,pause,assets,newId:()=> 'custom_'+crypto.randomUUID(),draft(id){const r=row(id);return r?{character:JSON.parse(r.data),revision:r.revision}:null;}};
