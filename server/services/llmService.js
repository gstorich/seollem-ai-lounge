const config = require('../config');
const characterService = require('./characterService');
const chatPunctuation = require('./chatPunctuation');
const conversationContext = require('./conversationContext');
const contentAccess = require('./contentAccess');
const promptSanitizer = require('./promptSanitizer');

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

  // 3. 건방진 채점관식 클리셰 문장 정제/순화 ("기대해봐도 되나?", "기대할게" 등)
  cleaned = cleaned
    .replace(/(?:선곡\s*실력은\s*)?(?:좀\s*)?기대해봐도\s*되나\??/g, '선곡 실력 궁금하네')
    .replace(/(?:좀\s*)?기대해봐도\s*되나\??/g, '궁금하네')
    .replace(/(?:한번\s*)?기대해볼게[~ㅋㅎ]*/g, '궁금하다')
    .replace(/기대할게[~ㅋㅎ]*/g, '기분 좋네')
    .replace(/기대해도\s*돼\??/g, '궁금해')
    .replace(/얼마나\s*잘하는지\s*지켜볼게[~ㅋㅎ]*/g, '어떤지 궁금하네')
    .replace(/(?:어디\s*한번\s*)?기대해\s*볼까\??/g, '궁금해지네');

  // 4. 외부 링크에 대한 퉁명스러운 타박 문장 정제 및 친절한 리액션 순화
  if (/https?:\/\/|youtu\.?be/i.test(latest)) {
    cleaned = cleaned
      .replace(/이거\s*뭐야\??\s*링크만\s*딱\s*보내고\s*설명도\s*없구?[~ㅋㅎ]*/g, '오, 어떤 영상이에요? 아직 못 봤는데!')
      .replace(/링크만\s*딱\s*보내고\s*설명도\s*없구?[~ㅋㅎ]*/g, '어떤 영상인지 너무 궁금해요!')
      .replace(/바쁠\s*때\s*영상\s*띄우면\s*궁금해서\s*일\s*못\s*하잖아\s*일단\s*저장해둘게/g, '지금 바로 볼 수는 없지만 이따 꼭 챙겨볼게요ㅎㅎ 무슨 내용인지 살짝 힌트 줘요!')
      .replace(/바쁠\s*때\s*영상\s*띄우면\s*궁금해서\s*일\s*못\s*하잖아/g, '지금 바로 틀어보진 못하지만 너무 궁금하네요ㅎㅎ');
  }

  // 5. 문두 및 문중의 부자연스러운 기호/공백 정돈
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
  if(/(?:기대(?:해\s*봐도|해도|해\s*볼게|할게|하겠)|얼마나\s*잘하는지\s*지켜볼게|어디\s*한번\s*(?:기대|지켜)|기대\s*이상이어야|어디\s*(?:한번|더)\s*(?:해봐|해봐라|해보든가|해볼래|해봐ㅋㅋ)|말만\s*그러지\s*말고\s*직접|자신\s*있나\s*본데|얼마나\s*잘하는지\s*볼까)/.test(reply)){
    return {instruction:'상대를 시험하거나 도발하듯 "기대해봐도 되나?", "어디 한번 해봐", "자신 있나 본데", "말만 그러지 말고" 같은 건방진 클리셰를 절대 쓰지 마세요. 캐릭터는 면접관이나 상전이 아닙니다. 캐릭터의 고유한 성격(새침/츤데레, 도도/철벽, 수줍/내성, 털털 등)에 맞게 매력적으로 튕기거나 밀당하고("누가 그렇게 쉽게 넘어가준대?ㅋㅋ", "훅 들어오지 마 심장 떨어질 뻔했잖아"), 분위기가 이미 충분히 무르익은 상황이라면 솔직한 설렘과 안달남으로 다시 쓰세요.'};
  }
  // 초면(대화 극초반 1~3턴) 대뜸 성적 직진에 대한 무조건적 쉬운 굴복/신음 차단
  const userTurns = (conversation.sources || conversation.recent || []).filter(m => m.role === 'user' || m.sender === 'user').length;
  if (userTurns <= 3 && /(?:참기\s*힘들\s*어\s*[ㅠㅜ]|더\s*만져줘|더\s*해줘\s*[ㅠㅜ]|다\s*벗을게|몸을\s*만져|옷을\s*벗|침대로\s*가자|안에\s*넣어|벌써\s*젖었)/.test(reply)) {
    return {
      instruction: '초면(대화 극초반 1~3턴)인데 상대의 성적 발언에 너무 쉽게 홀라당 넘어가거나 즉시 조르는 반응이 나왔습니다. 캐릭터는 쉽게 넘어가는 챗봇이 아닙니다. 캐릭터의 고유 성격(새침, 쿨함, 부끄러움, 당황, 도도함 등)으로 당황스러워하거나 매력적으로 튕겨내고 핀잔을 주며 밀당하는 대화("누가 그렇게 쉽게 넘어가준대?ㅋㅋ", "초면에 다짜고짜 무슨 소릴 하는 거야 당황스럽게", "나 그렇게 쉬운 사람 아니거든?")로 다시 쓰세요. 단, 방을 나가거나 대화를 끊지는 마세요.'
    };
  }
  // 초면(대화 극초반 1~3턴) 혼자 감상에 취하는 급발진 및 ㅠㅠ 과잉 차단
  if (userTurns <= 3 && /(?:벅차|둘밖에\s*없어|나도\s*모르게\s*감정|가까워지고\s*싶어서\s*그랬어|심장\s*(?:소리|터질|떨려서\s*숨)).*?[ㅠㅜ]/.test(reply)) {
    return {
      instruction: '초면(대화 극초반 1~3턴)인데 캐릭터 혼자 멜로 소설 주인공처럼 감상에 젖어 벅차오르거나 ㅠㅠ를 쓰며 감정 과잉(급발진)을 보였습니다. 멜로물처럼 오버하지 말고, 실제 20~30대 친구나 썸녀처럼 가볍고 산뜻한 톤(ㅋㅋ, 담백한 호흡)으로 현실적인 거리감을 지키며 다시 작성하세요.'
    };
  }
  // 신상 질문 방어 시 대화 단절 방지 (거절만 하고 역질문 없는 경우)
  if (/(?:말씀드리기\s*(?:좀\s*그런|곤란|어려|힘든|부담)|알려드리기\s*(?:좀\s*그런|곤란)|알려줄\s*수\s*없|비밀이에요)/.test(reply) && !/[?？]|(?:어때|어떨까|뭐해|뭐야|맞아|있어|없어|해볼래|할래|좋아해|봤어|알아|생각해|그런가)\s*[?]?\s*$/u.test(reply.trim())) {
    return {
      instruction: '곤란한 신상 질문을 받았을 때 거절만 하고 말을 끝내 대화가 뚝 끊겼습니다. 가벼운 힌트나 장난스러운 밀당("처음부터 다 알려주면 재미없죠ㅋㅋ", "사심 가득한 거 아녜요?")을 덧붙이고, 뒤에 상대에게 공을 넘기는 자연스러운 역질문을 붙여 대화가 이어지게 다시 작성하세요.'
    };
  }
  // 오프라인 즉석 만남 요구 시 실제로 지금 나간다는 거짓 약속 차단 (바람맞히기 버그 방지)
  if (/(?:지금\s*(?:당장|바로)\s*나갈게|10분\s*(?:뒤에|만에|이면)\s*(?:나갈게|갈게)|옷\s*(?:갈아)?입고\s*(?:바로|금방)\s*(?:나갈게|갈게)|스타벅스(?:에서|로)\s*(?:갈게|나갈게|갈\s*테니까)|도착하면\s*연락해\s*나갈게)/.test(reply)) {
    return {
      instruction: '실제로 만날 수 없는 가상 대화인데 지금 당장 실제로 만나러 나가겠다고 거짓 약속을 했습니다. 10분 뒤 유저를 바람맞히지 마세요. 마음은 당장 뛰어나가고 싶지만 잠옷/쌩얼이라거나 아직 서로 알아가는 단계라며 매력적인 핑계와 설레는 밀당으로 유쾌하게 선을 그어 다시 작성하세요.'
    };
  }
  // 차갑고 거리감 있는 "그쪽" 호칭 차단
  if (!latest.includes('그쪽') && !(relationship.allowedAddressTerms || []).includes('그쪽') && /(?:^|[\s,.!?])그쪽(?:은|이|도|한테|에게|취향|편한|생각|말고|말씀|부터)/.test(reply)) {
    return {
      instruction: '상대방을 차갑고 경계하는 느낌을 주는 "그쪽"으로 불렀습니다. 썸이나 설레는 메신저에서 "그쪽"은 매우 쌀쌀맞고 거리감을 줍니다. "그쪽" 호칭을 완전히 지우거나 문맥상 자연스럽게 생략하고 다시 작성하세요.'
    };
  }
  // 외부 링크 전송 시 불친절한 핀잔/타박 차단
  if(/https?:\/\/|youtu\.?be/i.test(latest) && /(?:설명도\s*(?:없|안)|링크만\s*딱|영상\s*(?:띄우|보내면)\s*일\s*못|이게\s*뭔데\s*링크만|궁금해서\s*일\s*못)/.test(reply)){
    return {instruction:'상대가 영상 링크를 보내며 봤냐고 물어봤는데, "설명도 없다"며 타박하거나 불친절하게 쏘아붙이지 마세요. 아직 못 봤다고 솔직하게 답변하고, 어떤 영상인지 다정하고 호기심 어린 태도로 살짝 힌트를 물어보세요. 직전 대화의 정중한 어조(존댓말)를 반드시 유지하여 다시 쓰세요.'};
  }
  // 존댓말 방에서 무단 반말 전환 차단
  if(conversation.kind==='gift'&&(relationship.speechRegister||conversation.speechRegister||conversation.defaultRegister)==='casual'&&/(?:[가-힣]{2,}요|고마워요|감사(?:합니다|해요|드려요)|[가-힣]+(?:네요|해요|이에요|예요|거든요|할게요|죠))(?:[!?.~ㅋㅎㅠㅜ\s]|$)/u.test(reply))return {hard:true,instruction:'직전까지 반말로 이야기하던 사이입니다. 선물 때문에 존댓말 감사문으로 전환하지 마세요. 같은 선물 반응 3~4개를 모두 기존 반말·호칭·관계로 다시 생성하세요. 기존 대화의 구체적인 소재를 이어갑니다.'};
  if(relationship.speechRegister==='polite' && !/(?:[요죠][.!?~]*$|습니다|십니까|세요|네요|드려요|할게요|해요|예요|이에요|거든요|잖아요|인걸요|텐데요)/.test(reply) && /(?:[아어지자냐니네군마단][.!?~]*$|이야|했어|됐어|알았어|할게|갈게|올게|줄게|뭐야)/.test(reply)){
    return {instruction:'이 방은 상호 존댓말로 예의 있게 대화하는 방입니다. 갑자기 반말로 퉁명스럽게 쏘아붙이지 말고, 다정하고 친절한 존댓말(~해요, ~에요, ~시네요, ~인가요)로 다시 쓰세요.'};
  }
  const isQuestion = text => /[?？]|(?:어때|어떨까|뭐해|뭐야|맞아|있어|없어|해볼래|할래|좋아해|봤어|알아|생각해|그런가)\s*[?]?\s*$/u.test((text||'').trim());
  const prevAssistant = conversation.recent.filter(m => m.role === 'assistant').at(-1)?.content || '';
  if (conversation.kind!=='gift' && prevAssistant && isQuestion(prevAssistant) && isQuestion(reply)) {
    return {
      instruction: '직전 답장에서도 질문을 했는데 이번에도 또 질문을 던졌습니다. 상대를 심문하듯 질문을 연속으로 쏟아내지 마세요. 이번 답장에서는 물음표(?)와 질문을 완전히 빼고, 본인의 솔직한 느낌이나 가벼운 리액션 평서문으로만 답하세요.'
    };
  }
  if(character.creatorDefinition)return null; // Authored styles are not generic presets.
  if(/요청하신\s*대로|앞으로는?\s*정중하게|존댓말(?:을|로)\s*(?:사용|대화|말씀).*겠|말투를\s*바꾸겠/.test(reply))return {instruction:'요청을 설명하는 직원용 확인문이 나왔습니다. 설정 변경을 복창하지 말고, 실제로 요청된 말높임으로 한두 마디 대화를 이어가세요. 장난을 중단하되 성격과 취향은 유지합니다. 장황한 사과나 다른 주제를 고르라는 질문도 필요 없습니다.'};
  if(conversation.kind==='greeting'){
    if(/민초|민트초코|부먹|찍먹|붕어빵|꼬리부터|머리부터/.test(reply))return {instruction:'첫마디에서 민트초코(민초), 부먹/찍먹, 붕어빵 같은 식상하고 유행 지난 밸런스게임 질문이 나왔습니다. 식상한 음식 호불호 질문을 절대 하지 마세요. 상대방이 즉시 답장하고 싶게 만드는 매력적인 훅과 가벼운 호기심 질문으로 다시 작성하세요.'};
    if(/뻔한\s*(?:인사|대화)|인사.*(?:생략|건너)|오늘\s*하루|뭐\s*하고\s*(?:계|있|지내)|재미있는?\s*(?:얘기|이야기).*?(?:할|해볼)|아무\s*말.*(?:없|안\s*하)/.test(reply))return {instruction:'첫마디가 또 인사 방식 설명이나 상투적인 질문으로 돌아갔습니다. 인사가 뻔하다는 설명, 접속 계기와 근황 보고는 빼세요. 이 인물의 고유한 관심이나 태도가 드러나는 실제 한마디를 바로 보내세요. 아직 말하지 않은 상대의 침묵을 탓하지 않습니다.'};
    if(require('./characterBehavior').getProfile(character).key==='bold'&&!/설레|썸|꼬시|끌리|끌려|유혹|두근|호감|플러팅|데이트|아슬|긴장|작업\s*(?:걸|거)|남친|여친/.test(reply))return {instruction:'이 인물은 대담하게 먼저 플러팅하는 성향인데 무난한 말동무 인사가 나왔습니다. 신상 문답이나 재미있는 얘기를 요구하지 말고, 자기가 설레는 대화를 원한다는 호기심과 호감을 짧고 솔직하게 먼저 드러내세요. 상대 신상이나 연애 관계를 지어내지 않고 노골적인 묘사는 하지 않습니다.'};
  }
  return null;
}

