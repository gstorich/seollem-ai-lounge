const config = require('../config');
const characterService = require('./characterService');

async function callGemini(messages, systemInstruction, apiKey) {
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
      temperature: 0.9,
      // Leave headroom for internal reasoning and a complete visible reply.
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'LOW' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  };

  // Retry inside the same charged chat request; never expose a truncated candidate.
  const signal = AbortSignal.timeout(45000);
  for (const maxOutputTokens of [8192, 16384]) {
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

async function callOpenAI(messages, systemInstruction, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const fullMessages = [
    { role: 'system', content: systemInstruction },
    ...messages
  ];

  const payload = {
    model: 'gpt-4o-mini',
    messages: fullMessages,
    temperature: 0.85,
    max_tokens: 350
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content.trim() : '';
}

function getFallbackReply(character, lastUserText = '') {
  const endings = ['ㅎㅎ', '~', '😊', '☕'];
  const ending = endings[Math.floor(Math.random() * endings.length)];
  const fallbacks = [
    `네 말씀 잘 들었어요! 저도 공감되는 부분이 참 많네요 ${ending}`,
    `오늘 하루 어떠셨어요? 피곤하진 않으셨는지 궁금하네요 ${ending}`,
    `이야기 들으니 참 다정하신 분 같아요. 편하게 더 들려주세요 ㅎㅎ`,
    `소소한 일상 이야기 나누니까 마음이 참 따뜻해지네요 ${ending}`,
    `맞아요, 저도 비슷한 생각 자주 하거든요. 대화가 잘 통하는 것 같아요!`
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

module.exports = {
  async generateReply(character, chatHistory, userContext = {}) {
    const systemPrompt = characterService.buildSystemPrompt(character, userContext);
    let reply = '';
    let isAiGenerated = false;

    try {
      if (config.geminiApiKey) {
        reply = await callGemini(chatHistory, systemPrompt, config.geminiApiKey);
        isAiGenerated = Boolean(reply);
      } else if (config.openaiApiKey) {
        reply = await callOpenAI(chatHistory, systemPrompt, config.openaiApiKey);
        isAiGenerated = true;
      }
    } catch (err) {
      console.warn('[LLM] API call failed, falling back to local persona engine:', err.message);
    }

    if (!reply) {
      const lastUserMsg = chatHistory[chatHistory.length - 1]?.content || '';
      reply = getFallbackReply(character, lastUserMsg);
    }

    // Check for room left exit tag
    const roomLeft = reply.includes('[대화종료]');
    // [핵심]: 부자연스러운 이력서형 괄호 표기(예: '(식품영양학과)', '(디자인과)' 등) 원천 제거
    const cleanedText = reply
      .replace(/\[대화종료\]/g, '')
      .replace(/\s*\([^)]*(학과|전공|직업|일|업무|회사)[^)]*\)/g, '')
      .replace(/\s*\([a-zA-Z가-힣0-9\s]{2,15}\)/g, '') // 일반적인 괄호 설명 제거
      .trim();

    return {
      text: cleanedText,
      roomLeft,
      isAiGenerated
    };
  }
};
