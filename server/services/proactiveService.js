const crypto=require('node:crypto');
const db=require('./dbService'),store=require('./proactiveStore'),active=require('./generationLock');
const characters=require('./characterService'),llm=require('./llmService'),context=require('./conversationContext');
const {MIN_TURNS,completedTurns}=require('./contactEligibility');
const HOUR=3600000,DAY=24*HOUR;
function selected(characterId){return crypto.createHash('sha256').update('azit-first-contact-v1:'+characterId).digest().readUInt32BE(0)%100<5;}
function quiet(now){const hour=new Date(now+9*HOUR).getUTCHours();return hour<10||hour>=22;}
const MAX_AGE=210*DAY;
const BANDS=[[2,5],[6,14],[15,45],[46,90],[91,180]];
const number=seed=>crypto.createHash('sha256').update(seed).digest().readUInt32BE(0);
function profile(characterId){
 const n=number('azit-reconnect-character-v2:'+characterId)%100;
 return BANDS[n<25?0:n<50?1:n<75?2:n<90?3:4];
}
function delayFor(userId,characterId,sourceId){
 const [min,max]=profile(characterId),fraction=number('azit-reconnect-cycle-v2:'+userId+':'+characterId+':'+sourceId)/0x100000000;
 return Math.round((min+(max-min)*fraction)*DAY);
}
function roomState(id,characterId){
 const user=db.getUser(id),room=user?.savedRooms?.[characterId],messages=room?.messages||[];
 const genuine=m=>m.sender==='user'&&!m.giftName&&!m.failed&&!m.isFailed&&db.getChatRequest(id,m.id)?.success!==false;
 const users=messages.filter(genuine),lastUser=users.at(-1),last=messages.at(-1),at=messages.findLastIndex(m=>m.id===lastUser?.id);
 const alreadySent=at>=0&&messages.slice(at+1).some(m=>m.sender==='ai'&&(m.followUpType==='reconnect'||String(m.id).startsWith('reply_contact_')));
 const closed=last?.sender==='ai'&&db.getChatRequest(id,String(last.id).replace(/^reply_/,''))?.roomLeft;
 return {user,room,messages,lastUser,last,alreadySent,closed,userCount:completedTurns(id,messages)};
}
function schedule(id,characterId,now=Date.now()){
 id=db.resolveUserId(id);
 const r=roomState(id,characterId);
 if(!r.room||!characters.isPublished(characterId)||!selected(characterId)||!store.preferences(id).enabled||r.alreadySent||r.closed||r.userCount<MIN_TURNS||r.last?.sender!=='ai'||!r.lastUser)return false;
 const at=Number(r.lastUser.createdAt);
 if(!Number.isFinite(at)||at<=0||now-at>MAX_AGE)return false;
 // Anchor to a real user turn. Idle replies, room entry and restarts never rearm it.
 const due=at+delayFor(id,characterId,r.lastUser.id);
 db.sql.prepare(`INSERT INTO proactive_jobs VALUES(?,?,?,?, 'pending',0,0) ON CONFLICT(user_id,character_id) DO UPDATE SET source_id=excluded.source_id,due_at=excluded.due_at,status='pending',attempts=0,lease_until=0 WHERE proactive_jobs.source_id!=excluded.source_id`).run(id,characterId,r.lastUser.id,due);
 return true;
}
function eligible(job,now){
 const r=roomState(job.user_id,job.character_id),prefs=store.preferences(job.user_id);
 return Boolean(require('./legalService').accepted(r.user)&&characters.isPublished(job.character_id)&&selected(job.character_id)&&prefs.enabled&&r.room&&!r.room.roomLeft&&!r.closed&&!r.alreadySent&&r.last?.sender==='ai'&&r.lastUser?.id===job.source_id&&r.userCount>=MIN_TURNS&&now>=job.due_at&&now-(r.lastUser.createdAt||now)>=2*DAY&&now-(r.lastUser.createdAt||0)<=MAX_AGE&&now-prefs.last_seen>=10*60000&&now-prefs.last_sent>=3*DAY);
}
let backlogKey='',backlogQuery,backlogOffset=0;
function backlog(now){
 const ids=characters.getAllCharacters().filter(c=>selected(c.id)).map(c=>c.id),key=ids.join(',');
 if(!ids.length)return [];
 if(key!==backlogKey){backlogKey=key;backlogOffset=0;backlogQuery=db.sql.prepare(`SELECT user_id,character_id FROM conversation_state WHERE data IS NOT NULL AND updated_at>? AND character_id IN (${ids.map(()=>'?').join(',')}) AND NOT EXISTS(SELECT 1 FROM proactive_jobs j WHERE j.user_id=conversation_state.user_id AND j.character_id=conversation_state.character_id) LIMIT 100 OFFSET ?`);}
 const rows=backlogQuery.all(now-MAX_AGE,...ids,backlogOffset);backlogOffset=rows.length===100?backlogOffset+100:0;return rows;
}
function migrateLegacy(){
 // Earlier jobs were tied to an AI reply and a 6–18 hour delay. Replan only
 // pending cycles; preserve sent/skipped/failed cycles and all dialogue history.
 const rows=db.sql.prepare(`SELECT j.user_id,j.character_id FROM proactive_jobs j WHERE j.status='pending' AND EXISTS(SELECT 1 FROM conversation_messages m WHERE m.user_id=j.user_id AND m.character_id=j.character_id AND m.message_id=j.source_id AND json_extract(m.data,'$.sender')='ai') LIMIT 100`).all();
 for(const row of rows)schedule(row.user_id,row.character_id);
}
async function processJob(job,now=Date.now()){
 if(quiet(now)||now<job.due_at||active.has(job.user_id))return false;
 if(!eligible(job,now)){
   const r=roomState(job.user_id,job.character_id);
   const obsolete=r.userCount<MIN_TURNS||!store.preferences(job.user_id).enabled||!r.room||r.closed||r.alreadySent||r.lastUser?.id!==job.source_id||!r.lastUser||now-(r.lastUser.createdAt||0)>MAX_AGE||!characters.isPublished(job.character_id);
   db.sql.prepare("UPDATE proactive_jobs SET status=?,due_at=? WHERE user_id=? AND character_id=? AND status='pending'").run(obsolete?'cancelled':'pending',now+HOUR,job.user_id,job.character_id);return false;
 }
 const claimed=db.sql.prepare("UPDATE proactive_jobs SET status='generating',lease_until=?,attempts=attempts+1 WHERE user_id=? AND character_id=? AND source_id=? AND status='pending' AND due_at<=?").run(now+120000,job.user_id,job.character_id,job.source_id,now);
 if(!claimed.changes)return false;
 active.add(job.user_id);
 try{
   const user=db.getUser(job.user_id),character=characters.getCharacterById(job.character_id);
   if(!character)throw Error('CHARACTER_MISSING');
   const room=user.savedRooms[job.character_id],stored=db.getConversationState(user.id,character.id);
   const agreementSources=await db.getConversationSources(user.id,character.id,(stored.memory?.agreements||[]).map(n=>n.sourceId));
   const relationship=require('./relationshipContext').buildRelationshipContext(character,[...agreementSources,...room.messages]);
   const history=room.messages.filter(m=>['user','ai'].includes(m.sender)&&m.text).map(m=>({id:m.id,role:m.sender==='user'?'user':'assistant',content:m.text,createdAt:m.createdAt}));
   const requestId='contact_'+crypto.randomUUID(),replyId='reply_'+requestId;
   const elapsedDays=Math.floor((now-(roomState(user.id,character.id).lastUser?.createdAt||now))/DAY);
   const instruction={id:requestId,role:'user',content:`서버 요청: 마지막 사용자 대화에서 약 ${elapsedDays}일이 지난 뒤 문득 생각나서 한 번 연락하는 상황입니다. 사용자의 새 발화가 아닙니다. 지난 실제 대화의 구체적인 기억·공통 관심사 하나와 캐릭터의 성격·호칭·거리감을 바탕으로 짧고 자연스러운 연락을 쓰세요. 매번 '생각나서 연락했어' 같은 동일한 도입부를 쓰지 마세요. 당시의 감정이나 사건이 지금도 그대로라고 단정하거나 오래전 일정을 아직 예정된 일처럼 묻지 마세요. 답장을 재촉하거나 왜 답이 없냐고 묻거나 죄책감을 주거나 계속 기다렸다고 하지 마세요. 사용자의 최근 근황·건강·생활을 관찰했다고 지어내지 마세요. 연락을 원하지 않았거나 대화가 끝났거나 적절한 소재가 없으면 roomLeft:true로 표시하고 발송을 생략하세요.`,createdAt:now};
   const conversation=context.prepare([...history,instruction],stored.memory,{kind:'proactive',replyId,speechRegister:relationship.speechRegister,bankNotes:db.getConversationNotes(user.id,character.id),stateHistory:db.getConversationStateHistory(user.id,character.id)});
   conversation.wellbeing=require('./wellbeingService').context(user.id,character.id);
   const result=await llm.generateReply(character,[...history,instruction],{verifiedAdult:require('./contentAccess').verifiedAdult(user),conversation,relationship});
   if(!result.isAiGenerated||!result.text?.trim())throw Error('LLM_INVALID_TURN');
   return db.transaction(()=>{
     require('./wellbeingService').assertCurrent(user.id,character.id,conversation.wellbeing);
     const current=db.sql.prepare('SELECT * FROM proactive_jobs WHERE user_id=? AND character_id=?').get(user.id,character.id);
     if(!current||current.status!=='generating'||current.source_id!==job.source_id||!eligible(job,Date.now())||quiet(Date.now()))throw Error('CONVERSATION_CHANGED');
     if(require('./contentAccess').verifiedAdult(user)&&!require('./contentAccess').verifiedAdult(db.getUser(user.id)))throw Error('CONVERSATION_CHANGED');
     if(result.roomLeft){db.sql.prepare("UPDATE proactive_jobs SET status='skipped' WHERE user_id=? AND character_id=?").run(user.id,character.id);return false;}
     const message={id:replyId,sender:'ai',text:result.text,createdAt:Date.now(),time:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}),unread:true,proactive:true,followUpType:'reconnect'};
     const updated=db.appendMessages(user.id,character.id,[message]);
     const rooms=updated.savedRooms;rooms[character.id].unreadCount=(rooms[character.id].unreadCount||0)+1;db.updateUser(user.id,{savedRooms:rooms});
     db.saveConversationState(user.id,character.id,result.memory,replyId,stored.revision);
     db.sql.prepare("UPDATE proactive_jobs SET status='sent',lease_until=0 WHERE user_id=? AND character_id=?").run(user.id,character.id);
     db.sql.prepare('INSERT INTO contact_preferences(user_id,last_sent) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_sent=excluded.last_sent').run(user.id,Date.now());
     db.sql.prepare('INSERT INTO proactive_deliveries(user_id,character_id,message_id,created_at) VALUES(?,?,?,?)').run(user.id,character.id,replyId,Date.now());
     // No debit, fake user utterance, or synthetic dialogue is ever persisted.
     return true;
   });
 }catch(error){
   require('./safetyMonitoring').record(job.user_id,job.character_id,job.source_id,'proactive',error);
   db.sql.prepare("UPDATE proactive_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,due_at=?,lease_until=0 WHERE user_id=? AND character_id=? AND source_id=? AND status='generating'").run(Date.now()+6*HOUR,job.user_id,job.character_id,job.source_id);
   console.warn('[proactive] generation deferred',error.name||'Error');return false;
 }finally{active.delete(job.user_id);}
}
let busy=false;
async function tick(){
 if(busy)return;busy=true;
 try{
   const now=Date.now();
   db.sql.prepare("UPDATE proactive_jobs SET status='pending' WHERE status='generating' AND lease_until<?").run(now);
   if(!quiet(now)){
     migrateLegacy();
     // Backfill meaningful conversations, including older remembered rooms.
     const rows=backlog(now);
     for(const row of rows)if(selected(row.character_id))schedule(row.user_id,row.character_id,now);
     for(const job of db.sql.prepare("SELECT * FROM proactive_jobs WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 3").all(now))await processJob(job);
   }
   await require('./pushService').deliverPending();
 }finally{busy=false;}
}
function start(){const timer=setInterval(()=>tick().catch(()=>console.warn('[proactive] worker retry scheduled')),60000);timer.unref();return()=>clearInterval(timer);}
module.exports={selected,quiet,profile,delayFor,schedule,eligible,processJob,tick,start};
