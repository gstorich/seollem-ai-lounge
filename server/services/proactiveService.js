const crypto=require('node:crypto');
const db=require('./dbService'),store=require('./proactiveStore'),active=require('./generationLock');
const characters=require('./characterService'),llm=require('./llmService'),context=require('./conversationContext');
const HOUR=3600000,DAY=24*HOUR;
function selected(characterId){return crypto.createHash('sha256').update('azit-first-contact-v1:'+characterId).digest().readUInt32BE(0)%100<5;}
function quiet(now){const hour=new Date(now+9*HOUR).getUTCHours();return hour<10||hour>=22;}
const contactIds=characters.getAllCharacters().filter(c=>selected(c.id)).map(c=>c.id);
const backlog=db.sql.prepare(`SELECT user_id,character_id FROM conversation_state WHERE data IS NOT NULL AND updated_at>? AND character_id IN (${contactIds.map(()=>'?').join(',')}) AND NOT EXISTS(SELECT 1 FROM proactive_jobs j WHERE j.user_id=conversation_state.user_id AND j.character_id=conversation_state.character_id) LIMIT 100`);
function schedule(id,characterId,now=Date.now()){
 id=db.resolveUserId(id);
 const user=db.getUser(id),room=user?.savedRooms?.[characterId];
 if(!room||!characters.isPublished(characterId)||!selected(characterId)||!store.preferences(id).enabled)return false;
 // Only genuine completed conversations can lead to a follow-up.
 const messages=room.messages||[],last=messages.at(-1);
 if(messages.filter(m=>m.sender==='user'&&!m.giftName).length<4||last?.sender!=='ai')return false;
 const lastUser=messages.findLast(m=>m.sender==='user');
 if(!lastUser)return false;
 const offset=crypto.createHash('sha256').update(id+':'+characterId+':'+lastUser.id).digest().readUInt32BE(0)%(12*HOUR);
 db.sql.prepare(`INSERT INTO proactive_jobs VALUES(?,?,?,?, 'pending',0,0) ON CONFLICT(user_id,character_id) DO UPDATE SET source_id=excluded.source_id,due_at=excluded.due_at,status='pending',attempts=0,lease_until=0 WHERE proactive_jobs.source_id!=excluded.source_id`).run(id,characterId,last.id,Math.max(now,last.createdAt||now)+6*HOUR+offset);
 return true;
}
function eligible(job,now){
 const user=db.getUser(job.user_id),room=user?.savedRooms?.[job.character_id],prefs=store.preferences(job.user_id);
 const messages=room?.messages||[],last=messages.at(-1),lastUser=messages.findLast(m=>m.sender==='user');
 return Boolean(require('./legalService').accepted(user)&&characters.isPublished(job.character_id)&&selected(job.character_id)&&prefs.enabled&&room&&!room.roomLeft&&last?.id===job.source_id&&last.sender==='ai'&&!last.proactive&&lastUser&&now-(lastUser.createdAt||now)>=6*HOUR&&now-(lastUser.createdAt||0)<=7*DAY&&now-prefs.last_seen>=10*60000&&now-prefs.last_sent>=3*DAY&&messages.filter(m=>m.sender==='user').length>=4);
}
async function processJob(job,now=Date.now()){
 if(quiet(now)||active.has(job.user_id))return false;
 if(!eligible(job,now)){
   const room=db.getUser(job.user_id)?.savedRooms?.[job.character_id],last=room?.messages?.at(-1),lastUser=room?.messages?.findLast(m=>m.sender==='user');
   const obsolete=!store.preferences(job.user_id).enabled||!room||last?.id!==job.source_id||last?.proactive||!lastUser||now-(lastUser.createdAt||0)>7*DAY;
   db.sql.prepare("UPDATE proactive_jobs SET status=?,due_at=? WHERE user_id=? AND character_id=? AND status='pending'").run(obsolete?'cancelled':'pending',now+HOUR,job.user_id,job.character_id);return false;
 }
 const claimed=db.sql.prepare("UPDATE proactive_jobs SET status='generating',lease_until=?,attempts=attempts+1 WHERE user_id=? AND character_id=? AND source_id=? AND status='pending'").run(now+120000,job.user_id,job.character_id,job.source_id);
 if(!claimed.changes)return false;
 active.add(job.user_id);
 try{
   const user=db.getUser(job.user_id),character=characters.getCharacterById(job.character_id);
   if(!character)throw Error('CHARACTER_MISSING');
   const room=user.savedRooms[job.character_id],stored=db.getConversationState(user.id,character.id);
   const agreementSources=db.getConversationSources(user.id,character.id,(stored.memory?.agreements||[]).map(n=>n.sourceId));
   const relationship=require('./relationshipContext').buildRelationshipContext(character,[...agreementSources,...room.messages]);
   const history=room.messages.filter(m=>['user','ai'].includes(m.sender)&&m.text).map(m=>({id:m.id,role:m.sender==='user'?'user':'assistant',content:m.text,createdAt:m.createdAt}));
   const requestId='contact_'+crypto.randomUUID(),replyId='reply_'+requestId;
   const instruction={id:requestId,role:'user',content:'서버 요청: 지난 대화를 참고해 캐릭터가 드물게 먼저 연락합니다. 사용자가 새로 말한 것이 아닙니다. 이전 대화에서 이어갈 소재로 자연스럽고 짧은 메시지를 보내세요. 연락을 원하지 않거나 적절하지 않으면 roomLeft:true로 표시하세요.',createdAt:now};
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
     const message={id:replyId,sender:'ai',text:result.text,createdAt:Date.now(),time:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}),unread:true,proactive:true};
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
     // Backfill existing rooms, bounded to recently active server-owned state.
     const rows=backlog.all(now-7*DAY,...contactIds);
     for(const row of rows)if(selected(row.character_id))schedule(row.user_id,row.character_id,now);
     for(const job of db.sql.prepare("SELECT * FROM proactive_jobs WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 3").all(now))await processJob(job);
   }
   await require('./pushService').deliverPending();
 }finally{busy=false;}
}
function start(){const timer=setInterval(()=>tick().catch(()=>console.warn('[proactive] worker retry scheduled')),60000);timer.unref();return()=>clearInterval(timer);}
module.exports={selected,quiet,schedule,eligible,processJob,tick,start};
