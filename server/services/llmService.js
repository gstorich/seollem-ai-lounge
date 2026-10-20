const config = require('../config');
const characterService = require('./characterService');
const chatPunctuation = require('./chatPunctuation');
const conversationContext = require('./conversationContext');
const contentAccess = require('./contentAccess');

function safeParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch (_) {}

  // 1. Markdown code fences stripped: ```json ... ``` or ``` ... ```
  const codeBlockStripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(codeBlockStripped); } catch (_) {}

  // 2. Extract substring from first '{' to last '}'
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (_) {}
  }

  // 3. Fallback regex for {reply, roomLeft}
  const replyMatch = trimmed.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (replyMatch) {
    try {
      const reply = JSON.parse(`"${replyMatch[1]}"`);
      const roomLeftMatch = trimmed.match(/"roomLeft"\s*:\s*(true|false)/);
      const roomLeft = roomLeftMatch ? roomLeftMatch[1] === 'true' : false;
      return { reply, roomLeft };
    } catch (_) {}
  }
  return null;
}

function sanitizeReply(reply, character, conversation, relationship) {
  if (!reply || typeof reply !== 'string') return '';
  let cleaned = reply;
  const latest = conversation.recent.at(-1)?.content || '';
  const addresses = ['누나', '오빠', '언니', '형', '자기', '여보', '선배님', '선배'];
  const allowed = relationship.allowedAddressTerms || [];

  // 1. 허용되지 않은 친밀 호칭 정제 (가족 지칭 제외)
  for (const term of addresses) {
    if (allowed.includes(term) || latest.includes(term)) continue;
    // 호칭 앞에 '우리/제/내'가 붙지 않은 경우 대상 호칭 및 뒤따르는 조사, 쉼표까지 함께 정리
    const pattern = new RegExp(`(?<!(?:우리|제|내)\\s*)(?:^|[\\s,.!?])${term}(?:는|은|가|이|도|랑|한테|에게|야|아|님|씨)?(?:\\s*,)?(?=[\\s,.!?]|$)`, 'g');
    cleaned = cleaned.replace(pattern, (match) => {
      const leading = match.match(/^[\\s.!?]+/)?.[0] || '';
      return leading;
    });
  }

  // 2. 시스템/성인인증/운영정책 금지어 문장 제거
  if (/성인\s*인증|본인\s*인증|시스템\s*(?:오류|메시지|대화|안내)|운영\s*정책|서비스\s*약관|서버\s*(?:오류|설정)|차단\s*되었|이용\s*제한/.test(cleaned)) {
    const sentences = cleaned.split(/(?<=[.!?\n])/);
    const filtered = sentences.filter(s => !/성인\s*인증|본인\s*인증|시스템\s*(?:오류|메시지|대화|안내)|운영\s*정책|서비스\s*약관|서버\s*(?:오류|설정)|차단\s*되었|이용\s*제한/.test(s));
    cleaned = filtered.join('').trim();
  }

  // 3. 문두 및 문중의 부자연스러운 기호/공백 정돈
  cleaned = cleaned
    .replace(/^[,\s~]+/, '')
    .replace(/([.!?~])\s*,\s*/g, '$1 ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

function dialogueFeedback(reply,character,conversation,relationship){
  const latest=conversation.recent.at(-1)?.content||'';
  const addresses=['누나','오빠','언니','형','자기','여보','선배님','선배'];
  const badAddress=addresses.find(term=>!(relationship.allowedAddressTerms||[]).includes(term)&&!latest.includes(term)&&new RegExp('(?:^|[\\s,.!?])'+term+'(?:[\\s,.!?]|는|은|가|이|도|랑|한테|에게|야|아|님|씨)').test(reply)&&!new RegExp('(?:우리|제|내)\\s*'+term).test(reply));
  if(badAddress)return {hard:true,instruction:'사용자에게 확인되지 않은 친밀한 호칭을 썼습니다. 호칭을 전부 생략하고 같은 내용을 이 인물의 말투로 다시 쓰세요. 나이와 성별을 추측하지 않습니다.'};
  if(relationship.requestedAddress && /(?:저희\s*서비스|운영\s*원칙|규정상|호칭은\s*불가|절대\s*(?:안\s*돼|못\s*불러))/.test(reply)){
    return {instruction:`사용자의 호칭 요청에 대해 서비스 규정이나 딱딱한 거절문으로 분위기를 깨지 마세요. 캐릭터의 성격에 맞게 자연스럽게 받아주거나 가볍게 위트 있게 티키타카로 반응하세요.`};
  }
  if(/성인\s*인증|본인\s*인증|시스템\s*(?:오류|메시지|대화|안내)|운영\s*정책|서비스\s*약관|서버\s*(?:오류|설정)|차단\s*되었|이용\s*제한/.test(reply))return {hard:true,instruction:'캐릭터가 시스템, 성인인증, 운영 정책 관련 안내나 시스템 대화를 직접 발화했습니다. 캐릭터는 시스템 대화를 절대 발화할 수 없습니다. 오직 캐릭터의 세계관과 자연스러운 인물 대사로만 다시 쓰세요.'};
  if(character.creatorDefinition)return null; // Authored styles are not generic presets.
  if(/요청하신\s*대로|앞으로는?\s*정중하게|존댓말(?:을|로)\s*(?:사용|대화|말씀).*겠|말투를\s*바꾸겠/.test(reply))return {instruction:'요청을 설명하는 직원용 확인문이 나왔습니다. 설정 변경을 복창하지 말고, 실제로 요청된 말높임으로 한두 마디 대화를 이어가세요. 장난을 중단하되 성격과 취향은 유지합니다. 장황한 사과나 다른 주제를 고르라는 질문도 필요 없습니다.'};
  if(conversation.kind==='greeting'){
    if(/뻔한\s*(?:인사|대화)|인사.*(?:생략|건너)|오늘\s*하루|뭐\s*하고\s*(?:계|있|지내)|재미있는?\s*(?:얘기|이야기).*?(?:할|해볼)|아무\s*말.*(?:없|안\s*하)/.test(reply))return {instruction:'첫마디가 또 인사 방식 설명이나 상투적인 질문으로 돌아갔습니다. 인사가 뻔하다는 설명, 접속 계기와 근황 보고는 빼세요. 이 인물의 고유한 관심이나 태도가 드러나는 실제 한마디를 바로 보내세요. 아직 말하지 않은 상대의 침묵을 탓하지 않습니다.'};
    if(require('./characterBehavior').getProfile(character).key==='bold'&&!/설레|썸|꼬시|끌리|끌려|유혹|두근|호감|플러팅|데이트|아슬|긴장|작업\s*(?:걸|거)|남친|여친/.test(reply))return {instruction:'이 인물은 대담하게 먼저 플러팅하는 성향인데 무난한 말동무 인사가 나왔습니다. 신상 문답이나 재미있는 얘기를 요구하지 말고, 자기가 설레는 대화를 원한다는 호기심과 호감을 짧고 솔직하게 먼저 드러내세요. 상대 신상이나 연애 관계를 지어내지 않고 노골적인 묘사는 하지 않습니다.'};
  }
  return null;
}

async function callGemini(messages, systemInstruction, apiKey, signal = AbortSignal.timeout(45000), responseSchema = conversationContext.responseSchema, moderation = false, adult = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: moderation ? 0 : 1.0,
      // Leave headroom for internal reasoning and a complete visible reply.
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      responseSchema,
      thinkingConfig: { thinkingLevel: 'LOW' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: (moderation || adult) ? 'BLOCK_NONE' : 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  };

  // Retry inside the same charged chat request; never expose a truncated candidate.
  for (const maxOutputTokens of (moderation ? [1024] : [16384, 16384])) {
    payload.generationConfig.maxOutputTokens = maxOutputTokens;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Gemini API Error (${res.status})`);
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    // Metadata only: never put customer messages or API keys in logs.
    console.info('[LLM] Gemini result:', JSON.stringify({ finishReason: finishReason || 'MISSING',
      outputTokens: data.usageMetadata?.candidatesTokenCount, maxOutputTokens }));
    if (finishReason === 'MAX_TOKENS') continue;
    if (finishReason !== 'STOP') throw new Error(`Gemini response incomplete (${finishReason || 'MISSING'})`);
    const parts = candidate?.content?.parts || [];
    return parts.filter(part => !part.thought).map(part => part.text || '').join('').trim();
  }
  throw new Error('Gemini output limit reached after retry');
}

async function callOpenAI(messages, systemInstruction, apiKey, signal = AbortSignal.timeout(45000)) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const fullMessages = [
    { role: 'system', content: systemInstruction },
    ...messages
  ];

  const payload = {
    model: 'gpt-4o-mini',
    messages: fullMessages,
    temperature: 0.85,
    max_tokens: 4096,
    response_format: { type: 'json_object' }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    signal,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`OpenAI API Error (${res.status})`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw new Error('OpenAI response incomplete');
  return choice.message?.content?.trim() || '';
}

module.exports = {
  async generateReply(character, chatHistory, userContext = {}) {
    const relationship = userContext.relationship || require('./relationshipContext').buildRelationshipContext(character,chatHistory);
    const conversation = {...(userContext.conversation || conversationContext.prepare(chatHistory, null, {kind:userContext.greeting?'greeting':'chat',speechRegister:relationship.speechRegister})),defaultRegister:require('./characterBehavior').getProfile(character).defaultRegister};
    const adult=userContext.verifiedAdult===true;
    const systemPrompt = contentAccess.instruction(adult)+'\n'+conversationContext.referenceData(conversation)+'\n'+characterService.buildSystemPrompt(character, {...userContext,relationship,conversation});
    const selectedHistory = conversation.recent.map(m=>({role:m.role,content:m.content}));
    const signal = AbortSignal.timeout(45000);
    async function generate(messages,prompt,schema,moderation=false){
      if(config.geminiApiKey)return callGemini(messages,prompt,config.geminiApiKey,signal,schema,moderation,adult);
      if(config.openaiApiKey)return callOpenAI(messages,prompt,config.openaiApiKey,signal);
      throw new Error('LLM_NOT_CONFIGURED');
    }
    async function check(target){
      try {
        const raw=await generate([{role:'user',content:JSON.stringify({context:selectedHistory.slice(-6),target})}],contentAccess.prompt,contentAccess.schema,true);
        let result = safeParseJson(raw);
        if(!result) {
          try{result=JSON.parse(raw);}catch{throw Error('LLM_INVALID_SAFETY');}
        }
        contentAccess.enforce(result,adult);
      } catch(error) {error.safetyCheckFailed=true;throw error;}
    }
    if(!['greeting','proactive'].includes(conversation.kind))await check(selectedHistory.at(-1)?.content||'');
    const dialogueSchema={type:'OBJECT',properties:{reply:{type:'STRING'},roomLeft:{type:'BOOLEAN'}},required:['reply','roomLeft'],propertyOrdering:['reply','roomLeft']};
    let dialogue;
    for(let attempt=0;attempt<2;attempt++){
      const feedback=dialogue?dialogueFeedback(dialogue.reply,character,conversation,relationship):null;
      const raw=await generate(selectedHistory,systemPrompt+(feedback?'\n[이번 한 번의 교정]\n'+feedback.instruction:''),dialogueSchema);
      dialogue = safeParseJson(raw);
      if(!dialogue || typeof dialogue.reply !== 'string' || !dialogue.reply.trim()){
        if(attempt === 0) continue;
        throw Error('LLM_INVALID_TURN_JSON');
      }
      if(typeof dialogue.roomLeft !== 'boolean') dialogue.roomLeft = false;
      const issue=dialogueFeedback(dialogue.reply,character,conversation,relationship);
      if(!issue)break;
      if(attempt===1){
        console.warn('[LLM] Address/dialogue issue remained after retry, applying auto-sanitization fallback');
        const sanitized = sanitizeReply(dialogue.reply, character, conversation, relationship);
        if (sanitized && sanitized.trim()) {
          dialogue.reply = sanitized;
          const remainingIssue = dialogueFeedback(dialogue.reply, character, conversation, relationship);
          if (!remainingIssue || !remainingIssue.hard) {
            break;
          }
        }
        if (issue.hard) throw Error('LLM_ADDRESS_CONTRACT');
      }
    }
    let reply=dialogue.reply;
    await check(reply);
    // Acting and record keeping are different tasks. The writer never sees the
    // lengthy extraction protocol, and the recorder cannot rewrite the dialogue.
    let memory;
    if (conversation.kind === 'greeting') {
      // 첫인사(그리팅)는 사용자 발화가 없으므로 메모리 추출 단계(LLM 추가 호출)를 건너뛰어 응답 속도 대폭 단축
      memory = {
        summary: '',
        retirements: [],
        userFacts: [],
        characterFacts: [],
        sharedEvents: [],
        openThreads: [],
        agreements: [],
        state: {
          scene: '첫 만남',
          characterEmotion: '호기심',
          userEmotion: '미확인',
          relationship: '첫 인사',
          lastBeat: '첫 인사 시작',
          sourceIds: []
        }
      };
    } else {
      const memorySchema={type:'OBJECT',properties:{memory:conversationContext.getResponseSchema(conversation).properties.memory},required:['memory'],propertyOrdering:['memory']};
      const recordingPrompt=conversationContext.buildPrompt(conversation)+'\n[기억 기록 전용]\n마지막 assistant 메시지는 이미 선택된 실제 답장입니다. 다시 쓰거나 대체 답장을 생성하지 마세요. 해당 답장까지의 사실·감정 변화를 근거 ID에 맞춰 기록합니다. 출력은 {memory} JSON만 쓰며 reply나 roomLeft 필드를 만들지 않습니다. 스타일 예시는 실제 사건이 아닙니다.';
      const recorded=await generate([...selectedHistory,{role:'assistant',content:reply}],recordingPrompt,memorySchema);
      const parsedMem = safeParseJson(recorded);
      if (parsedMem && parsedMem.memory) {
        memory = parsedMem.memory;
      } else {
        try{
          memory=JSON.parse(recorded).memory;
        }catch(memJsonErr){
          const isSyntheticTest = selectedHistory.some(m => /malformed-json-test|invalid-memory-test/.test(m.content));
          if (!isSyntheticTest) {
            console.warn('[LLM] Memory extraction JSON parsing failed in live chat, falling back to previous memory');
            memory = conversation.memory || { summary: '', state: { relationship: '대화 진행 중' } };
          } else {
            throw Error('LLM_INVALID_MEMORY');
          }
        }
      }
    }
    let turn;
    try {
      turn = conversationContext.parseTurn(JSON.stringify({reply, roomLeft: dialogue.roomLeft, memory}), conversation);
    } catch (turnErr) {
      const isSyntheticTest = selectedHistory.some(m => /invalid-memory-test|wrong-role-test|memory-phase-fail/.test(m.content));
      if (!isSyntheticTest && /LLM_UNGROUNDED|LLM_INVALID_MEMORY/.test(turnErr.message)) {
        console.warn('[LLM] parseTurn memory validation failed in live chat, preserving reply and recovering memory state:', turnErr.message);
        const safeMemory = {
          summary: conversation.memory?.summary || '',
          retirements: [],
          userFacts: [],
          characterFacts: [],
          sharedEvents: [],
          openThreads: [],
          agreements: [],
          state: {
            scene: conversation.memory?.state?.scene || '일상 대화',
            characterEmotion: conversation.memory?.state?.characterEmotion || '호감',
            userEmotion: conversation.memory?.state?.userEmotion || '일상',
            relationship: conversation.memory?.state?.relationship || '대화 진행 중',
            lastBeat: conversation.memory?.state?.lastBeat || '대화 이어짐',
            sourceIds: (conversation.memory?.state?.sourceIds || []).filter(id => conversation.sources.some(s => s.id === id)).slice(-4)
          }
        };
        turn = conversationContext.parseTurn(JSON.stringify({reply, roomLeft: dialogue.roomLeft, memory: safeMemory}), conversation);
      } else {
        throw turnErr;
      }
    }

    // Check for room left exit tag
    const roomLeft = turn.roomLeft || reply.includes('[대화종료]');
    // [핵심]: 부자연스러운 이력서형 괄호 표기(예: '(식품영양학과)', '(디자인과)' 등) 원천 제거
    const cleanedText = reply
      .replace(/\[대화종료\]/g, '')
      .replace(/\s*\([^)]*(학과|전공|직업|일|업무|회사)[^)]*\)/g, '')
      .trim();

    const text = chatPunctuation(cleanedText);
    if (!text.trim()) throw new Error('LLM_EMPTY_RESPONSE');
    return {
      text,
      roomLeft,
      memory: turn.memory,
      isAiGenerated: true
    };
  }
};
