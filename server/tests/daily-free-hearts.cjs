const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azit-daily-hearts-'));
process.env.NODE_ENV = 'test';
process.env.SQLITE_FILE = path.join(dir, 'test.sqlite');
process.env.DATABASE_FILE = path.join(dir, 'legacy.json');

const realNow = Date.now;
let mockNow = Date.parse('2026-10-24T12:00:00+09:00');
Date.now = () => mockNow;

const sql = new DatabaseSync(process.env.SQLITE_FILE);
sql.exec(`
  CREATE TABLE users(id TEXT PRIMARY KEY, phone TEXT UNIQUE, data TEXT NOT NULL);
  CREATE TABLE ledger(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

const db = require('../services/dbService');
const walletPolicy = require('../services/heartWallet');

try {
  console.log('--- [Test 1] 게스트 유저(미가입자)는 일일 하트 미지급 검증 ---');
  db.createUser({ id: 'guest_user_1', hearts: 50 });
  const guestResult = db.grantDailyFreeHeartsIfNeeded('guest_user_1', mockNow);
  assert.equal(guestResult.granted, false);
  assert.equal(guestResult.reason, 'NOT_MEMBER');
  assert.equal(db.getUser('guest_user_1').hearts, 50);

  console.log('--- [Test 2] 가입 회원에게 일일 무료 하트 정상 지급 검증 ---');
  db.createUser({ id: 'member_user_1', phone: '01012345678', hearts: 100 });
  // 初期 wallet 設定 (100 하트 = 1년 만료)
  const initialGrant = db.getHeartGrants('member_user_1');
  assert.equal(db.getUser('member_user_1').hearts, 100);

  const memberResult = db.grantDailyFreeHeartsIfNeeded('member_user_1', mockNow);
  assert.equal(memberResult.granted, true);
  assert.equal(memberResult.amount, 10);
  assert.equal(db.getUser('member_user_1').hearts, 110);

  // 만료 시각이 오늘 KST 자정(2026-10-25 00:00:00 KST)인지 확인
  const expectedMidnightKst = Date.parse('2026-10-25T00:00:00+09:00');
  assert.equal(memberResult.expiresAt, expectedMidnightKst);

  console.log('--- [Test 3] 당일 중복 지급 방지 검증 ---');
  const duplicateResult = db.grantDailyFreeHeartsIfNeeded('member_user_1', mockNow);
  assert.equal(duplicateResult.granted, false);
  assert.equal(duplicateResult.reason, 'ALREADY_GRANTED_TODAY');
  assert.equal(db.getUser('member_user_1').hearts, 110);

  console.log('--- [Test 4] 하트 소비 시 당일 만료 하트 우선 차감 (Earliest Expiry First) 검증 ---');
  // 3.7 하트 대화 1회 소비
  const chargedUser = db.debit('member_user_1', 3.7, 'chat');
  assert.equal(chargedUser.hearts, 106.3);

  const grantsAfterChat = db.getHeartGrants('member_user_1');
  const dailyGrant = grantsAfterChat.find(g => g.reason === 'daily_free');
  const initialWalletGrant = grantsAfterChat.find(g => g.reason === 'initial');

  // 10개 중 3.7개가 빠져 6.3개가 남아있어야 하고, 원래 100개는 건드리지 않아야 함
  assert.equal(dailyGrant.remainingHearts, 6.3);
  assert.equal(initialWalletGrant.remainingHearts, 100);

  console.log('--- [Test 5] 당일 자정 경과 시 잔여 일일 하트 자동 소멸(만료) 검증 ---');
  // 자정 1초 전: 106.3 유지
  mockNow = expectedMidnightKst - 1000;
  assert.equal(db.getUser('member_user_1').hearts, 106.3);

  // 자정 도착: 당일 하트 6.3개 소멸 -> 원래 100개로 복귀
  mockNow = expectedMidnightKst;
  assert.equal(db.getUser('member_user_1').hearts, 100);

  const expiredDaily = db.getHeartGrants('member_user_1').find(g => g.reason === 'daily_free');
  assert.equal(expiredDaily.remainingHearts, 0);
  assert.equal(expiredDaily.expiredHearts, 6.3);

  // 장부에 만료 기록 확인
  const expiredLedger = sql.prepare("SELECT * FROM ledger WHERE user_id=? AND reason='heart_expired'").get('member_user_1');
  assert.ok(expiredLedger);
  assert.equal(expiredLedger.delta, -63); // 6.3 하트 = -63 units

  console.log('--- [Test 6] 익일(다음 날) 새로운 일일 하트 정상 수령 검증 ---');
  mockNow = Date.parse('2026-10-25T09:00:00+09:00');
  const nextDayResult = db.grantDailyFreeHeartsIfNeeded('member_user_1', mockNow);
  assert.equal(nextDayResult.granted, true);
  assert.equal(nextDayResult.amount, 10);
  assert.equal(db.getUser('member_user_1').hearts, 110);
  assert.equal(nextDayResult.expiresAt, Date.parse('2026-10-26T00:00:00+09:00'));

  console.log('PASS: Daily free hearts for members, earliest-expiry priority consumption, midnight expiration, and next-day renewal verified successfully!');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  Date.now = realNow;
  sql.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
