const db=require('./dbService');
const MIN_TURNS=10;
// Count completed user turns with this character, never greetings, gifts,
// failed sends, or repeated copies of the same message.
function completedTurns(userId,messages=[]){
 const seen=new Set();
 for(const m of messages){
  if(m.sender!=='user'||!m.id||m.giftName||m.giftKey||m.mediaType==='gift'||m.failed||m.isFailed||!m.text?.trim())continue;
  const receipt=db.getChatRequest(userId,m.id);
  if(receipt?.success===true&&!receipt.skipped)seen.add(m.id);
 }
 return seen.size;
}
module.exports={MIN_TURNS,completedTurns};
