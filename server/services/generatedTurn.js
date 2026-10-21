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
    if(previous.contentPolicyVersion!==require('./contentAccess').version)return res.status(409).json({success:false,error:'REPLY_POLICY_CHANGED',message:'대화 제공 기준이 변경되었습니다. 새 메시지로 다시 시도해주세요. 하트는 차감되지 않았습니다.',costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if(previous.contentAudience!=='general'&&!require('./contentAccess').verifiedAdult(db.getUser(id)))return res.status(403).json({success:false,error:'ADULT_VERIFICATION_REQUIRED',message:'성인인증 상태를 확인해주세요. 인증 전에는 일반 대화만 가능합니다.',costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if (!previous.isAiGenerated) return res.status(503).json({success:false,error:'AI_GENERATION_FAILED',message:FAILURE,costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    return res.json({...previous,heartsRemaining:db.getUser(id).hearts});
  }
  if (active.has(id)) {
    // 합성 동시성 테스트(concurrent)가 아닌 실제 라이브 요청인 경우, 이전 턴(메모리 추출/응답 생성)의 마무리를 최대 2.5초간 대기
    const isSyntheticConcurrentTest = requestId === 'concurrent' || (typeof message === 'string' && message.includes('slow-test'));
    if (!isSyntheticConcurrentTest) {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (!active.has(id)) break;
      }
    }
    if (active.has(id)) {
      return res.status(409).json({success:false,error:'GENERATION_PENDING',message:'답변을 생성 중입니다. 잠시 기다려주세요.'});
    }
  }
  // Recover abandoned pending work after process restart; no charge was made.
  const user = db.getUser(id);
  const required = kind === 'greeting' ? config.heartsPerMessage : cost;
  if (!user || (!user.isVipUnlimited && user.hearts < required)) return res.status(402).json({success:false,error:'INSUFFICIENT_HEARTS',message:'하트가 부족합니다.',costDeducted:0});
  active.add(id);
  try {
    const oldMessages = user.savedRooms?.[character.id]?.messages || [];
    // 이전 대화에서 상대방이 이미 퇴장(roomLeft: true)한 방인 경우 추가 메시지 생성 차단
    const lastAi = [...oldMessages].reverse().find(m => m.sender === 'ai');
    if (lastAi && lastAi.id) {
      const origReqId = lastAi.id.startsWith('reply_') ? lastAi.id.slice(6) : lastAi.id;
      const prevAiReq = db.getChatRequest(id, origReqId);
      if (prevAiReq?.roomLeft) {
        return res.status(400).json({
          success: false,
          error: 'ROOM_LEFT',
          message: '상대방이 대화방을 나갔습니다.',
          roomLeft: true,
          costDeducted: 0,
          heartsRemaining: user.hearts
        });
      }
    }
    const storedState = db.getConversationState(id,character.id);
    const agreementSources=db.getConversationSources(id,character.id,(storedState.memory?.agreements||[]).map(note=>note.sourceId));
    const validOldMessages = oldMessages.filter((m) => {
      if (!['user','ai'].includes(m.sender) || !m.text || m.id === requestId) return false;
      if (m.sender === 'user') {
        const reqRecord = db.getChatRequest(id, m.id);
        if (reqRecord && reqRecord.success === false) return false;
      }
      return true;
    });
    const relationship = require('./relationshipContext').buildRelationshipContext(character,[...agreementSources,...validOldMessages,...(userMessage?[{sender:'user',text:message}]:[])]);
    const history = validOldMessages.map(m=>({id:m.id,role:m.sender==='user'?'user':'assistant',content:m.text,createdAt:m.createdAt}));
    const conversation = require('./conversationContext').prepare([...history,{id:requestId,role:'user',content:message,createdAt:Date.now()}],storedState.memory,{replyId:'reply_'+requestId,kind,speechRegister:relationship.speechRegister,bankNotes:db.getConversationNotes(id,character.id),stateHistory:db.getConversationStateHistory(id,character.id)});
    conversation.wellbeing=require('./wellbeingService').context(id,character.id);
    db.transaction(()=>{
      db.saveChatRequest(id,requestId,{status:'pending',fingerprint,createdAt:Date.now()});
    });
    const result = await llm.generateReply(character,[...history,{role:'user',content:message}],{verifiedAdult:require('./contentAccess').verifiedAdult(user),relationship,conversation,...(kind==='greeting'?{greeting:true}:{})});
    if (!result.isAiGenerated || !result.text?.trim()) throw Error('Invalid generated reply');
    const response = db.transaction(()=>{
      require('./wellbeingService').assertCurrent(id,character.id,conversation.wellbeing);
      if(require('./contentAccess').verifiedAdult(user)&&!require('./contentAccess').verifiedAdult(db.getUser(id)))throw Object.assign(Error('ADULT_VERIFICATION_REQUIRED'),{accessBlocked:true});
      if(!require('./legalService').accepted(db.getUser(id)))throw Object.assign(Error('LLM_CONSENT_CHANGED'),{accessBlocked:true});
      const charged = cost > 0 ? db.debit(id,cost,kind==='gift'?'gift:'+userMessage.giftKey:'chat') : db.getUser(id);
      if (!charged) { const error=Error('Insufficient balance after generation');error.code='INSUFFICIENT_HEARTS';throw error; }
      const replyId='reply_'+requestId;
      const userMsgToAppend = userMessage ? [{...userMessage,id:requestId,sender:'user',text:message,createdAt:Date.now()}] : [];
      if(kind==='chat')require('./advertisingService').firstChat(id);
      const current=db.appendMessages(id,character.id,[...userMsgToAppend,{id:replyId,sender:'ai',text:result.text,createdAt:Date.now(),time:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'})}]);
      db.saveConversationState(id,character.id,result.memory,replyId,storedState.revision);
      const value={success:true,partnerReply:result.text,replyId,roomLeft:result.roomLeft,heartsRemaining:current.hearts,costDeducted:charged.isVipUnlimited?0:cost,isAiGenerated:true,contentAudience:require('./contentAccess').verifiedAdult(user)?'adult':'general',fingerprint,...(kind==='gift'?{giftMessageId:requestId}:{})};
      value.contentPolicyVersion=require('./contentAccess').version;
      db.saveChatRequest(id,requestId,value);
      if(kind==='chat'&&!result.roomLeft) require('./proactiveService').schedule(id,character.id);
      return value;
    });
    return res.json(response);
  } catch (error) {
    require('./safetyMonitoring').record(id,character.id,requestId,kind,error);
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
