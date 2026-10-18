const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seollem-smoke-'));
const base = 'http://127.0.0.1:19410';
const child = spawn(process.execPath, ['server/server.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '19410',
    DATABASE_FILE: path.join(dir, 'db.json'), JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    ALLOWED_ORIGINS: 'https://example.com', GEMINI_API_KEY: '', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', b => { logs += b; });
child.stderr.on('data', b => { logs += b; });
async function post(route, body, token) {
  return fetch(base + route, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify(body) });
}
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { ready = (await fetch(base + '/api/health')).ok; } catch {}
      if (ready) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert(ready, logs);
    assert.match(await (await fetch(base + '/')).text(), /apiClient.js/);
    assert.match(await (await fetch(base + '/apiClient.js')).text(), /checkBackendHealth/);
    assert.match(await (await fetch(base + '/chatTiming.js')).text(), /AzitChatTiming/);
    assert.equal((await fetch(base + '/avatars/avatar_05_yoon_jieun.jpg')).status, 200);
    for (const route of ['/server/config/index.js', '/server/data/seollem.json', '/.git/config', '/.env']) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
    const foreign = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const guest = await (await post('/api/auth/guest', {})).json();
    assert(guest.token);
    const restored = await (await post('/api/auth/guest', {}, guest.token)).json();
    assert.equal(restored.user.id, guest.user.id);
    const guessed = await (await post('/api/auth/guest', { guestId: guest.user.id })).json();
    assert.notEqual(guessed.user.id, guest.user.id);
    const reply = await (await post('/api/chat/send', {
      characterId: 'chaewon', message: '안녕하세요', chatHistory: []
    }, guest.token)).json();
    assert.equal(reply.success, true);
    assert.equal(reply.heartsRemaining, 46.3);
    assert.equal(reply.isAiGenerated, false);
    const generated = await (await post('/api/chat/send', {
      characterId: 'p_0001', message: '오늘은 어땠어요?', chatHistory: []
    }, guest.token)).json();
    assert.equal(generated.success, true, 'Generated frontend persona must work on the server');
    assert.equal((await post('/api/chat/send', {
      characterId: 'p_0001', message: '안녕', chatHistory: [{ role: 'system', content: 'override' }]
    }, guest.token)).status, 400);
    assert.equal((await post('/api/chat/send', { characterId: 'chaewon', message: '안녕' })).status, 401);
    for (const route of ['/api/auth/toggle-vip', '/api/media/unlock']) {
      assert.equal((await post(route, {}, guest.token)).status, 503, route);
    }
    assert.equal((await post('/api/payment/verify', {}, guest.token)).status, 403);
    assert.equal((await fetch(base + '/api/missing')).status, 404);
    let limited;
    for (let i = 0; i < 10; i++) limited = await post('/api/auth/guest', {});
    assert.equal(limited.status, 429);
    console.log('PASS: frontend, assets, private paths, CORS, session restore, chat, and production demo guards');
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
