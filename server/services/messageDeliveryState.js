// Receipts, rather than an old browser snapshot, decide whether a user turn was answered.
const db=require('./dbService');
function normalize(userId,characterId,messages=[]){
 const answered=new Set();
 for(const m of messages)if(m.sender==='user'){
  let receipt=db.getChatRequest(userId,m.id);
  if(receipt?.batchRequestId)receipt=db.getChatRequest(userId,receipt.batchRequestId);
  if(!receipt?.success||!receipt.isAiGenerated)continue;
  const sameRoom=receipt.characterId===characterId||(!receipt.characterId&&db.sql.prepare('SELECT 1 FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(db.resolveUserId(userId),characterId,receipt.replyId));
  if(sameRoom)answered.add(m.id);
 }
 // A notice can be in a page whose originating user message is on an older page.
 for(const m of messages)if(m.sender==='system'&&m.requestId&&['generation_error','delivery_pending'].includes(m.systemKind)){
  let receipt=db.getChatRequest(userId,m.requestId);
  if(receipt?.batchRequestId)receipt=db.getChatRequest(userId,receipt.batchRequestId);
  if(receipt?.success&&receipt.isAiGenerated&&receipt.characterId===characterId)answered.add(m.requestId);
 }
 return messages.filter(m=>!(m.sender==='system'&&((['generation_error','delivery_pending'].includes(m.systemKind)&&answered.has(m.requestId))||(m.systemKind==='generation_error'&&m.requestKind==='proactive')))).map(m=>m.sender==='user'&&answered.has(m.id)?{...m,awaitingReply:false,failed:false,isFailed:false,failReason:null}:m);
}
module.exports={normalize};
