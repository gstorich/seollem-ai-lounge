const db=require('./dbService');
function close(userId,character,replyId,at=Date.now()){
 return db.transaction(()=>{
  const notice={id:'system_left_'+replyId,sender:'system',systemKind:'partner_left',text:character.name+'님이 대화방을 나갔습니다.',createdAt:at+1};
  const user=db.appendMessages(userId,character.id,[notice]);
  const room=user.savedRooms[character.id];
  room.roomLeft=true;room.partnerLeftAt=notice.createdAt;room.partnerLeftReplyId=replyId;
  db.updateUser(userId,{savedRooms:user.savedRooms});
  require('./proactiveStore').cancelRoom(userId,character.id);
  return notice;
 });
}
function failure(userId,characterId,requestId,kind,result){
 const existed=Boolean(db.getUser(userId)?.savedRooms?.[characterId]);
 const notice={id:'system_error_'+requestId,sender:'system',systemKind:result.error==='AI_GENERATION_FAILED'?'generation_error':'content_notice',text:result.message,errorCode:result.error,requestId,requestKind:kind,createdAt:Date.now()};
 const user=db.appendMessages(userId,characterId,[notice]);
 if(!existed){user.savedRooms[characterId].firstMetAt=notice.createdAt;db.updateUser(userId,{savedRooms:user.savedRooms});}
 return notice;
}
// Recover notices for previously closed, still-saved rooms. Never resurrect a
// room the user deleted. Running twice cannot create duplicate notices.
function repair(){
 const rows=db.sql.prepare(`SELECT m.user_id,m.character_id,m.message_id,m.created_at,u.data user_data FROM conversation_messages m
  JOIN chat_requests r ON r.user_id=m.user_id AND json_extract(r.data,'$.replyId')=m.message_id
  JOIN users u ON u.id=m.user_id
  WHERE json_extract(r.data,'$.roomLeft')=1 AND json_extract(r.data,'$.success')=1
  AND NOT EXISTS(SELECT 1 FROM conversation_messages newer WHERE newer.user_id=m.user_id AND newer.character_id=m.character_id AND json_extract(newer.data,'$.sender')='ai' AND (newer.created_at>m.created_at OR (newer.created_at=m.created_at AND newer.rowid>m.rowid)))`).all();
 let repaired=0;
 for(const row of rows){
  const room=JSON.parse(row.user_data).savedRooms?.[row.character_id];if(!room||(room.firstMetAt||0)>row.created_at)continue;
  if(room.roomLeft&&db.sql.prepare('SELECT 1 FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(row.user_id,row.character_id,'system_left_'+row.message_id))continue;
  const character=require('./characterService').getCharacterById(row.character_id)||{id:row.character_id,name:'상대방'};
  close(row.user_id,character,row.message_id,row.created_at);repaired++;
 }
 return repaired;
}
module.exports={close,failure,repair};
