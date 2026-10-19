const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azit-bandit-test-'));
const sqlitePath = path.join(dir, 'test.sqlite');

(async () => {
  let dbService;
  try {
    process.env.SQLITE_FILE = sqlitePath;
    dbService = require('../services/dbService');
    const characterService = require('../services/characterService');

    // 1. DDL 및 기본 레코드 기록 테스트
    dbService.recordMatchRecommendation('user_1', 'p_0001', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0002', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0003', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0004', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0005', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0006', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0007', 'popular_exploitation', true);
    dbService.recordMatchRecommendation('user_1', 'p_0008', 'cold_exploration', true);
    dbService.recordMatchRecommendation('user_1', 'p_0009', 'cold_exploration', true);
    dbService.recordMatchRecommendation('user_1', 'p_0010', 'cold_exploration', true);

    const stats = dbService.getMatchingBanditStats(30);
    assert.equal(stats.total, 10);
    assert.equal(stats.popular, 7);
    assert.equal(stats.cold, 3);
    assert.equal(stats.popularRatio, 70.0);
    assert.equal(stats.coldRatio, 30.0);

    // 2. characterService.findMatch 동작 및 _matchMode 부착 확인
    const match = characterService.findMatch({ gender: 'female' }, []);
    assert.ok(match, '매칭 결과가 반환되어야 함');
    assert.ok(match._matchMode === 'popular_exploitation' || match._matchMode === 'cold_exploration', '유효한 matchMode가 부착되어야 함');

    // 가상 대화 메시지를 삽입하여 인기 검증 캐릭터 풀(3턴 이상)을 생성
    const testSql = new DatabaseSync(sqlitePath);
    for (let i = 0; i < 5; i++) {
      testSql.prepare('INSERT INTO conversation_messages(user_id, character_id, message_id, data, created_at) VALUES(?,?,?,?,?)')
        .run('user_1', 'seoyeon', `msg_${i}_1`, JSON.stringify({ sender: 'user', text: '안녕' }), Date.now());
    }

    let popCount = 0;
    let coldCount = 0;
    for (let i = 0; i < 200; i++) {
      const m = characterService.findMatch({ gender: 'female' }, []);
      if (m._matchMode === 'popular_exploitation') popCount++;
      else if (m._matchMode === 'cold_exploration') coldCount++;
    }
    assert.equal(popCount + coldCount, 200);
    // 200회 실행 시 70% 기대값은 140회. 50%~90% (100회~180회) 사이인지 검증 (랜덤 편차 허용)
    assert.ok(popCount >= 100 && popCount <= 180, `popular count (${popCount}) should be around 140 (70%)`);
    assert.ok(coldCount >= 20 && coldCount <= 100, `cold count (${coldCount}) should be around 60 (30%)`);

    console.log(`Bandit simulation (200 runs with popular pool): popular=${popCount} (${(popCount/2).toFixed(1)}%), cold=${coldCount} (${(coldCount/2).toFixed(1)}%)`);
    console.log('PASS: 7:3 Multi-Armed Bandit matching recommendation, tracking, and insights');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    try {
      dbService?.close?.();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