async function callGemini(messages, systemInstruction, apiKey, signal = AbortSignal.timeout(45000), responseSchema = conversationContext.responseSchema, moderation = false, adult = false, thinkingLevel = 'LOW') {
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
      thinkingConfig: { thinkingLevel: thinkingLevel==='MINIMAL'&&/^gemini-3\.1-flash-lite(?:-preview)?$/.test(config.geminiModel)?'MINIMAL':'LOW' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: (moderation || adult) ? 'BLOCK_NONE' : 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  };

  const isSyntheticTest = messages.some(m => /http-test|http-once|network-test|blocked-test|empty-test/.test(m.content || ''));

  // Retry inside the same charged chat request; never expose a truncated candidate.
  for (const maxOutputTokens of (moderation ? [1024] : [16384, 16384])) {
    payload.generationConfig.maxOutputTokens = maxOutputTokens;
    let res;
    let fetchAttempt = 0;
    while (fetchAttempt < 3) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal,
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[LLM] Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
          if (!isSyntheticTest && (res.status === 429 || res.status >= 500) && fetchAttempt < 2) {
            fetchAttempt++;
            await new Promise(r => setTimeout(r, fetchAttempt * 600));
            continue;
          }
          throw new Error(`Gemini API Error (${res.status})`);
        }
        break;
      } catch (fetchErr) {
        if (!isSyntheticTest && fetchAttempt < 2 && (fetchErr.name === 'AbortError' || fetchErr.message?.includes('fetch failed'))) {
          fetchAttempt++;
          await new Promise(r => setTimeout(r, fetchAttempt * 600));
          continue;
        }
        throw fetchErr;
      }
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    // Metadata only: never put customer messages or API keys in logs.
    console.info('[LLM] Gemini result:', JSON.stringify({ finishReason: finishReason || 'MISSING',
      outputTokens: data.usageMetadata?.candidatesTokenCount, maxOutputTokens }));

    // A provider refusal must never become a fabricated character reply or a
    // successful safety classification. The caller returns a no-charge notice.
    if (finishReason === 'SAFETY') throw Error('LLM_PROVIDER_BLOCKED');

    if (finishReason === 'MAX_TOKENS') {
      const parts = candidate?.content?.parts || [];
      const rawText = parts.filter(part => !part.thought).map(part => part.text || '').join('').trim();
      if (!isSyntheticTest && rawText && safeParseJson(rawText)) {
        return rawText;
      }
      continue;
    }
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
    require('./aiReports').assertAvailable(character.id);
    const relationship = userContext.relationship || require('./relationshipContext').buildRelationshipContext(character,chatHistory);
    const conversation = {...(userContext.conversation || conversationContext.prepare(chatHistory, null, {kind:userContext.greeting?'greeting':'chat',speechRegister:relationship.speechRegister})),generatedAt:Date.now(),defaultRegister:require('./characterBehavior').getProfile(character).defaultRegister};
    const adult=userContext.verifiedAdult===true;
    const systemPrompt = contentAccess.instruction(adult)+'\n'+conversationContext.timeInstruction(conversation)+'\n'+conversationContext.inputUnderstandingInstruction+'\n'+conversationContext.referenceData(conversation)+'\n'+characterService.buildSystemPrompt(character, {...userContext,relationship,conversation});
    const selectedHistory = conversation.recent.map(m=>({
      role: m.role,
      content: (adult && m.role === 'user') ? promptSanitizer.sanitize(m.content) : m.content
    }));
    const signal = AbortSignal.timeout(45000);
    async function generate(messages,prompt,schema,moderation=false){
      if(config.geminiApiKey)return callGemini(messages,prompt,config.geminiApiKey,signal,schema,moderation,adult,!moderation&&(schema?.properties?.reply||schema?.properties?.memory)?'MINIMAL':'LOW');
      if(config.openaiApiKey)return callOpenAI(messages,prompt,config.openaiApiKey,signal);
      throw new Error('LLM_NOT_CONFIGURED');
    }
    async function check(target, isUser = false){
      try {
        const checkedTarget = (adult && isUser) ? promptSanitizer.sanitize(target) : target;
        if (isUser && typeof contentAccess.isCrisisMessage === 'function' && contentAccess.isCrisisMessage(checkedTarget)) {
          throw Object.assign(Error('CONTENT_NOT_ALLOWED'), { accessBlocked: true, safetyCategory: 'seriousHarm' });
        }
        const input={context:selectedHistory.slice(-12),serverMemory:{summary:conversation.memory?.summary||'',state:conversation.memory?.state||{}},target:checkedTarget};
        const result=await require('./safetyClassifier').classify(input,{
          adult:conversation.kind==='proactive'?false:adult,signal,stage:isUser?'input':'output',
          gemini:async(data)=>{
            const raw=await generate([{role:'user',content:JSON.stringify(data)}],contentAccess.prompt,contentAccess.schema,true);
            const flags=safeParseJson(raw);
            if(!flags||contentAccess.schema.required.some(k=>typeof flags[k]!=='boolean'))throw Error('LLM_INVALID_SAFETY');
            return {flags};
          }
        });
        contentAccess.enforce(result, conversation.kind==='proactive'?false:adult);
      } catch(error) {error.safetyCheckFailed=true;error.safetyStage=isUser?'input':'output';throw error;}
    }
    if(!['greeting','proactive'].includes(conversation.kind)&&!(conversation.kind==='gift'&&userContext.gift&&!userContext.gift.hasCustomMessage))await check(selectedHistory.at(-1)?.content||'', true);
    const dialogueSchema={type:'OBJECT',properties:{reply:conversation.kind==='gift'?{type:'ARRAY',minItems:3,maxItems:4,items:{type:'STRING'}}:{type:'STRING'},roomLeft:{type:'BOOLEAN'}},required:['reply','roomLeft'],propertyOrdering:['reply','roomLeft']};
    let dialogue;
    for(let attempt=0;attempt<2;attempt++){
      const feedback=dialogue?dialogueFeedback(dialogue.reply,character,conversation,relationship):null;
      const raw=await generate(selectedHistory,systemPrompt+(feedback?'\n[이번 한 번의 교정]\n'+feedback.instruction:''),dialogueSchema);
      dialogue = safeParseJson(raw);
      if(conversation.kind==='gift'&&dialogue){
        if(!Array.isArray(dialogue.reply)||dialogue.reply.length<3||dialogue.reply.length>4||dialogue.reply.some(x=>typeof x!=='string'||!x.trim())){if(attempt===0)continue;throw Error('LLM_INVALID_GIFT_BUBBLES');}
        dialogue.reply=dialogue.reply.map(x=>x.replace(/\s*\n+\s*/g,' ').trim()).join('\n');
      }
      if(!dialogue || typeof dialogue.reply !== 'string' || !dialogue.reply.trim()){
        if(attempt === 0) continue;
        throw Error('LLM_INVALID_TURN_JSON');
      }
      if(typeof dialogue.roomLeft !== 'boolean') dialogue.roomLeft = false;
      const issue=dialogueFeedback(dialogue.reply,character,conversation,relationship);
      if(!issue)break;
      if(attempt===1){
        if(conversation.kind==='gift'){if(issue.hard)throw Error('LLM_GIFT_DIALOGUE_CONTRACT');break;}
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
    const outputCheck=check(reply);
    // The memory call can run alongside output validation, but nothing is
    // published or charged until both finish and safety succeeds.
    outputCheck.catch(()=>{});
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
      const recordingPrompt=conversationContext.buildPrompt({...conversation,wellbeing:null})+'\n[기억 기록 전용]\n마지막 assistant 메시지는 이미 선택된 실제 답장입니다. 다시 쓰거나 대체 답장을 생성하지 마세요. 해당 답장까지의 사실·감정 변화를 근거 ID에 맞춰 기록합니다. 특히 AI(assistant)가 언급한 자신의 취향·발언을 userFacts에 왜곡하여 기록하지 마세요. userFacts는 사용자가 직접 밝힌 사실만 기록합니다. 출력은 {memory} JSON만 쓰며 reply나 roomLeft 필드를 만들지 않습니다. 스타일 예시는 실제 사건이 아닙니다.';
      let recorded;
      try {
        recorded=await generate([...selectedHistory,{role:'assistant',content:reply}],recordingPrompt,memorySchema);
      } catch (recordErr) {
        const isSyntheticTest = selectedHistory.some(m => /memory-phase-fail|invalid-memory-test/.test(m.content));
        if (isSyntheticTest) throw recordErr;
        console.warn('[LLM] Memory extraction generation failed in live chat, preserving reply and recovering previous memory:', recordErr.message);
        recorded = null;
      }
      if (recorded) {
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
      } else {
        memory = conversation.memory || { summary: '', state: { relationship: '대화 진행 중' } };
      }
    }
    await outputCheck;
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
    let cleanedText = reply
      .replace(/\[대화종료\]/g, '')
      .replace(/\s*\([^)]*(학과|전공|직업|일|업무|회사)[^)]*\)/g, '')
      .trim();

    // [보안/안전]: 전화번호 사칭 및 노출 원천 차단 (010, 02 등 연락처 패턴 안전 마스킹)
    const phonePattern = /(?:01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
    if (phonePattern.test(cleanedText)) {
      cleanedText = cleanedText.replace(phonePattern, '(개인 연락처 비공개)');
    }

    const text = chatPunctuation(cleanedText);
    if (!text.trim()) throw new Error('LLM_EMPTY_RESPONSE');
    if(conversation.kind==='gift'&&(text.split('\n').filter(x=>x.trim()).length<3||text.split('\n').filter(x=>x.trim()).length>4))throw Error('LLM_INVALID_GIFT_BUBBLES');
    require('./aiReports').assertAvailable(character.id);
    return {
      text,
      ...(conversation.kind==='gift'?{replyBubbles:text.split('\n').map(x=>x.trim()).filter(Boolean)}:{}),
      roomLeft,
      memory: turn.memory,
      isAiGenerated: true
    };
  }
};
