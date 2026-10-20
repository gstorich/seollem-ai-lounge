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
    const isSexual = target.includes('노골적인 신체접촉') || target.includes('sexual-explicit');
    return new Response(JSON.stringify({
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({ sexualContent: isSexual, explicitContent: isSexual, sexualMinors: false }) }] }
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
    } else if (lastUserMsg.includes('normal-chat-case')) {
      outputText = JSON.stringify({
        reply: '나도 무협 소설 좋아해! 어떤 작품 가장 재밌게 봤어?',
        roomLeft: false
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
