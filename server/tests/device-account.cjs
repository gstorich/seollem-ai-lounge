const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seollem-device-'));
const capture = path.join(dir, 'sms.json');
const jwtSecret = crypto.randomBytes(48).toString('hex');
const base = 'http://127.0.0.1:19429/api';
let child, logs = '';

const env = {
  ...process.env,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '19429',
  DATABASE_FILE: path.join(dir, 'legacy.json'),
  SQLITE_FILE: path.join(dir, 'test.sqlite'),
  JWT_SECRET: jwtSecret,
  GEMINI_API_KEY: 'synthetic-test-key',
  OPENAI_API_KEY: '',
  ALIGO_API_KEY: 'mock-key',
  ALIGO_USER_ID: 'mock-user',
  ALIGO_SENDER: '01000000000',
  SMS_CAPTURE_FILE: capture
};

async function start() {
  child = spawn(
    process.execPath,
    ['--require', path.join(__dirname, 'mock-sms.cjs'), '--require', path.join(__dirname, 'mock-llm.cjs'), 'server/server.js'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(logs);
}

async function stop() {
  if (child && child.exitCode === null) {
    const exit = new Promise(r => child.once('exit', r));
    child.kill();
    await exit;
  }
}

async function request(route, token, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await res.json();
  if (route === '/auth/guest' && data.token) {
    await fetch(base + '/legal/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ version: '2026-10-20.1', atLeast18: true, termsAccepted: true, privacyAcknowledged: true, aiNoticeAcknowledged: true })
    });
  }
  return { status: res.status, ...data };
}

(async () => {
  try {
    await start();
    const sql = new DatabaseSync(env.SQLITE_FILE);

    // 1. 기기 A에서 최초 접속 (게스트 생성)
    const devA = 'dev_1111222233334444';
    const firstA = await request('/auth/guest', null, { deviceId: devA }, { 'X-Device-Id': devA });
    assert.equal(firstA.status, 200);
    assert.equal(firstA.user.hearts, 50, '최초 접속 시 50하트 지급');
    assert.equal(firstA.restoredByDevice, false);
    const guestIdA = firstA.user.id;

    // 대화 전송하여 하트 3.7 소진 (46.3 남음)
    const chatMsg = { characterId: 'chaewon', message: '안녕하세요 처음 뵙겠습니다.', messageId: 'm_test_dev_1' };
    const sentA = await request('/chat/send', firstA.token, chatMsg);
    assert.equal(sentA.heartsRemaining, 46.3, '대화 후 46.3 남음');

    // 2. 기기 A에서 시크릿 탭 열기 시뮬레이션 (토큰/쿠키 없이 동일한 deviceId로만 요청)
    const incognitoA = await request('/auth/guest', null, { deviceId: devA }, { 'X-Device-Id': devA });
    assert.equal(incognitoA.status, 200);
    assert.equal(incognitoA.restoredByDevice, true, '시크릿 탭에서도 기기 단위로 복원');
    assert.equal(incognitoA.user.id, guestIdA, '새 계정이 아닌 기존 계정으로 연결');
    assert.equal(incognitoA.user.hearts, 46.3, '하트 50개가 새로 생기지 않고 46.3 유지');

    // 3. 다른 기기 B에서 접속 시뮬레이션
    const devB = 'dev_5555666677778888';
    const firstB = await request('/auth/guest', null, { deviceId: devB }, { 'X-Device-Id': devB });
    assert.equal(firstB.status, 200);
    assert.notEqual(firstB.user.id, guestIdA, '다른 기기는 독립된 계정 발급');
    assert.equal(firstB.user.hearts, 50, '새 기기는 50하트 지급');

    // 4. 기기 A가 본인인증(linkPhone)을 완료한 후 시크릿 탭으로 새 게스트 접근 시도
    // OTP 발송 및 검증
    const phone = '01012345678';
    const otpRes = await request('/auth/send-otp', firstA.token, { phone });
    assert.equal(otpRes.status, 200);
    const captured = JSON.parse(fs.readFileSync(capture));
    const verifyRes = await request('/auth/verify-otp', firstA.token, {
      phone,
      challengeId: otpRes.challengeId,
      code: captured.code
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.bonusAwarded, true);

    // 이제 기기 A는 정회원(01012345678) 기기임.
    // 시크릿 탭에서 토큰 없이 새 게스트를 요청하면 웰컴 50하트가 중복 발급되지 않고 0하트여야 함!
    const postAuthIncognito = await request('/auth/guest', null, { deviceId: devA }, { 'X-Device-Id': devA });
    assert.equal(postAuthIncognito.status, 200);
    assert.equal(postAuthIncognito.user.hearts, 0, '이미 웰컴 하트를 소진/인증한 기기에서는 새 게스트에 50하트 미지급 (0하트)');

    console.log('PASS: Guest accounts bound by device, incognito 50-heart farming blocked successfully');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
