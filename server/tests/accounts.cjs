const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seollem-accounts-'));
const capture = path.join(dir, 'sms.json');
const jwtSecret = crypto.randomBytes(48).toString('hex');
const base = 'http://127.0.0.1:19411/api';
let child, logs = '';
const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '19411', DATABASE_FILE: path.join(dir,'legacy.json'),
  SQLITE_FILE: path.join(dir,'test.sqlite'), JWT_SECRET: jwtSecret, GEMINI_API_KEY: 'synthetic-test-key', OPENAI_API_KEY: '',
  ALIGO_API_KEY: 'mock-key', ALIGO_USER_ID: 'mock-user', ALIGO_SENDER: '01000000000', SMS_CAPTURE_FILE: capture };
async function start() {
  child = spawn(process.execPath, ['--require', path.join(__dirname,'mock-sms.cjs'), '--require', path.join(__dirname,'mock-llm.cjs'), 'server/server.js'], { cwd: root, env, stdio: ['ignore','pipe','pipe'] });
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  for (let i=0;i<100;i++) { try { if ((await fetch(base+'/health')).ok) return; } catch {} await new Promise(r=>setTimeout(r,50)); }
  throw new Error(logs);
}
async function stop() { if (child && child.exitCode === null) { const exit = new Promise(r=>child.once('exit',r)); child.kill(); await exit; } }
async function request(route, token, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base+route, { method, headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const data = await res.json(); if(route==='/auth/guest'&&data.token)assert.equal((await request('/legal/accept',data.token,{version:'2026-10-20.1',atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true})).status,200); return { status:res.status, ...data };
}
const guest = () => request('/auth/guest', null, {});
const getState = token => request('/account/state', token);
function room(id, text) { return { charId:id, messages:[{id:'m_'+crypto.randomUUID(),sender:'user',text,createdAt:Date.now()}] }; }
async function sendOtp(token, phone) {
  const response = await request('/auth/send-otp', token, {phone});
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.debugCode,undefined);
  const captured = JSON.parse(fs.readFileSync(capture));
  assert.match(captured.body,/아지트챗/);
  assert.equal(captured.phone,phone.replace(/-/g,''));
  return {...response,code:captured.code};
}
async function verify(token, phone, challenge, code=challenge.code) { return request('/auth/verify-otp',token,{phone,challengeId:challenge.challengeId,code}); }
(async () => {
 try {
  fs.writeFileSync(env.DATABASE_FILE,JSON.stringify({users:{legacy_guest:{id:'legacy_guest',hearts:17.4,phone:null,savedRooms:{},metCharIds:[]}},orders:{}}));
  await start();
  const sql = new DatabaseSync(env.SQLITE_FILE);
  sql.exec('PRAGMA busy_timeout=5000;');
  assert.equal(JSON.parse(sql.prepare('SELECT data FROM users WHERE id=?').get('legacy_guest').data).hearts,17.4);
  const a=await guest(), b=await guest();
  assert.equal((await getState()).status,401);
  assert.equal((await request('/account/state',a.token,{savedRooms:{chaewon:room('chaewon','방 A 이전 대화')},hearts:999999,phone:'01099999999',isVipUnlimited:true},'PUT')).status,200);
  assert.equal((await getState(a.token)).user.hearts,50);
  assert.equal((await getState(a.token)).user.phone,null);
  assert.equal((await getState(a.token)).user.isVipUnlimited,false);
  assert.equal(Object.keys((await getState(b.token)).savedRooms).length,0);
  const message={characterId:'chaewon',message:'서버에서 보관될 메시지',messageId:'m_test_idempotent'};
  const sent=await request('/chat/send',a.token,message);
  assert.equal(sent.heartsRemaining,46.3);
  const again=await request('/chat/send',a.token,message);
  assert.equal(again.heartsRemaining,46.3);
  assert.equal(again.replyId,sent.replyId);
  assert.equal((await getState(a.token)).savedRooms.chaewon.messages.filter(m=>m.id===sent.replyId).length,1);
  const otp=await sendOtp(a.token,'010-0000-0001');
  assert.equal((await verify(b.token,'01000000001',otp)).status,400,'challenge bound to requesting browser');
  assert.equal((await request('/auth/send-otp',a.token,{phone:'01000000001'})).status,429,'resend cooldown');
  assert.equal((await verify(a.token,'01000000001',otp,'000000')).status,400);
  const account=await verify(a.token,'01000000001',otp);
  assert.equal(account.status,200,JSON.stringify(account));
  assert.equal(account.user.id,'01000000001');
  assert.equal(account.user.phone,'01000000001');
  assert.equal(account.user.hearts,146.3);
  assert.equal(account.bonusAwarded,true);
  assert.equal((await getState(a.token)).status,401,'old guest JWT revoked');
  const challengeCount = sql.prepare('SELECT count(*) n FROM otp_challenges').get().n;
  const repeatSend = await request('/auth/send-otp',account.token,{phone:'01000000001'});
  assert.equal(repeatSend.status,409,'signed-in account cannot request the same phone OTP');
  assert.equal(repeatSend.error,'ALREADY_AUTHENTICATED');
  assert.equal((await request('/auth/send-otp',account.token,{phone:'01000000004'})).status,409,'switching requires logout');
  assert.equal((await verify(account.token,'01000000001',otp)).status,409,'signed-in account cannot verify again');
  assert.equal(sql.prepare('SELECT count(*) n FROM otp_challenges').get().n,challengeCount,'no extra SMS challenge reserved');
  assert.equal(sql.prepare('SELECT status FROM otp_challenges WHERE id=?').get(otp.challengeId).status,'consumed');
  assert((await getState(account.token)).savedRooms.chaewon.messages.some(m=>m.text==='방 A 이전 대화'));
  assert((await getState(account.token)).savedRooms.chaewon.messages.some(m=>m.text===message.message));
  // Existing phone login restores its own balance and merges new guest conversation, without repeated bonuses.
  await request('/account/state',b.token,{savedRooms:{p_0001:room('p_0001','기기 B 대화')}},'PUT');
  sql.prepare('UPDATE otp_challenges SET created_at=created_at-61000 WHERE phone=?').run('01000000001');
  const second=await sendOtp(b.token,'01000000001');
  const login=await verify(b.token,'01000000001',second);
  assert.equal(login.user.id,account.user.id);
  assert.equal(login.user.hearts,146.3);
  assert.equal(login.bonusAwarded,false);
  assert.equal(sql.prepare('SELECT sum(delta) total FROM ledger WHERE user_id=?').get(login.user.id).total, 1463, 'ledger matches balance after guest merge');
  assert((await getState(login.token)).savedRooms.p_0001);
  assert.equal((await request('/account/state',login.token,{savedRooms:{},hearts:50000,phoneBonusClaimed:false},'PUT')).status,200);
  assert.equal((await getState(login.token)).user.hearts,146.3);
  // Server-priced gift rejects a forged negative price.
  assert.equal((await request('/chat/gift',login.token,{characterId:'chaewon',giftKey:'coffee',giftCost:-9999})).status,402);
  assert.equal((await getState(login.token)).user.hearts,146.3);
  const otpGuest=await guest();
  const attempt=await sendOtp(otpGuest.token,'01000000002');
  for(let i=0;i<5;i++) assert.equal((await verify(otpGuest.token,'01000000002',attempt,'000000')).status,400);
  assert.equal((await verify(otpGuest.token,'01000000002',attempt)).status,400,'attempt limit');
  const expiry=await sendOtp(otpGuest.token,'01000000003');
  sql.prepare('UPDATE otp_challenges SET expires_at=0 WHERE id=?').run(expiry.challengeId);
  assert.equal((await verify(otpGuest.token,'01000000003',expiry)).status,400,'expired OTP');
  // Use another source IP only in this isolated loopback test to avoid the per-IP SMS cap.
  const failRes=await fetch(base+'/auth/send-otp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${otpGuest.token}`,'X-Forwarded-For':'192.0.2.44'},body:JSON.stringify({phone:'01000000999'})});
  assert.equal(failRes.status,502);
  assert.equal(sql.prepare("SELECT status FROM otp_challenges WHERE phone='01000000999'").get().status,'failed');
  assert(!logs.includes(otp.code),'OTP never logged');
  sql.close();
  await stop(); await start();
  const restored=await getState(login.token);
  assert.equal(restored.user.id,'01000000001');
  assert.equal(restored.user.hearts,146.3);
  assert(restored.savedRooms.chaewon && restored.savedRooms.p_0001,'rooms survive restart and cross-device login');
  console.log('PASS: JSON migration, server balances, chat persistence/idempotency, Aligo adapter, OTP session binding/cooldown/expiry/attempts/replay/failure, phone-ID merge, one-time bonus, cross-account isolation and restart recovery');
 } finally { await stop(); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
