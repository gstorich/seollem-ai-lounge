const crypto=require('node:crypto');
const db=require('./dbService');
const {MIN_TURNS,completedTurns}=require('./contactEligibility');
const MIN_DELAY=45000,MAX_COUNT=2;
function state(userId,characterId,now=Date.now()){
 const user=db.getUser(userId),messages=user?.savedRooms?.[characterId]?.messages||[];
 let index=-1;
 for(let i=messages.length-1;i>=0;i--)if(messages[i].sender==='user'&&!messages[i].failed&&!messages[i].isFailed){const receipt=db.getChatRequest(userId,messages[i].id);if(receipt?.success){index=i;break;}}
 const lastUser=messages[index],last=messages.at(-1);
 const count=index<0?0:messages.slice(index+1).filter(m=>m.sender==='ai'&&(/^(?:idle_followup_|reply_idle_)/.test(m.id||'')||m.followUpType==='idle')).length;
 const enabled=Boolean(require('./proactiveStore').preferences(userId).enabled);
 const userTurns=completedTurns(userId,messages);
 const eligible=Boolean(userTurns>=MIN_TURNS&&enabled&&lastUser&&last?.sender==='ai'&&now-(last.createdAt||now)>=MIN_DELAY&&count<MAX_COUNT);
 return {eligible,count,userTurns,userMessageId:lastUser?.id,lastReplyId:last?.id,requestId:lastUser?'idle_'+crypto.createHash('sha256').update(userId+':'+characterId+':'+lastUser.id+':'+count).digest('hex').slice(0,48):null};
}
function assertCurrent(userId,characterId,expected){const current=state(userId,characterId);if(!current.eligible||current.userMessageId!==expected.userMessageId||current.lastReplyId!==expected.lastReplyId||current.count!==expected.count)throw Error('CONVERSATION_CHANGED');}
module.exports={state,assertCurrent};
