const assert = require('node:assert/strict');
const punctuation = require('../services/chatPunctuation');
assert.equal(punctuation('좋아요. 오늘도 재밌었어요.'),'좋아요 오늘도 재밌었어요');
assert.equal(punctuation('진짜요? ㅋㅋ.\n저도요!'),'진짜요? ㅋㅋ\n저도요!');
assert.equal(punctuation('3.7하트, 버전 1.5, example.com, https://예시.한국/a. 를 봐요.'),'3.7하트, 버전 1.5, example.com, https://예시.한국/a. 를 봐요');
assert.equal(punctuation('“좋아요.”라고 했어요. "잠깐요." 저도요...'),'“좋아요.”라고 했어요 "잠깐요." 저도요...');
assert.equal(punctuation("'네.'라는 말, `안녕.`과 「맞아요.」는 인용이에요."),"'네.'라는 말, `안녕.`과 「맞아요.」는 인용이에요");
if (process.env.LLM_COMPLETION_MOCK === '1') {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, options);
    const payload = JSON.parse(options.body);
    if(payload.contents.at(-1).parts[0].text.includes('address-test')){
      calls++;
      const prompt=payload.systemInstruction.parts[0].text;
      assert.ok(prompt.includes('"age":45'));assert.ok(prompt.includes('"gender":"female"'));
      if(payload.contents.at(-1).parts[0].text.includes('부르지'))assert.ok(prompt.includes('"allowedAddressTerms":[]'));
      else assert.ok(prompt.includes('"allowedAddressTerms":["누나"]'));
      return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'오늘은 좀 어땠어요?'}]}}]}));
    }
    if(payload.contents.at(-1).parts[0].text.includes('verbose-test')){
      calls++;
      assert.ok(payload.systemInstruction.parts[0].text.includes('[최우선: 실제 메신저 답장 방식]'));
      const concise=!payload.contents.at(-1).parts[0].text.includes('자세하게');
      return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:concise?'늦게 끝났네요. 밥은 먹었어요?':'오늘 정말 고생 많으셨어요. '.repeat(20)}]}}]}));
    }
    calls++;
    const exhausted = payload.contents.at(-1).parts[0].text === 'limit-test';
    const blocked = payload.contents.at(-1).parts[0].text === 'blocked-test';
    const truncated = exhausted || calls === 1;
    if (calls === 1) assert.equal(payload.generationConfig.maxOutputTokens, 16384);
    if (calls === 2) assert.equal(payload.generationConfig.maxOutputTokens, 16384);
    return new Response(JSON.stringify({ candidates: [{ finishReason: blocked ? 'SAFETY' : truncated ? 'MAX_TOKENS' : 'STOP',
      content: { parts: [{ thought: true, text: 'private internal reasoning' }, { text: blocked ? 'blocked fragment' : truncated ? '말이 중간에서' : '오늘 이야기 즐거웠어요. 다음에도 편하게 이야기해요.' }] } }], usageMetadata: { candidatesTokenCount: 30 } }));
  };
} else {
  const { spawn } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azit-llm-completion-'));
  const root = path.resolve(__dirname, '../..');
  const base = 'http://127.0.0.1:19414/api';
  let child, logs = '';
  async function request(route, token, body) {
    const res = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(res.ok, true, await res.clone().text());
    return res.json();
  }
  (async () => {
    child = spawn(process.execPath, ['--require', __filename, 'server/server.js'], { cwd: root, env: { ...process.env,
      LLM_COMPLETION_MOCK: '1', NODE_ENV: 'test', PORT: '19414', HOST: '127.0.0.1', GEMINI_API_KEY: 'synthetic-test-key', OPENAI_API_KEY: '',
      DATABASE_FILE: path.join(dir, 'legacy.json'), SQLITE_FILE: path.join(dir, 'test.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
    let ready = false;
    for (let i = 0; i < 100; i++) { try { await request('/health'); ready = true; break; } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert.ok(ready, logs);
    const guest = await request('/auth/guest', null, {});
    const characterId = require('../services/characterService').getAllCharacters()[0].id;
    const body = { characterId, message: '오늘 하루 어땠어요?', messageId: 'completion_retry' };
    const reply = await request('/chat/send', guest.token, body);
    assert.equal(reply.partnerReply, '오늘 이야기 즐거웠어요 다음에도 편하게 이야기해요');
    assert.equal(reply.heartsRemaining, 46.3);
    const replay = await request('/chat/send', guest.token, body);
    assert.equal(replay.partnerReply, reply.partnerReply);
    assert.equal(replay.heartsRemaining, 46.3);
    assert.equal((logs.match(/Gemini result:/g) || []).length, 2);
    for (const [message, messageId] of [['limit-test', 'exhausted'], ['blocked-test', 'blocked']]) {
      const result = await request('/chat/send', guest.token, { characterId, message, messageId });
      assert.equal(result.isAiGenerated, false);
      assert.ok(!/말이 중간에서|blocked fragment|private internal reasoning/.test(result.partnerReply));
    }
    assert.equal((logs.match(/Gemini result:/g) || []).length, 5, 'blocked response must not be retried');
    const concise=await request('/chat/send',guest.token,{characterId,message:'verbose-test 퇴근했어요',messageId:'concise'});
    assert.equal(concise.partnerReply,'늦게 끝났네요 밥은 먹었어요?');
    assert.equal(concise.heartsRemaining,35.2,'Shortening must not charge another turn');
    assert.equal((logs.match(/Gemini result:/g)||[]).length,6,'Brief reply must come from a single generation');
    const detailed=await request('/chat/send',guest.token,{characterId,message:'verbose-test 자세하게 설명해주세요',messageId:'detailed'});
    assert.ok(detailed.partnerReply.length>120,'Explicit request for detail must remain available');
    assert.equal((logs.match(/Gemini result:/g)||[]).length,7,'Detail requests must not trigger a shortening generation');
    const male=require('../services/characterService').getAllCharacters().find(c=>c.gender==='male'&&c.age<40);
    const oldMessages=[{id:'self_age',sender:'user',text:'저는 45살 여자예요',createdAt:1},...Array.from({length:25},(_,i)=>({id:'past_'+i,sender:'ai',text:'편하게 이야기해요.',createdAt:i+2}))];
    assert.equal((await fetch(base+'/account/state',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+guest.token},body:JSON.stringify({savedRooms:{[male.id]:{charId:male.id,messages:oldMessages}}})})).status,200);
    await request('/chat/send',guest.token,{characterId:male.id,message:'address-test 오늘 산책했어요',messageId:'established'});
    await request('/chat/send',guest.token,{characterId:male.id,message:'누나라고 부르지 마세요 address-test',messageId:'revoke'});
    assert.equal((logs.match(/Gemini result:/g)||[]).length,9);
    assert.ok(!logs.includes('synthetic-test-key'));
    console.log('PASS: truncated Gemini response regenerated, complete reply persisted, single heart charge and replay, bounded retries, blocked content rejected and thoughts excluded');
  })().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
    if (child && child.exitCode === null) { const stopped = new Promise(r => child.once('exit', r)); child.kill(); await stopped; }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
