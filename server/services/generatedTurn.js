const crypto = require('node:crypto');
const db = require('./dbService');
const llm = require('./llmService');
const config = require('../config');
const active = require('./generationLock');
const FAILURE = '문제가 발생했습니다. 잠시 후에 다시 시도해주세요.';

// A pending request records intent, never a charge. Reply + debit + replay result
// commit together only after an actual provider response has been validated.
module.exports = async function generatedTurn(req, res, {character, message, requestId, kind, cost, userMessage}) {
  const id = req.user.id;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({kind,characterId:character.id,message})).digest('hex');
  const previous = db.getChatRequest(id, requestId);
  if (previous?.fingerprint && previous.fingerprint !== fingerprint) return res.status(409).json({success:false,error:'REQUEST_CONFLICT',message:'다른 메시지에 사용한 요청입니다.'});
  if (previous?.success) {
    if(previous.contentAudience!=='general'&&!require('./contentAccess').verifiedAdult(db.getUser(id)))return res.status(403).json({success:false,error:'ADULT_VERIFICATION_REQUIRED',message:'성인인증 상태를 확인해주세요. 인증 전에는 일반 대화만 가능합니다.',costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if (!previous.isAiGenerated) return res.status(503).json({success:false,error:'AI_GENERATION_FAILED',message:FAILURE,costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    return res.json({...previous,heartsRemaining:db.getUser(id).hearts});
  }
  if (active.has(id)) return res.status(409).json({success:false,error:'GENERATION_PENDING',message:'답변을 생성 중입니다. 잠시 기다려주세요.'});
  // Recover abandoned pending work after process restart; no charge was made.
  const user = db.getUser(id);
  const required = kind === 'greeting' ? config.heartsPerMessage : cost;
  if (!user || (!user.isVipUnlimited && user.hearts < required)) return res.status(402).json({success:false,error:'INSUFFICIENT_HEARTS',message:'하트가 부족합니다.',costDeducted:0});
  active.add(id);
  try {
    const oldMessages = user.savedRooms?.[character.id]?.messages || [];
    const storedState = db.getConversationState(id,character.id);
    const agreementSources=db.getConversationSources(id,character.id,(storedState.memory?.agreements||[]).map(note=>note.sourceId));
    const relationship = require('./relationshipContext').buildRelationshipContext(character,[...agreementSources,...oldMessages,...(userMessage?[{sender:'user',text:message}]:[])]);
    const history = oldMessages.filter(m => {
      if (!['user','ai'].includes(m.sender) || !m.text || m.id === requestId) return false;
      if (m.sender === 'user') {
        const reqRecord = db.getChatRequest(id, m.id);
        if (reqRecord && reqRecord.success === false) return false;
      }
      return true;
    }).map(m=>({id:m.id,role:m.sender==='user'?'user':'assistant',content:m.text,createdAt:m.createdAt}));
    const conversation = require('./conversationContext').prepare([...history,{id:requestId,role:'user',content:message,createdAt:Date.now()}],storedState.memory,{replyId:'reply_'+requestId,kind,speechRegister:relationship.speechRegister,bankNotes:db.getConversationNotes(id,character.id),stateHistory:db.getConversationStateHistory(id,character.id)});
    db.transaction(()=>{
      db.saveChatRequest(id,requestId,{status:'pending',fingerprint,createdAt:Date.now()});
    });
    const result = await llm.generateReply(character,[...history,{role:'user',content:message}],{verifiedAdult:require('./contentAccess').verifiedAdult(user),relationship,conversation,...(kind==='greeting'?{greeting:true}:{})});
    if (!result.isAiGenerated || !result.text?.trim()) throw Error('Invalid generated reply');
    const response = db.transaction(()=>{
      if(require('./contentAccess').verifiedAdult(user)&&!require('./contentAccess').verifiedAdult(db.getUser(id)))throw Object.assign(Error('ADULT_VERIFICATION_REQUIRED'),{accessBlocked:true});
      if(!require('./legalService').accepted(db.getUser(id)))throw Object.assign(Error('LLM_CONSENT_CHANGED'),{accessBlocked:true});
      const charged = cost > 0 ? db.debit(id,cost,kind==='gift'?'gift:'+userMessage.giftKey:'chat') : db.getUser(id);
      if (!charged) { const error=Error('Insufficient balance after generation');error.code='INSUFFICIENT_HEARTS';throw error; }
      const replyId='reply_'+requestId;
      const userMsgToAppend = userMessage ? [{...userMessage,id:requestId,sender:'user',text:message,createdAt:Date.now()}] : [];
      const current=db.appendMessages(id,character.id,[...userMsgToAppend,{id:replyId,sender:'ai',text:result.text,createdAt:Date.now(),time:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'})}]);
      db.saveConversationState(id,character.id,result.memory,replyId,storedState.revision);
      const value={success:true,partnerReply:result.text,replyId,roomLeft:result.roomLeft,heartsRemaining:current.hearts,costDeducted:charged.isVipUnlimited?0:cost,isAiGenerated:true,contentAudience:require('./contentAccess').verifiedAdult(user)?'adult':'general',fingerprint,...(kind==='gift'?{giftMessageId:requestId}:{})};
      db.saveChatRequest(id,requestId,value);
      if(kind==='chat'&&!result.roomLeft) require('./proactiveService').schedule(id,character.id);
      return value;
    });
    return res.json(response);
  } catch (error) {
    const accessBlocked=error.accessBlocked===true;
    const status=accessBlocked?403:error.code==='INSUFFICIENT_HEARTS'?402:503;
    const errorCode=/^(LLM_[A-Z_]+|CONVERSATION_CHANGED|Gemini API Error \(\d{3}\)|OpenAI API Error \(\d{3}\))$/.test(error.message)?error.message:undefined;
    console.warn('[LLM] generated turn failed:', JSON.stringify({kind,status,errorType:error.name || 'Error',errorCode}));
    const failure={success:false,error:accessBlocked?error.message:status===402?'INSUFFICIENT_HEARTS':'AI_GENERATION_FAILED',message:accessBlocked?(error.message==='ADULT_VERIFICATION_REQUIRED'?'이 내용은 성인인증 후 이용할 수 있습니다. 인증 전에는 일반 대화만 가능하며 하트는 차감되지 않았습니다.':'제공할 수 없는 내용입니다. 일반 대화를 이어가주세요. 하트는 차감되지 않았습니다.'):status===402?'하트가 부족합니다.':FAILURE,costDeducted:0,fingerprint};
    // Keep failures retryable with the same ID; never cache a fabricated reply.
    db.saveChatRequest(id,requestId,failure);
    return res.status(status).json({...failure,heartsRemaining:db.getUser(id)?.hearts});
  } finally { active.delete(id); }
};
