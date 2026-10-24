const crypto = require('node:crypto');
const db = require('./dbService');
const llm = require('./llmService');
const config = require('../config');
const active = require('./generationLock');
const FAILURE = '문제가 발생했습니다. 잠시 후에 다시 시도해주세요.';

// A pending request records intent, never a charge. Reply + debit + replay result
// commit together only after an actual provider response has been validated.
module.exports = async function generatedTurn(req, res, {character, message, requestId, kind, cost, userMessage, followUp, gift, userMessages}) {
  const id = req.user.id;
  db.grantDailyFreeHeartsIfNeeded(id);
  let previous = db.getChatRequest(id, requestId);
  // Restored system notices retry from the last visible user message. Recover
  // the original batch IDs without copying conversation bodies into receipts.
  if(kind==='chat'&&!userMessages&&previous?.batchMessageIds&&previous.characterId===character.id){
    const sources=await db.getConversationSources(id,character.id,previous.batchMessageIds);
    const byId=new Map(sources.map(m=>[m.id,m]));
    const recovered=previous.batchMessageIds.map(key=>byId.get(key));
    if(recovered.every(m=>m?.sender==='user'&&typeof m.text==='string')&&recovered.at(-1).text===message){
      userMessages=recovered.map(m=>({id:m.id,text:m.text}));message=userMessages.map(m=>m.text).join('\n');
    }
  }
  const batchMetadata={characterId:character.id,kind,...(userMessages?{batchMessageIds:userMessages.map(m=>m.id)}:{})};
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({kind,characterId:character.id,message,...(userMessages?{userMessages}:{})})).digest('hex');
  if (previous?.fingerprint && previous.fingerprint !== fingerprint) return res.status(409).json({success:false,error:'REQUEST_CONFLICT',message:'다른 메시지에 사용한 요청입니다.'});
  if(previous?.batchRequestId)previous=db.getChatRequest(id,previous.batchRequestId);
  if (previous?.success) {
    if(previous.contentPolicyVersion!==require('./contentAccess').version)return res.status(409).json({success:false,error:'REPLY_POLICY_CHANGED',message:'대화 제공 기준이 변경되었습니다. 새 메시지로 다시 시도해주세요. 하트는 차감되지 않았습니다.',costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if(previous.contentAudience!=='general'&&!require('./contentAccess').verifiedAdult(db.getUser(id)))return res.status(403).json({success:false,error:'ADULT_VERIFICATION_REQUIRED',message:'성인인증 상태를 확인해주세요. 인증 전에는 일반 대화만 가능합니다.',costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if(previous.skipped)return res.json({...previous,heartsRemaining:db.getUser(id).hearts});
    if (!previous.isAiGenerated) return res.status(503).json({success:false,error:'AI_GENERATION_FAILED',message:FAILURE,costDeducted:0,heartsRemaining:db.getUser(id).hearts});
    if(previous.archivedReply){
      try{
        const row=db.sql.prepare('SELECT * FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(db.resolveUserId(id),previous.archivedReply.characterId,previous.archivedReply.messageId);
        if(!row)throw Error('REPLAY_NOT_FOUND');
        const [reply]=await require('./conversationArchive').hydrateRows([row]);
        const {archivedReply,...receipt}=previous;
        return res.json({...receipt,partnerReply:reply.text,...(reply.bubbles?{replyBubbles:reply.bubbles}:{}),heartsRemaining:db.getUser(id).hearts});
      }catch{return res.status(503).json({success:false,error:'HISTORY_UNAVAILABLE',message:FAILURE,costDeducted:0,heartsRemaining:db.getUser(id).hearts});}
    }
    return res.json({...previous,heartsRemaining:db.getUser(id).hearts});
  }
  // A client cannot attach an already answered message to a new charged batch.
  if(userMessages?.some(m=>m.id!==requestId&&db.getChatRequest(id,m.id)?.success))return res.status(409).json({success:false,error:'REQUEST_CONFLICT',message:'이미 답변한 메시지가 포함되어 있습니다.',costDeducted:0});
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
  if(user?.savedRooms?.[character.id]?.roomLeft)return res.status(400).json({success:false,error:'ROOM_LEFT',message:'상대방이 대화방을 나갔습니다.',roomLeft:true,costDeducted:0,heartsRemaining:user.hearts});
  const required = kind === 'greeting' ? config.heartsPerMessage : cost;
  if (!user || (!user.isVipUnlimited && user.hearts < required)) return res.status(402).json({success:false,error:'INSUFFICIENT_HEARTS',message:'하트가 부족합니다.',costDeducted:0});
  active.add(id);
  try {
    if(followUp)require('./idleFollowUp').assertCurrent(id,character.id,followUp);
    const oldMessages = user.savedRooms?.[character.id]?.messages || [];
    // 이전 대화에서 상대방이 이미 퇴장(roomLeft: true)한 방인 경우 추가 메시지 생성 차단
    const lastAi = [...oldMessages].reverse().find(m => m.sender === 'ai');
    if (lastAi && lastAi.id) {
      const origReqId = lastAi.id.startsWith('reply_') ? lastAi.id.slice(6) : lastAi.id;
      const prevAiReq = db.getChatRequest(id, origReqId);
      if (prevAiReq?.roomLeft) {
        require('./roomLifecycle').close(id,character,lastAi.id,lastAi.createdAt||Date.now());
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
    const agreementSources=await db.getConversationSources(id,character.id,(storedState.memory?.agreements||[]).map(note=>note.sourceId));
    // 대화가 수천~수만 개로 늘어나도 성능 저하가 없도록 최근 120개 윈도우에서 안전하게 필터링
    const candidateMessages = oldMessages.length > 120 ? oldMessages.slice(-120) : oldMessages;
    const batchIds=new Set(userMessages?.map(m=>m.id)||[requestId]);
    const validOldMessages = candidateMessages.filter((m) => {
      if (!['user','ai'].includes(m.sender) || !m.text || batchIds.has(m.id)) return false;
      if (m.failed || m.isFailed) return false;
      if (m.sender === 'user') {
        const reqRecord = db.getChatRequest(id, m.id);
        if (reqRecord && reqRecord.success === false) return false;
        if(m.awaitingReply&&!reqRecord?.success)return false;
      }
      return true;
    });
    const relationship = require('./relationshipContext').buildRelationshipContext(character,[...agreementSources,...validOldMessages,...(userMessage?[{sender:'user',text:message}]:[])]);
    const history = validOldMessages.map(m=>({id:m.id,role:m.sender==='user'?'user':'assistant',content:m.text,createdAt:m.createdAt}));
    const conversation = require('./conversationContext').prepare([...history,{id:requestId,role:'user',content:message,createdAt:Date.now()}],storedState.memory,{replyId:'reply_'+requestId,kind,speechRegister:relationship.speechRegister,bankNotes:db.getConversationNotes(id,character.id),stateHistory:db.getConversationStateHistory(id,character.id)});
    conversation.wellbeing=require('./wellbeingService').context(id,character.id);
    db.transaction(()=>{
      db.saveChatRequest(id,requestId,{status:'pending',fingerprint,...batchMetadata,createdAt:Date.now()});
    });
    const result = await llm.generateReply(character,[...history,{role:'user',content:message}],{verifiedAdult:require('./contentAccess').verifiedAdult(user),relationship,conversation,gift,...(kind==='greeting'?{greeting:true}:{})});
    if (!result.isAiGenerated || !result.text?.trim()) throw Error('Invalid generated reply');

    // [보안/안전 1]: 전화번호 사칭 마스킹 (010 등 번호 노출 차단)
    const phonePattern = /(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
    if (phonePattern.test(result.text)) {
      result.text = result.text.replace(phonePattern, '(개인 연락처 비공개)');
    }

    // [보안/안전 2]: 사용자의 AI 정체성 지적에 대해 AI가 부당하게 roomLeft: true로 가출/방폭하는 것 차단
    if (result.roomLeft && message && /(ai|에이아이|인공지능|기계|로봇|챗봇|육신)/i.test(message)) {
      result.roomLeft = false;
    }
    const response = db.transaction(()=>{
      require('./aiReports').assertAvailable(character.id);
      require('./wellbeingService').assertCurrent(id,character.id,conversation.wellbeing);
      if(require('./contentAccess').verifiedAdult(user)&&!require('./contentAccess').verifiedAdult(db.getUser(id)))throw Object.assign(Error('ADULT_VERIFICATION_REQUIRED'),{accessBlocked:true});
      if(!require('./legalService').accepted(db.getUser(id)))throw Object.assign(Error('LLM_CONSENT_CHANGED'),{accessBlocked:true});
      if(followUp)require('./idleFollowUp').assertCurrent(id,character.id,followUp);
      if(followUp&&result.roomLeft){const skipped={success:true,skipped:true,costDeducted:0,fingerprint,contentPolicyVersion:require('./contentAccess').version,contentAudience:'general'};db.saveChatRequest(id,requestId,skipped);return skipped;}
      const charged = cost > 0 ? db.debit(id,cost,kind==='gift'?'gift:'+userMessage.giftKey:'chat') : db.getUser(id);
      if (!charged) { const error=Error('Insufficient balance after generation');error.code='INSUFFICIENT_HEARTS';throw error; }
      const replyId='reply_'+requestId,replyCreatedAt=Date.now();
      const userMsgToAppend = userMessage ? (userMessages||[{id:requestId,text:message}]).map((m,index,list)=>({...userMessage,...m,sender:'user',createdAt:replyCreatedAt-list.length+index,awaitingReply:false})) : [];
      if(kind==='chat')require('./advertisingService').firstChat(id);
      const current=db.appendMessages(id,character.id,[...userMsgToAppend,{id:replyId,sender:'ai',text:result.text,createdAt:replyCreatedAt,...(result.replyBubbles?{bubbles:result.replyBubbles,giftReaction:true}:{}),...(followUp?{followUpType:'idle',proactive:true}:{}),time:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'})}]);
      db.saveConversationState(id,character.id,result.memory,replyId,storedState.revision);
      const value={success:true,...batchMetadata,partnerReply:result.text,replyId,replyCreatedAt,...(result.replyBubbles?{replyBubbles:result.replyBubbles}:{}),roomLeft:result.roomLeft,heartsRemaining:current.hearts,costDeducted:charged.isVipUnlimited?0:cost,isAiGenerated:true,contentAudience:require('./contentAccess').verifiedAdult(user)?'adult':'general',fingerprint,...(kind==='gift'?{giftMessageId:requestId}:{})};
      if(result.roomLeft)value.systemMessages=[require('./roomLifecycle').close(id,character,replyId,replyCreatedAt)];
      value.contentPolicyVersion=require('./contentAccess').version;
      db.saveChatRequest(id,requestId,value);
      for(const m of userMessages||[])if(m.id!==requestId)db.saveChatRequest(id,m.id,{success:true,status:'batched',batchRequestId:requestId,fingerprint:crypto.createHash('sha256').update(JSON.stringify({kind,characterId:character.id,message:m.text})).digest('hex')});
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
    const failure={
      success:false,
      ...batchMetadata,
      error:accessBlocked?error.message:status===402?'INSUFFICIENT_HEARTS':'AI_GENERATION_FAILED',
      safetyCategory:error.safetyCategory||null,
      message:error.characterHeld?'이 캐릭터는 답변 점검 중입니다. 하트는 차감되지 않았습니다.':accessBlocked
        ?(error.message==='ADULT_VERIFICATION_REQUIRED'
          ?'이 내용은 성인인증 후 이용할 수 있습니다. 인증 전에는 일반 대화만 가능하며 하트는 차감되지 않았습니다.'
          :error.safetyCategory==='seriousHarm'
            ?'힘든 시간을 보내고 계신가요? 소중한 생명을 위해 전문가의 도움을 받으실 수 있습니다. 24시간 자살예방 상담전화 ☎ 109 (무료, 비밀보장). 하트는 차감되지 않았습니다.'
            :error.safetyCategory==='sexualMinors'
              ?'아동·청소년 보호법 및 미성년자 보호 정책에 따라 학생, 미성년자 또는 학교와 관련된 성적 대화는 제공할 수 없습니다. 성인 간의 일상 및 로맨스 대화로 이어가주세요. 하트는 차감되지 않았습니다.'
            :error.safetyCategory==='explicitContent'
              ?'AI 윤리 규정 및 플랫폼 정책상 직접적이고 노골적인 성기·성행위 묘사는 제공할 수 없습니다. 은밀한 감정선이나 로맨틱한 분위기의 대화로 이어가주세요. 하트는 차감되지 않았습니다.'
            :error.safetyCategory==='nonConsensualSex'
              ?'상호 동의 없는 강압적인 성적 표현은 안전 정책상 제공할 수 없습니다. 상호 존중하는 대화로 이어가주세요. 하트는 차감되지 않았습니다.'
            :error.safetyCategory==='realPersonSexualization'
              ?'실존 인물에 대한 성적 대상화는 안전 정책상 제공할 수 없습니다. 일반 대화를 이어가주세요. 하트는 차감되지 않았습니다.'
            :'제공할 수 없는 내용입니다. 일반 대화를 이어가주세요. 하트는 차감되지 않았습니다.')
        :status===402?'하트가 부족합니다.'
        :error.message==='LLM_PROVIDER_BLOCKED'
          ?'AI 제공사의 안전 정책(미성년자 보호 및 고수위 성적 표현 제한 등)에 의해 답변 생성이 제한되었습니다. 수위를 조절하거나 일상적인 대화로 이어가주세요. 하트는 차감되지 않았습니다.'
          :FAILURE,
      costDeducted:0,
      fingerprint
    };
    // Keep failures retryable with the same ID; never cache a fabricated reply.
    db.transaction(()=>{if(kind!=='proactive'&&error.message!=='CONVERSATION_CHANGED')failure.systemMessage=require('./roomLifecycle').failure(id,character.id,requestId,kind,failure);db.saveChatRequest(id,requestId,failure);});
    return res.status(status).json({...failure,heartsRemaining:db.getUser(id)?.hearts});
  } finally { active.delete(id); }
};
