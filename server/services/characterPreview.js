const crypto=require('node:crypto'),db=require('./dbService'),registry=require('./characterRegistry'),llm=require('./llmService'),context=require('./conversationContext'),relationship=require('./relationshipContext');
const active=new Set();
async function send(characterId,{sessionId,message},actor='operator'){
 if(active.has(actor))throw Object.assign(Error('캐릭터 테스트 답변을 생성 중입니다.'),{status:409});
 const draft=registry.draft(characterId);if(!draft)throw Object.assign(Error('초안을 먼저 저장해주세요.'),{status:400});
 if(message!==undefined&&(typeof message!=='string'||!message.trim()||message.length>2000))throw Object.assign(Error('테스트 메시지는 1~2,000자입니다.'),{status:400});
 const now=Date.now();db.sql.prepare('DELETE FROM character_previews WHERE expires_at<?').run(now);
 let session=sessionId?db.sql.prepare('SELECT * FROM character_previews WHERE id=? AND character_id=?').get(sessionId,characterId):null;
 if(sessionId&&!session)throw Object.assign(Error('테스트가 만료되었습니다. 새 대화를 시작해주세요.'),{status:404});
 if(session&&session.revision!==draft.revision)throw Object.assign(Error('설정이 변경되었습니다. 새 테스트 대화를 시작해주세요.'),{status:409});
 if(!session){session={id:crypto.randomUUID(),revision:draft.revision,data:JSON.stringify({messages:[],memory:null})};db.sql.prepare('INSERT INTO character_previews VALUES(?,?,?,?,?)').run(session.id,characterId,draft.revision,session.data,now+2*3600000);}
 const data=JSON.parse(session.data),greeting=data.messages.length===0&&!message;
 if(!greeting&&!message)throw Object.assign(Error('메시지를 입력해주세요.'),{status:400});
 if(data.messages.filter(m=>m.role==='user').length>=20)throw Object.assign(Error('한 테스트에서 20회까지 대화할 수 있습니다. 새 대화를 시작해주세요.'),{status:400});
 const id='preview_'+crypto.randomUUID(),replyId='reply_'+id;
 const input={id,role:'user',content:greeting?'서버 요청: 아직 말하지 않은 낯선 상대에게 작성자가 설정한 방식으로 첫 메시지를 보내세요.':message.trim(),createdAt:now};
 const rel=relationship.buildRelationshipContext(draft.character,[...data.messages,...(greeting?[]:[input])]);
 const conversation=context.prepare([...data.messages,input],data.memory,{kind:greeting?'greeting':'chat',replyId,speechRegister:rel.speechRegister});
 active.add(actor);
 try{
   const result=await llm.generateReply(draft.character,[...data.messages,input],{greeting,relationship:rel,conversation});
   if(!result.isAiGenerated||!result.text?.trim()||!result.memory)throw Error('LLM_INVALID_TURN');
   const current=registry.draft(characterId);if(!current||current.revision!==draft.revision)throw Object.assign(Error('생성 중 설정이 변경되었습니다. 새 테스트를 시작해주세요.'),{status:409});
   if(!greeting)data.messages.push(input);
   data.messages.push({id:replyId,role:'assistant',content:result.text,createdAt:Date.now()});data.memory=result.memory;
   db.sql.prepare('UPDATE character_previews SET data=?,expires_at=? WHERE id=?').run(JSON.stringify(data),Date.now()+2*3600000,session.id);
   return {sessionId:session.id,revision:draft.revision,reply:result.text,replyId,roomLeft:result.roomLeft,isAiGenerated:true,costDeducted:0};
 }catch(error){throw Object.assign(Error(error.status?error.message:'문제가 발생했습니다. 잠시 후에 다시 시도해주세요.'),{status:error.status||503,sessionId:session.id});}
 finally{active.delete(actor);}
}
module.exports={send};
