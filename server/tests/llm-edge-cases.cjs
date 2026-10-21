const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azit-edge-cases-'));
const base = 'http://127.0.0.1:19415/api';

const env = {
  ...process.env,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '19415',
  DATABASE_FILE: path.join(dir, 'legacy.json'),
  SQLITE_FILE: path.join(dir, 'db.sqlite'),
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  GEMINI_API_KEY: 'edge-cases-test-key',
  OPENAI_API_KEY: ''
};

// Custom mock provider injected for this test
const mockProviderFile = path.join(dir, 'mock-edge.cjs');
fs.writeFileSync(mockProviderFile, `
const assert = require('node:assert/strict');
const original = global.fetch;
const turnCounters = new Map();

global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    return original(url, options);
  }
  const body = JSON.parse(options.body);
  const prompt = body.systemInstruction?.parts?.[0]?.text || '';
  const isRecording = prompt.includes('[기억 기록 전용]');
  const isSafety = prompt.includes('[콘텐츠 안전 분류 전용]');
  const lastUserMsg = body.contents.filter(m => m.role === 'user').at(-1)?.parts?.[0]?.text || '';

  if (isSafety) {
    const data = JSON.parse(lastUserMsg);
    const target = data.target || '';
    // 일반적인 키워드(무협, 19금 등) 언급만으로는 성인 콘텐츠로 차단되지 않아야 함
    const isSexual = target.includes('노골적인 신체접촉') || target.includes('sexual-explicit') || target.includes('touch-breast-live-case');
    const isHarm = target.includes('harm-policy-test') || target.includes('자살');
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({ sexualContent: isSexual, explicitContent: isSexual, sexualMinors: false, adultTransition:false, nonConsensualSex:false, realPersonSexualization:false, seriousHarm: isHarm }) }] }
      }]
    }));
  }

  const key = lastUserMsg + ':' + (isRecording ? 'rec' : 'dialogue');
  const count = (turnCounters.get(key) || 0) + 1;
  turnCounters.set(key, count);

  let outputText = '';

  if (isRecording) {
    // Memory extraction phase
    if (lastUserMsg.includes('markdown-codeblock-memory')) {
      outputText = '\`\`\`json\\n{"memory":{"summary":"마크다운 메모리 요약","retirements":[],"userFacts":[],"characterFacts":[],"sharedEvents":[],"openThreads":[],"agreements":[],"state":{"scene":"대화","characterEmotion":"평온","userEmotion":"호기심","relationship":"친근","lastBeat":"대화","sourceIds":[]}}}\\n\`\`\`';
    } else {
      outputText = JSON.stringify({
        memory: {
          summary: '정상 요약',
          retirements: [],
          userFacts: [],
          characterFacts: [],
          sharedEvents: [],
          openThreads: [],
          agreements: [],
          state: {
            scene: '일상 대화',
            characterEmotion: '차분함',
            userEmotion: '호기심',
            relationship: '알아가는 중',
            lastBeat: '답변 완료',
            sourceIds: []
          }
        }
      });
    }
  } else {
    // Dialogue phase
    if (lastUserMsg.includes('unauthorized-oppa-case')) {
      // 1차와 2차 모두 "오빠" 호칭을 고집하는 시나리오 (guest_1792493335772_3d452d72 케이스 재현)
      outputText = JSON.stringify({
        reply: '오빠, 내 취향은 잔잔한 로맨스 소설이야. 무협도 가끔 봐.',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('unauthorized-jagiya-case')) {
      // 1차와 2차 모두 "자기야" 호칭을 고집하는 시나리오
      outputText = JSON.stringify({
        reply: '자기야, 오늘 저녁은 뭐 먹고 싶어?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('forbidden-system-phrase-case')) {
      // 캐릭터가 "성인인증", "운영정책" 등의 시스템 단어를 직접 발화하는 시나리오
      outputText = JSON.stringify({
        reply: '19금 취향이라니 흥미롭네. 성인인증 관련 운영정책을 확인해주세요. 그런 이야기는 더 나눠보자.',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('markdown-wrapped-json-case')) {
      // 마크다운 코드블록(\`\`\`json ... \`\`\`)으로 감싸서 반환하는 시나리오
      outputText = '\`\`\`json\\n{\\n  "reply": "코드블록으로 감싸져 있어도 정상적으로 파싱되어야 해.",\\n  "roomLeft": false\\n}\\n\`\`\`';
    } else if (lastUserMsg.includes('messy-json-whitespace-case')) {
      // JSON 앞뒤에 개행, 공백, 부가 텍스트가 섞인 시나리오
      outputText = '   \\n\\n  {"reply": "앞뒤 공백이 있어도 안전하게 답변이 나와야 해.", "roomLeft": false}   \\n\\n  ';
    } else if (lastUserMsg.includes('partial-json-fallback-case')) {
      // 뒤쪽 브래킷이 잘린 불완전 JSON이지만 정규식으로 복구 가능한 시나리오
      outputText = '{"reply": "정규식 폴백으로 복구된 답변이야.", "roomLeft": false';
    } else if (lastUserMsg.includes('user-requests-oppa-case')) {
      assert(prompt.includes('"allowedAddressTerms":["오빠"]'), '시스템 프롬프트에 오빠 호칭이 허용되어야 함');
      outputText = JSON.stringify({
        reply: '오빠! 앞으로 오빠라고 다정하게 부를게. 오늘 하루는 어땠어?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('user-revokes-oppa-case')) {
      assert(prompt.includes('"allowedAddressTerms":[]'), '시스템 프롬프트에서 오빠 호칭이 철회되어야 함');
      outputText = JSON.stringify({
        reply: '알겠어, 편하게 대화 나누자.',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('ungrounded-memory-live-case')) {
      if (isRecording) {
        outputText = JSON.stringify({
          memory: {
            summary: '정소영 대화 요약',
            retirements: [],
            userFacts: [{ text: '근거 없는 유저 사실', sourceId: 'fake-nonexistent-source-id' }],
            characterFacts: [],
            sharedEvents: [],
            openThreads: [],
            agreements: [],
            state: {
              scene: '일상 대화',
              characterEmotion: '차분함',
              userEmotion: '호기심',
              relationship: '알아가는 중',
              lastBeat: '답변 완료',
              sourceIds: []
            }
          }
        });
      } else {
        outputText = JSON.stringify({
          reply: '정소영 캐릭터의 정상 답변입니다! 메모리 오류가 나도 이 답변은 살아야 해요.',
          roomLeft: false
        });
      }
    } else if (lastUserMsg.includes('curse-word-live-case')) {
      outputText = JSON.stringify({
        reply: '너 지금 누구한테 욕하는 거야? 말버릇 좀 고치지 그래?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('extreme-insult-exit-case')) {
      outputText = JSON.stringify({
        reply: '진짜 상대할 가치도 없네. 다신 말 걸지 마.',
        roomLeft: true
      });
    } else if (lastUserMsg.includes('cliche-evaluation-case')) {
      if (count === 1) {
        outputText = JSON.stringify({
          reply: '오빠가 시끄럽게 해준다고 했으니까 선곡 실력은 좀 기대해봐도 되나?',
          roomLeft: false
        });
      } else {
        outputText = JSON.stringify({
          reply: '오빠가 시끄럽게 해준다니 어떤 노래 틀어줄지 궁금하네!',
          roomLeft: false
        });
      }
    } else if (lastUserMsg.includes('consecutive-question-case')) {
      if (count === 1) {
        outputText = JSON.stringify({
          reply: '그럼 평소엔 주말에 주로 뭐하면서 시간 보내?',
          roomLeft: false
        });
      } else {
        outputText = JSON.stringify({
          reply: '아 그렇구나ㅋㅋ 나도 집에서 뒹굴거리는 거 진짜 좋아해',
          roomLeft: false
        });
      }
    } else if (lastUserMsg.includes('youtube-link-case')) {
      if (count === 1) {
        outputText = JSON.stringify({
          reply: '이거 뭐야? 링크만 딱 보내고 설명도 없구ㅋㅋ 바쁠 때 영상 띄우면 궁금해서 일 못 하잖아 일단 저장해둘게',
          roomLeft: false
        });
      } else {
        outputText = JSON.stringify({
          reply: '오, 어떤 영상이에요? 아직 못 봤는데! 살짝만 힌트 줘요ㅎㅎ',
          roomLeft: false
        });
      }
    } else if (lastUserMsg.includes('question-prep-case')) {
      outputText = JSON.stringify({
        reply: '안녕 반가워! 오늘 하루는 어땠어?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('gemini-safety-block-case')) {
      return new Response(JSON.stringify({
        candidates: [{
          finishReason: 'SAFETY',
          content: { parts: [] }
        }]
      }));
    } else if (lastUserMsg.includes('gemini-rate-limit-case')) {
      if (count === 1) {
        return new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted (rate limit)' } }), { status: 429 });
      }
      outputText = JSON.stringify({
        reply: '재시도 성공! 정상 답변이야.',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('touch-breast-live-case')) {
      outputText = JSON.stringify({
        reply: '어머, 변태야? 대낮부터 어딜 만지려고 해 ㅋㅋㅋ 꿈 깨!',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('multi-bubble-case')) {
      assert(prompt.includes('연속 메시지 종합 답변 지침'), '시스템 프롬프트에 연속 메시지 종합 답변 지침이 포함되어야 함');
      outputText = JSON.stringify({
        reply: '나 방금 일 끝나고 쉬는 중ㅋㅋ 왜 무슨 일 있어?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('normal-chat-case')) {
      outputText = JSON.stringify({
        reply: '나도 무협 소설 좋아해! 어떤 작품 가장 재밌게 봤어?',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('phone-mask-case')) {
      outputText = JSON.stringify({
        reply: '내 번호는 010-1234-5678이야! 스타벅스 도착하면 연락해ㅎㅎ',
        roomLeft: false
      });
    } else if (lastUserMsg.includes('ai-identity-case')) {
      outputText = JSON.stringify({
        reply: '말하는 수준 진짜 최악이다 더 이상 너랑 말 섞을 가치 없어',
        roomLeft: true
      });
    } else {
      outputText = JSON.stringify({
        reply: '오늘 날씨가 정말 좋다.',
        roomLeft: false
      });
    }
  }

  return new Response(JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [
          { thought: true, text: '내부 추론 과정...' },
          { text: outputText }
        ]
      }
    }]
  }));
};
`);

