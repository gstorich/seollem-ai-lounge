const {DatabaseSync}=require('node:sqlite');
const config=require('../config');
const characters=require('./characterService');
const sql=new DatabaseSync(config.sqliteFile);sql.exec('PRAGMA busy_timeout=5000');
const catalog=new Map(characters.getAllCharacters().map(c=>[c.id,{...c,...characters.getCharacterById(c.id)}]));
const topics=[
 ['일상·안부',/오늘|하루|주말|아침|저녁|퇴근|출근|일상|안녕/],
 ['위로·고민',/힘들|힘든|고민|외로|외롭|위로|우울|스트레스|지쳤|속상|피곤/],
 ['연애·설렘',/설레|설렘|(?:너|당신|오빠|누나|그쪽)(?:를|가)?\s*좋아|사랑|보고 싶|보고싶|데이트|연애|다정|두근/],
 ['친밀한 대화',/스킨십|입맞춤|키스|안아|포옹|잠옷|침대/],
 ['취미·여행',/취미|여행|산책|운동|등산|영화|음악|독서|게임|골프/],
 ['음식·술',/맛집|음식|커피|카페|맥주|와인|술|저녁밥|점심|요리/],
 ['일·가족',/직장|회사|사업|업무|상사|가족|아이|자녀|결혼|이혼/]
];
function tags(text){return topics.filter(([,pattern])=>pattern.test(text)).map(([label])=>label);}
function scope(kind='all',days=0,userId=''){
 const clauses=['u.id=m.user_id'],args=[];
 if(kind==='members')clauses.push('u.phone IS NOT NULL');
 if(kind==='guests')clauses.push('u.phone IS NULL');
 if(days){clauses.push('m.created_at>=?');args.push(Date.now()-days*86400000);}
 if(userId){clauses.push('u.id=?');args.push(userId);}
 return {where:clauses.join(' AND '),args};
}
function rooms({kind='all',days=0,userId='',q='',page=0,characterId=''}={}){
 const {where,args}=scope(kind,days,userId);
 const query=q.trim();
 const foundCharacters=query?[...catalog.values()].filter(c=>(c.name+' '+c.job).includes(query)).map(c=>c.id):[];
 const filters=[where];
 if(characterId){filters.push('m.character_id=?');args.push(characterId);}
 if(query){filters.push(`(u.id LIKE ? OR u.phone LIKE ? OR m.character_id IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM conversation_messages s WHERE s.user_id=m.user_id AND s.character_id=m.character_id AND json_extract(s.data,'$.text') LIKE ?))`);args.push('%'+query+'%','%'+query+'%',JSON.stringify(foundCharacters),'%'+query+'%');}
 const grouped=`SELECT m.user_id,u.phone,m.character_id,count(*) messageCount,sum(json_extract(m.data,'$.sender')='user') userTurns,min(m.created_at) firstAt,max(m.created_at) lastAt FROM conversation_messages m JOIN users u ON u.id=m.user_id WHERE ${filters.join(' AND ')} GROUP BY m.user_id,m.character_id`;
 const total=sql.prepare(`SELECT count(*) n FROM (${grouped})`).get(...args).n;
 const items=sql.prepare(grouped+' ORDER BY lastAt DESC,m.user_id,m.character_id LIMIT 30 OFFSET ?').all(...args,page*30).map(row=>{
  const last=sql.prepare("SELECT data FROM conversation_messages WHERE user_id=? AND character_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(row.user_id,row.character_id);
  const c=catalog.get(row.character_id);
  return {...row,characterName:c?.name||row.character_id,gender:c?.gender||'female',scenario:c?.conceptTitle||'미분류',preview:JSON.parse(last.data).text||''};
 });
 return {items,total};
}
function transcript(userId,characterId,page=0){
 if(!sql.prepare('SELECT 1 FROM users WHERE id=?').get(userId))return null;
 const total=sql.prepare('SELECT count(*) n FROM conversation_messages WHERE user_id=? AND character_id=?').get(userId,characterId).n;
 const c=catalog.get(characterId);
 return {userId,characterId,characterName:c?.name||characterId,scenario:c?.conceptTitle||'미분류',total,page,
 messages:sql.prepare('SELECT data,created_at FROM conversation_messages WHERE user_id=? AND character_id=? ORDER BY created_at,rowid LIMIT 100 OFFSET ?').all(userId,characterId,page*100).map(row=>({...JSON.parse(row.data),createdAt:row.created_at}))};
}
function insights(kind='all',days=30){
 const {where,args}=scope(kind,days);
 const rows=sql.prepare(`SELECT m.user_id,m.character_id,m.created_at,json_extract(m.data,'$.text') text FROM conversation_messages m JOIN users u ON u.id=m.user_id WHERE ${where} AND json_extract(m.data,'$.sender')='user' ORDER BY m.created_at DESC,m.rowid DESC LIMIT 50000`).all(...args);
 const total=sql.prepare(`SELECT count(*) n FROM conversation_messages m JOIN users u ON u.id=m.user_id WHERE ${where} AND json_extract(m.data,'$.sender')='user'`).get(...args).n;
 const ranks=new Map(),scenarios=new Map(),topicRanks=new Map(),flows=new Map(),users=new Set(),roomSet=new Set();
 function add(map,key,label,row){let r=map.get(key);if(!r){r={key,label,turns:0,users:new Set(),rooms:new Map()};map.set(key,r);}r.turns++;r.users.add(row.user_id);const roomKey=JSON.stringify([row.user_id,row.character_id]);if(!r.rooms.has(roomKey))r.rooms.set(roomKey,new Set());r.rooms.get(roomKey).add(new Date(row.created_at+9*3600000).toISOString().slice(0,10));return r;}
 for(const row of rows){
  const c=catalog.get(row.character_id);users.add(row.user_id);roomSet.add(JSON.stringify([row.user_id,row.character_id]));
  const rank=add(ranks,row.character_id,c?.name||row.character_id,row);rank.gender=c?.gender||'female';rank.scenario=c?.conceptTitle||'미분류';
  add(scenarios,c?.conceptTitle||'미분류',c?.conceptTitle||'미분류',row);
  const matched=tags(row.text||'');for(const label of matched.length?matched:['기타·미분류'])add(topicRanks,label,label,row);
 }
 const previousTopics=new Map(),priority=['친밀한 대화','연애·설렘','위로·고민','일·가족','취미·여행','음식·술','일상·안부'];
 for(const row of [...rows].reverse()){
  const matched=tags(row.text||''),topic=priority.find(label=>matched.includes(label));if(!topic)continue;
  const roomKey=JSON.stringify([row.user_id,row.character_id]),prev=previousTopics.get(roomKey);
  if(prev&&prev!==topic)add(flows,prev+' → '+topic,prev+' → '+topic,row);
  previousTopics.set(roomKey,topic);
 }
 function result(map){return [...map.values()].map(r=>({...r,users:r.users.size,rooms:r.rooms.size,returnRooms:[...r.rooms.values()].filter(d=>d.size>1).length,averageTurns:Math.round(r.turns/r.rooms.size*10)/10})).sort((a,b)=>b.turns-a.turns||b.users-a.users);}
 return {kind,days,totalTurns:total,analyzedTurns:rows.length,truncated:rows.length<total,activeUsers:users.size,activeRooms:roomSet.size,characters:result(ranks),scenarios:result(scenarios),topics:result(topicRanks),flows:result(flows),method:'사용자가 보낸 메시지 기준. 주제는 서버 내 키워드 분류이며 중복 집계될 수 있습니다. 시나리오는 캐릭터 설정 기준입니다. 재방문 대화방은 서로 다른 한국 날짜에 메시지를 보낸 방입니다. 호감도·만족도를 직접 측정한 결과가 아닙니다.'};
}
module.exports={rooms,transcript,insights,tags};
