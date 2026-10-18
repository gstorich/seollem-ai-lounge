const config = require('../config');
const characterService = require('./characterService');

async function callGemini(messages, systemInstruction, apiKey, signal = AbortSignal.timeout(45000)) {
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
      maxOutputTokens: 16384,
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
  for (const maxOutputTokens of [16384, 16384]) {
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
    max_tokens: 350
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
    const errText = await res.text();
    throw new Error(`OpenAI API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content.trim() : '';
}

function getFallbackReply(character, lastUserText = '') {
  const fallbacks = [
    '아 그랬어요? 조금 더 얘기해줘요',
    '오늘은 좀 어떠셨어요?',
    '천천히 얘기해요. 듣고 있어요'
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

module.exports = {
  async generateReply(character, chatHistory, userContext = {}) {
    const relationship = userContext.relationship || require('./relationshipContext').buildRelationshipContext(character,chatHistory);
    const systemPrompt = characterService.buildSystemPrompt(character, {...userContext,relationship});
    let reply = '';
    let isAiGenerated = false;
    const signal = AbortSignal.timeout(45000);

    try {
      if (config.geminiApiKey) {
        reply = await callGemini(chatHistory, systemPrompt, config.geminiApiKey, signal);
        isAiGenerated = Boolean(reply);
      } else if (config.openaiApiKey) {
        reply = await callOpenAI(chatHistory, systemPrompt, config.openaiApiKey, signal);
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