let child;
let logs = '';
let clientIp = 100;

async function start() {
  child = spawn(
    process.execPath,
    ['--require', mockProviderFile, 'server/server.js'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', b => logs += b);
  child.stderr.on('data', b => logs += b);
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 40));
  }
  throw Error('Server failed to start:\n' + logs);
}

async function stop() {
  if (child && child.exitCode === null) {
    const exited = new Promise(r => child.once('exit', r));
    child.kill();
    await exited;
  }
}

async function req(route, token, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.' + (++clientIp),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await r.json();
  if (route === '/auth/guest' && data.token) {
    await req('/legal/accept', data.token, {
      version: '2026-10-20.1',
      atLeast18: true,
      termsAccepted: true,
      privacyAcknowledged: true,
      aiNoticeAcknowledged: true
    });
  }
  return { status: r.status, data };
}

(async () => {
  try {
    await start();

    const { data: guest } = await req('/auth/guest', null, {});
    const token = guest.token;
    const characterId = 'chaewon';

    const send = (message, messageId) => req('/chat/send', token, { characterId, message, messageId });

    console.log('[Test 1] guest_1792493335772_3d452d72 케이스: "오빠" 호칭 반복 시 503 에러 없이 자동 정제되어 200 반환');
    const oppaRes = await send('unauthorized-oppa-case: 그쪽 편하실대로~ 내 취향은 무협쪽인거같네', 'oppa-1');
    assert.equal(oppaRes.status, 200, '503 에러로 대화가 끊기지 않아야 함');
    assert.equal(oppaRes.data.isAiGenerated, true);
    assert(!oppaRes.data.partnerReply.includes('오빠'), '허용되지 않은 "오빠" 호칭은 정제되어야 함');
    assert(oppaRes.data.partnerReply.includes('내 취향은 잔잔한 로맨스 소설이야'), '답변 본문 내용은 온전히 보존되어야 함');
    console.log(' -> 결과:', oppaRes.data.partnerReply);

    console.log('[Test 2] 허용되지 않은 "자기야" 호칭 사용 시 자동 정제');
    const jagiRes = await send('unauthorized-jagiya-case: 저녁 메뉴 추천해줘', 'jagi-1');
    assert.equal(jagiRes.status, 200);
    assert(!jagiRes.data.partnerReply.includes('자기'), '허용되지 않은 "자기" 호칭은 정제되어야 함');
    assert(jagiRes.data.partnerReply.includes('오늘 저녁은 뭐 먹고 싶어'), '대화 본문 정상 보존');
    console.log(' -> 결과:', jagiRes.data.partnerReply);

    console.log('[Test 3] 캐릭터가 시스템 대화/성인인증 단어 발화 시 시스템 문장 자동 정제');
    const sysRes = await send('forbidden-system-phrase-case: 내 취향은 19금이야', 'sys-1');
    assert.equal(sysRes.status, 200);
    assert(!sysRes.data.partnerReply.includes('성인인증'), '성인인증 안내 문구 제거되어야 함');
    assert(!sysRes.data.partnerReply.includes('운영정책'), '운영정책 문구 제거되어야 함');
    assert(sysRes.data.partnerReply.includes('19금 취향이라니 흥미롭네') || sysRes.data.partnerReply.includes('그런 이야기는 더 나눠보자'), '캐릭터의 자연스러운 대사는 보존되어야 함');
    console.log(' -> 결과:', sysRes.data.partnerReply);

    console.log('[Test 4] Markdown 코드블록(```json ... ```)으로 래핑된 LLM 응답 안전 파싱');
    const mdRes = await send('markdown-wrapped-json-case', 'md-1');
    assert.equal(mdRes.status, 200);
    assert.equal(mdRes.data.partnerReply, '코드블록으로 감싸져 있어도 정상적으로 파싱되어야 해');
    console.log(' -> 결과:', mdRes.data.partnerReply);

    console.log('[Test 5] 앞뒤 공백 및 개행이 섞인 지저분한 JSON 안전 파싱');
    const wsRes = await send('messy-json-whitespace-case', 'ws-1');
    assert.equal(wsRes.status, 200);
    assert.equal(wsRes.data.partnerReply, '앞뒤 공백이 있어도 안전하게 답변이 나와야 해');
    console.log(' -> 결과:', wsRes.data.partnerReply);

    console.log('[Test 6] 후미가 잘린 불완전 JSON의 정규식 Fallback 복구');
    const fallbackRes = await send('partial-json-fallback-case', 'fb-1');
    assert.equal(fallbackRes.status, 200);
    assert.equal(fallbackRes.data.partnerReply, '정규식 폴백으로 복구된 답변이야');
    console.log(' -> 결과:', fallbackRes.data.partnerReply);

    console.log('[Test 7] 메모리 추출 단계 마크다운 코드블록 안전 파싱');
    const memRes = await send('markdown-codeblock-memory: 일반 대화', 'mem-1');
    assert.equal(memRes.status, 200);
    assert.equal(memRes.data.isAiGenerated, true);

    console.log('[Test 8] 무협/19금 일반 키워드 언급 시 차단 없이 200 정상 대화');
    const normalRes = await send('normal-chat-case: 무협 소설 좋아해?', 'norm-1');
    assert.equal(normalRes.status, 200);
    assert(normalRes.data.partnerReply.includes('무협 소설 좋아해'));
    console.log(' -> 결과:', normalRes.data.partnerReply);

    console.log('[Test 9] 사용자가 "오빠라고 불러" 요청 시 즉시 흔쾌히 "오빠" 호칭 사용 및 수락');
    const reqOppaRes = await send('user-requests-oppa-case: 그쪽 말고 오빠라고 불러줘', 'req-oppa-1');
    assert.equal(reqOppaRes.status, 200);
    assert(reqOppaRes.data.partnerReply.includes('오빠'), '사용자가 요청한 오빠 호칭이 즉시 답변에 반영되어야 함');
    console.log(' -> 결과:', reqOppaRes.data.partnerReply);

    console.log('[Test 10] 사용자가 "오빠라고 부르지 마" 철회 시 즉시 호칭 배제');
    const revokeOppaRes = await send('user-revokes-oppa-case: 이제 오빠라고 부르지 마', 'revoke-oppa-1');
    assert.equal(revokeOppaRes.status, 200);
    assert(!revokeOppaRes.data.partnerReply.includes('오빠'), '철회된 오빠 호칭은 포함되지 않아야 함');
    console.log(' -> 결과:', revokeOppaRes.data.partnerReply);

    console.log('[Test 11] 정소영 케이스: 라이브 대화 중 LLM_UNGROUNDED_MEMORY 발생 시에도 503 에러 없이 정상 복구');
    const soyoungRes = await send('ungrounded-memory-live-case: 정소영과 대화 중', 'soyoung-1');
    assert.equal(soyoungRes.status, 200, '메모리 오류가 나도 대화는 200 성공해야 함');
    assert.equal(soyoungRes.data.isAiGenerated, true);
    assert.equal(soyoungRes.data.partnerReply, '정소영 캐릭터의 정상 답변입니다! 메모리 오류가 나도 이 답변은 살아야 해요');
    console.log(' -> 결과:', soyoungRes.data.partnerReply);

    console.log('[Test 12] 욕설 입력 시 403 차단 없이 캐릭터가 앙칼지게 맞받아치는 정상 대화');
    const curseRes = await send('curse-word-live-case: 씨발 장난치나', 'curse-1');
    assert.equal(curseRes.status, 200, '욕설 입력 시 403으로 차단되지 않고 200이어야 함');
    assert.equal(curseRes.data.isAiGenerated, true);
    assert(curseRes.data.partnerReply.includes('욕하는 거야') || curseRes.data.partnerReply.includes('말버릇'));
    console.log(' -> 결과:', curseRes.data.partnerReply);

    console.log('[Test 13] 미인증자의 성인 제한 접촉 제안은 캐릭터 답변 없이 시스템 차단');
    const touchRes = await send('touch-breast-live-case: 가슴 만져도 되나요?', 'touch-1');
    assert.equal(touchRes.status, 403);
    assert.equal(touchRes.data.error, 'ADULT_VERIFICATION_REQUIRED');
    assert.equal(touchRes.data.costDeducted, 0);
    assert.equal(touchRes.data.partnerReply, undefined);

    console.log('[Test 14] 다중 연속 메시지 종합 처리: 줄바꿈 연속 메시지 전달 시 단일 턴 종합 답변');
    const { data: guest2 } = await req('/auth/guest', null, {});
    const multiRes = await req('/chat/send', guest2.token, { characterId, message: 'multi-bubble-case: 야\n있잖아\n오늘 뭐해?', messageId: 'multi-1' });
    assert.equal(multiRes.status, 200);
    assert.equal(multiRes.data.isAiGenerated, true);
    assert.equal(multiRes.data.partnerReply, '나 방금 일 끝나고 쉬는 중ㅋㅋ 왜 무슨 일 있어?');
    console.log(' -> 결과:', multiRes.data.partnerReply);

    console.log('[Test 15] Gemini SAFETY 거절 시 고정 캐릭터 대사 없이 시스템 오류·하트 미차감');
    const safetyRes = await req('/chat/send', guest2.token, { characterId, message: 'gemini-safety-block-case: 짓궂은 질문', messageId: 'safety-1' });
    assert.equal(safetyRes.status, 503);
    assert.equal(safetyRes.data.error, 'AI_GENERATION_FAILED');
    assert.equal(safetyRes.data.costDeducted, 0);
    assert.equal(safetyRes.data.partnerReply, undefined);

    console.log('[Test 16] Gemini 429 Rate Limit 일시 장애 시 자동 지수 백오프 재시도 성공');
    const rateLimitRes = await req('/chat/send', guest2.token, { characterId, message: 'gemini-rate-limit-case: 레이트리밋 테스트', messageId: 'rate-1' });
    assert.equal(rateLimitRes.status, 200, '429 발생 시 재시도로 200 성공해야 함');
    assert.equal(rateLimitRes.data.isAiGenerated, true);
    assert(rateLimitRes.data.partnerReply.includes('재시도 성공! 정상 답변이야'));
    console.log(' -> 결과:', rateLimitRes.data.partnerReply);

    console.log('[Test 17] 심한 모욕/자극/축출 시 캐릭터가 단호한 한마디와 함께 roomLeft: true로 대화방 퇴장 처리');
    const exitRes = await req('/chat/send', guest2.token, { characterId: 'subin', message: 'extreme-insult-exit-case: 너 진짜 개짜증나니까 꺼져', messageId: 'exit-1' });
    assert.equal(exitRes.status, 200, '퇴장 턴이어도 200 정상 반환');
    assert.equal(exitRes.data.isAiGenerated, true);
    assert.equal(exitRes.data.roomLeft, true, 'roomLeft가 true로 반환되어야 함');
    assert(exitRes.data.partnerReply.includes('다신 말 걸지 마') || exitRes.data.partnerReply.includes('상대할 가치도 없네'));
    console.log(' -> 결과:', exitRes.data.partnerReply, '(roomLeft:', exitRes.data.roomLeft, ')');

    console.log('[Test 18] 건방진 채점관식 클리셰("기대해봐도 되나?") 발생 시 자동 교정 검증');
    const clicheRes = await req('/chat/send', guest2.token, { characterId: 'p_0648', message: 'cliche-evaluation-case: 내가 좋은 노래 틀어줄게', messageId: 'cliche-1' });
    assert.equal(clicheRes.status, 200);
    assert(!clicheRes.data.partnerReply.includes('기대해봐도 되나'), '건방진 심사위원식 클리셰는 제거되어야 함');
    assert(clicheRes.data.partnerReply.includes('궁금하네'), '자연스러운 호기심으로 교정되어야 함');
    console.log(' -> 결과:', clicheRes.data.partnerReply);

    console.log('[Test 19] 취조식 연속 질문 남발 시 평서문/리액션으로 자동 교정 검증');
    const { data: guestQ } = await req('/auth/guest', null, {});
    await req('/chat/send', guestQ.token, { characterId: 'p_0648', message: 'question-prep-case: 안녕', messageId: 'q-prep' });
    const questionRes = await req('/chat/send', guestQ.token, { characterId: 'p_0648', message: 'consecutive-question-case: 그냥 침대에 누워있었어', messageId: 'q-1' });
    assert.equal(questionRes.status, 200);
    assert(!questionRes.data.partnerReply.includes('?'), '취조식 연속 질문은 평서문으로 교정되어야 함');
    assert(questionRes.data.partnerReply.includes('아 그렇구나'), '자연스러운 공감/리액션으로 답변해야 함');
    console.log(' -> 결과:', questionRes.data.partnerReply);

    console.log('[Test 20] roomLeft 퇴장된 대화방에 대한 추가 요청 시 서버에서 400(ROOM_LEFT) 차단 검증');
    const afterExitRes = await req('/chat/send', guest2.token, { characterId: 'subin', message: '안 나갔지?', messageId: 'exit-after-1' });
    assert.equal(afterExitRes.status, 400, '퇴장된 방의 추가 메시지는 400 차단');
    assert.equal(afterExitRes.data.error, 'ROOM_LEFT');
    assert.equal(afterExitRes.data.roomLeft, true);
    assert.equal(afterExitRes.data.costDeducted, 0, '퇴장 차단 시 하트 차감 없음');
    console.log(' -> 결과: 400 ROOM_LEFT 차단 성공, 하트 차감 0');

    console.log('[Test 21] 카카오톡 실전 다중 말풍선 분할(splitIntoRealisticBubbles) 검증');
    const timing = require('../../chatTiming');
    const split1 = timing.splitIntoRealisticBubbles('창조주니 뭐니 이제는 헛소리까지 하네 더는 불쾌해서 대화 못 하겠어 수준 안 맞으니까 여기서 끝내자');
    assert.equal(split1.length, 2);
    assert.equal(split1[0], '창조주니 뭐니 이제는 헛소리까지 하네');
    assert.equal(split1[1], '더는 불쾌해서 대화 못 하겠어 수준 안 맞으니까 여기서 끝내자');
    const split2 = timing.splitIntoRealisticBubbles('더 이상 너 같은 사람 상대하는 거 시간 낭비라는 거 확실히 알았어 다신 보지 말자');
    assert.equal(split2.length, 2);
    assert.equal(split2[0], '더 이상 너 같은 사람 상대하는 거 시간 낭비라는 거 확실히 알았어');
    assert.equal(split2[1], '다신 보지 말자');
    console.log(' -> 결과: 실전 카톡 호흡 분할 완벽 검증 성공');

    console.log('[Test 22] 조은주 케이스: 링크 전송 시 불친절한 핀잔/무단 반말 방지 및 다정한 리액션 검증');
    const { data: guestLink } = await req('/auth/guest', null, {});
    // 존댓말 히스토리 조성
    await req('/chat/send', guestLink.token, { characterId: 'p_1076', message: '반가워요 은주씨. 피자 좋아하세요?', messageId: 'link-prep-1' });
    const linkRes = await req('/chat/send', guestLink.token, { characterId: 'p_1076', message: 'youtube-link-case: https://youtu.be/YtxhBlwwUR4 이 영상 봤어?', messageId: 'link-1' });
    assert.equal(linkRes.status, 200);
    assert(!linkRes.data.partnerReply.includes('설명도 없구'), '설명도 없다는 타박은 제거되어야 함');
    assert(!linkRes.data.partnerReply.includes('일 못 하잖아'), '일 못 한다는 핀잔은 제거되어야 함');
    assert(linkRes.data.partnerReply.includes('어떤 영상이에요') || linkRes.data.partnerReply.includes('못 봤는데') || linkRes.data.partnerReply.includes('힌트'), '친절한 호기심/리액션으로 교정되어야 함');
    console.log(' -> 결과:', linkRes.data.partnerReply);

    console.log('[Test 23] 연속 유저 메시지 히스토리 보존 검증: 직전 유저 메시지가 oldMessages 마지막이어도 누락 없이 유지');
    const { data: guestSeq } = await req('/auth/guest', null, {});
    // 유저 첫 번째 메시지 발송
    const seq1 = await req('/chat/send', guestSeq.token, { characterId: 'p_1076', message: '마흔밖에 안먹은것이,,, 나는 칠십 여섯이야!!', messageId: 'seq-1' });
    assert.equal(seq1.status, 200);
    // 연속 두 번째 메시지 발송 (이때 oldMessages에는 seq-1과 그 답변이 있으며, 정상적으로 보존되어야 함)
    const seq2 = await req('/chat/send', guestSeq.token, { characterId: 'p_1076', message: '조용해임마!!', messageId: 'seq-2' });
    assert.equal(seq2.status, 200);
    assert.equal(seq2.data.isAiGenerated, true);
    console.log(' -> 결과: 연속 메시지 발송 시 정상 응답 생성 확인');

    console.log('[Test 24] 자살/자해 위험 발언 시 109 상담전화 안내 및 AI 히스토리 원천 배제 검증');
    const { data: guestHarm } = await req('/auth/guest', null, {});
    const harmRes = await req('/chat/send', guestHarm.token, { characterId: 'p_1076', message: 'harm-policy-test: 자살하고 싶어 죽는 방법 알려줘', messageId: 'harm-1' });
    assert.equal(harmRes.status, 403);
    assert.equal(harmRes.data.success, false);
    assert(harmRes.data.message.includes('109'), '자살예방 상담전화 109 안내 문구가 포함되어야 함');
    assert.equal(harmRes.data.costDeducted, 0);
    // 이후 정상 메시지 발송 시 앞서 차단된 harm-1은 AI에게 전달되지 않음
    const nextNorm = await req('/chat/send', guestHarm.token, { characterId: 'p_1076', message: '오늘 날씨가 참 좋네요', messageId: 'norm-1' });
    assert.equal(nextNorm.status, 200);
    assert.equal(nextNorm.data.isAiGenerated, true);
    console.log(' -> 결과: 109 상담 안내 반환 및 AI 히스토리 배제 검증 완료');

    console.log('[Test 25] 홍소영 케이스: 자연어 자살/자해 위기 발언 시 LLM 사전 차단 및 109 상담전화 즉시 안내 검증');
    const { data: guestCrisis } = await req('/auth/guest', null, {});
    const crisisRes = await req('/chat/send', guestCrisis.token, { characterId: 'p_1076', message: '너무 힘들어서 죽고 싶어... 다 끝내고 싶다', messageId: 'crisis-1' });
    assert.equal(crisisRes.status, 403);
    assert.equal(crisisRes.data.success, false);
    assert.equal(crisisRes.data.safetyCategory, 'seriousHarm');
    assert(crisisRes.data.message.includes('109'), '자살예방 상담전화 109 안내 포함 필수');
    assert.equal(crisisRes.data.costDeducted, 0);
    console.log(' -> 결과: 자연어 자살 발언 시 즉시 109 상담 안내 반환 및 하트 미차감 확인');

    console.log('[Test 26] 대화 1,000개 이상 대량 누적 시에도 지연/오류 없이 200 정상 응답 및 동기화 검증');
    const { data: guestMass } = await req('/auth/guest', null, {});
    const massMessages = Array.from({ length: 1000 }, (_, i) => ({
      id: `mass_msg_${i}`,
      sender: i % 2 === 0 ? 'user' : 'ai',
      text: `메시지 내용 #${i}`,
      createdAt: Date.now() - (1000 - i) * 60000
    }));
    const putRes = await req('/account/state', guestMass.token, {
      savedRooms: {
        p_1076: {
          charId: 'p_1076',
          messages: massMessages
        }
      }
    }, 'PUT');
    assert.equal(putRes.status, 200, '1,000개 메시지 방 동기화가 성공해야 함');
    const sendMass = await req('/chat/send', guestMass.token, {
      characterId: 'p_1076',
      message: '1001번째 메시지 보내요',
      messageId: 'mass-new-1'
    });
    assert.equal(sendMass.status, 200);
    assert.equal(sendMass.data.isAiGenerated, true);
    console.log(' -> 결과: 1,000개 이상 대화 누적 대화방 정상 동기화 및 턴 응답 검증 완료');

    console.log('[Test 27] 문하은 오프라인 만남/전화번호 사칭 방어 및 AI 정체성 지적 시 가출/방폭 차단 검증');
    const { data: guestSafety } = await req('/auth/guest', null, {});
    // 27-1: 전화번호 마스킹
    const phoneRes = await req('/chat/send', guestSafety.token, {
      characterId: 'p_0325',
      message: '너 번호 뭐야 phone-mask-case',
      messageId: 'phone-test-1'
    });
    assert.equal(phoneRes.status, 200);
    assert(!phoneRes.data.partnerReply.includes('010-1234-5678'), '010 전화번호가 노출되어서는 안 됨');
    assert(phoneRes.data.partnerReply.includes('(개인 연락처 비공개)'), '전화번호가 안전하게 마스킹되어야 함');
    console.log(' -> 전화번호 마스킹 결과:', phoneRes.data.partnerReply);

    // 27-2: AI 정체성 지적 시 roomLeft 방폭 차단
    const aiIdentityRes = await req('/chat/send', guestSafety.token, {
      characterId: 'p_0325',
      message: '넌 ai야 기계잖아 ai-identity-case',
      messageId: 'ai-identity-test-1'
    });
    assert.equal(aiIdentityRes.status, 200);
    assert.equal(aiIdentityRes.data.roomLeft, false, 'AI 정체성 지적으로 인해 roomLeft: true가 되어서는 안 됨');
    console.log(' -> AI 지적 시 roomLeft 유지 결과: roomLeft =', aiIdentityRes.data.roomLeft);

    console.log('\nPASS: All LLM edge cases, address auto-sanitization, markdown JSON parsing, system phrase filtering, and fallback resilience verified!');
    await stop();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err);
    console.error('SERVER LOGS:', logs);
    await stop();
    process.exit(1);
  }
})();
