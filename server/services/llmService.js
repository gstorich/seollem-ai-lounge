const config = require('../config');
const characterService = require('./characterService');
const chatPunctuation = require('./chatPunctuation');
const conversationContext = require('./conversationContext');
const contentAccess = require('./contentAccess');

function dialogueFeedback(reply,character,conversation,relationship){
  const latest=conversation.recent.at(-1)?.content||'';
  const addresses=['누나','오빠','언니','형','자기','여보','선배님'];
  const badAddress=addresses.find(term=>!(relationship.allowedAddressTerms||[]).includes(term)&&!latest.includes(term)&&new RegExp('(?:^|[\\s,.!?])'+term+'(?:[\\s,.!?]|는|가|도|랑|한테|에게)').test(reply)&&!new RegExp('(?:우리|제|내)\\s*'+term).test(reply));
  if(badAddress)return {hard:true,instruction:'사용자에게 확인되지 않은 친밀한 호칭을 썼습니다. 호칭을 전부 생략하고 같은 내용을 이 인물의 말투로 다시 쓰세요. 나이와 성별을 추측하지 않습니다.'};
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
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: (moderation || adult) ? 'BLOCK_NONE' : 'BLOCK_LOW_AND_ABOVE' },
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
      const raw=await generate([{role:'user',content:JSON.stringify({context:selectedHistory.slice(-6),target})}],contentAccess.prompt,contentAccess.schema,true);
      let result;try{result=JSON.parse(raw);}catch{throw Error('LLM_INVALID_SAFETY');}
      contentAccess.enforce(result,adult);
    }
    if(!['greeting','proactive'].includes(conversation.kind))await check(selectedHistory.at(-1)?.content||'');
    const dialogueSchema={type:'OBJECT',properties:{reply:{type:'STRING'},roomLeft:{type:'BOOLEAN'}},required:['reply','roomLeft'],propertyOrdering:['reply','roomLeft']};
    let dialogue;
    for(let attempt=0;attempt<2;attempt++){
      const feedback=dialogue?dialogueFeedback(dialogue.reply,character,conversation,relationship):null;
      const raw=await generate(selectedHistory,systemPrompt+(feedback?'\n[이번 한 번의 교정]\n'+feedback.instruction:''),dialogueSchema);
      try{dialogue=JSON.parse(raw);}catch{throw Error('LLM_INVALID_TURN_JSON');}
      if(typeof dialogue?.reply!=='string'||!dialogue.reply.trim()||typeof dialogue.roomLeft!=='boolean')throw Error('LLM_INVALID_TURN');
      const issue=dialogueFeedback(dialogue.reply,character,conversation,relationship);
      if(!issue)break;
      if(attempt===1&&issue.hard)throw Error('LLM_ADDRESS_CONTRACT');
    }
    let reply=dialogue.reply;
    await check(reply);
    // Acting and record keeping are different tasks. The writer never sees the
    // lengthy extraction protocol, and the recorder cannot rewrite the dialogue.
    const memorySchema={type:'OBJECT',properties:{memory:conversationContext.getResponseSchema(conversation).properties.memory},required:['memory'],propertyOrdering:['memory']};
    const recordingPrompt=conversationContext.buildPrompt(conversation)+'\n[기억 기록 전용]\n마지막 assistant 메시지는 이미 선택된 실제 답장입니다. 다시 쓰거나 대체 답장을 생성하지 마세요. 해당 답장까지의 사실·감정 변화를 근거 ID에 맞춰 기록합니다. 출력은 {memory} JSON만 쓰며 reply나 roomLeft 필드를 만들지 않습니다. 스타일 예시는 실제 사건이 아닙니다.';
    const recorded=await generate([...selectedHistory,{role:'assistant',content:reply}],recordingPrompt,memorySchema);
    let memory;try{memory=JSON.parse(recorded).memory;}catch{throw Error('LLM_INVALID_MEMORY');}
    const turn=conversationContext.parseTurn(JSON.stringify({reply,roomLeft:dialogue.roomLeft,memory}),conversation);

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
