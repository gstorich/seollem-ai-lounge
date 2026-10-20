const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');

process.env.DATABASE_FILE = path.join(__dirname, 'tmp-acq.json');
process.env.SQLITE_FILE = path.join(__dirname, 'tmp-acq.sqlite');
for (const f of [process.env.DATABASE_FILE, process.env.SQLITE_FILE, process.env.SQLITE_FILE + '-wal', process.env.SQLITE_FILE + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const db = require('../services/dbService');
const ops = require('../services/operationsService');

async function run() {
  console.log('--- Testing User Acquisition & UTM Tracking ---');

  // 1. Visit only (bounced visit without starting chat)
  const visitBounced = db.recordVisit({
    utm_source: 'meta_ads',
    utm_medium: 'paid_social',
    utm_campaign: 'senior_romance_v1',
    utm_content: 'ad_bounced_creative',
    landing_path: '/?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=senior_romance_v1&utm_content=ad_bounced_creative'
  }, { deviceId: 'dev_bounced_user_1', ip: '127.0.0.1', userAgent: 'Mozilla/5.0' });
  assert.ok(visitBounced.id, 'Bounced visit must be recorded');
  assert.equal(visitBounced.isNew, true);

  // 2. Visit that later starts chat
  const devEngaged = 'dev_engaged_user_2';
  const visitEngaged = db.recordVisit({
    utm_source: 'meta_ads',
    utm_medium: 'paid_social',
    utm_campaign: 'senior_romance_v1',
    utm_content: 'ad_younger_romance',
    utm_term: '연상연하',
    referrer: 'https://l.instagram.com/',
    landing_path: '/?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=senior_romance_v1'
  }, { deviceId: devEngaged, ip: '127.0.0.1', userAgent: 'Mozilla/5.0' });
  assert.ok(visitEngaged.id);

  // User later starts chat -> creates guest
  const guestId = 'guest_test_acq_1';
  db.createUser({ id: guestId, hearts: 50, deviceId: devEngaged });
  db.bindVisitUser(devEngaged, guestId);
  db.saveAcquisition(guestId, {
    utm_source: 'meta_ads',
    utm_medium: 'paid_social',
    utm_campaign: 'senior_romance_v1',
    utm_content: 'ad_younger_romance',
    utm_term: '연상연하',
    referrer: 'https://l.instagram.com/',
    landing_path: '/?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=senior_romance_v1'
  }, { deviceId: devEngaged, ip: '127.0.0.1', userAgent: 'Mozilla/5.0' });

  const acq = db.getAcquisition(guestId);
  assert.ok(acq, 'Acquisition record must exist');
  assert.equal(acq.utm_source, 'meta_ads');
  assert.equal(acq.utm_medium, 'paid_social');
  assert.equal(acq.utm_campaign, 'senior_romance_v1');
  assert.equal(acq.utm_content, 'ad_younger_romance');
  assert.equal(acq.utm_term, '연상연하');
  assert.equal(acq.referrer, 'https://l.instagram.com/');
  assert.equal(acq.device_id, devEngaged);

  // Check user object has acquisition
  const user = db.getUser(guestId);
  assert.ok(user.acquisition, 'User object should retain acquisition');
  assert.equal(user.acquisition.source, 'meta_ads');

  // 3. Direct guest should default to direct/none
  const guestDirect = 'guest_test_direct';
  db.createUser({ id: guestDirect, hearts: 50 });
  db.saveAcquisition(guestDirect, { source: 'direct', medium: 'none' });
  const directAcq = db.getAcquisition(guestDirect);
  assert.equal(directAcq.utm_source, 'direct');
  assert.equal(directAcq.utm_medium, 'none');

  // If a direct guest later arrives with UTM, it should upgrade
  db.saveAcquisition(guestDirect, {
    source: 'naver',
    medium: 'organic',
    campaign: 'brand_search'
  });
  const upgradedAcq = db.getAcquisition(guestDirect);
  assert.equal(upgradedAcq.utm_source, 'naver');
  assert.equal(upgradedAcq.utm_medium, 'organic');
  assert.equal(upgradedAcq.utm_campaign, 'brand_search');

  // 4. User engaging in chat turns
  db.appendMessages(guestId, 'char_1', [
    { id: 'm1', sender: 'user', text: '안녕', createdAt: Date.now() },
    { id: 'm2', sender: 'ai', text: '반가워', createdAt: Date.now() }
  ]);

  // 5. Link Phone & Inheritance
  const phone = '01099998888';
  const linkResult = db.linkPhone(guestId, phone);
  assert.ok(linkResult.user, 'Link phone should succeed');
  assert.equal(linkResult.user.id, phone);

  // The acquisition record must now belong to the phone user
  const phoneAcq = db.getAcquisition(phone);
  assert.ok(phoneAcq, 'Phone user must inherit acquisition');
  assert.equal(phoneAcq.utm_source, 'meta_ads');
  assert.equal(phoneAcq.utm_campaign, 'senior_romance_v1');

  // Old guest id should no longer have orphan acquisition
  const oldAcq = db.sql.prepare('SELECT * FROM user_acquisitions WHERE user_id=?').get(guestId);
  assert.equal(oldAcq, undefined, 'Old guest acquisition row should be deleted or migrated');

  // 6. Acquisition Stats aggregation (includes bounced visits)
  const stats = db.getAcquisitionStats(30);
  assert.ok(stats.summary, 'Summary stats must exist');
  assert.equal(stats.summary.totalVisits, 3); // 1 bounced + 1 engaged(now phone) + 1 direct
  assert.equal(stats.summary.bounceCount, 1); // 1 bounced visit without chat
  assert.equal(stats.summary.chatStartedCount, 2); // 2 started chat (phone + direct)
  assert.equal(stats.summary.engagedCount, 1); // 1 engaged in chat turns
  assert.equal(stats.summary.memberCount, 1); // 1 converted to phone member

  // Check sources breakdown
  const metaSource = stats.sources.find(s => s.source === 'meta_ads');
  assert.ok(metaSource, 'meta_ads source must be aggregated');
  assert.equal(metaSource.visits, 2); // 1 bounced + 1 chat
  assert.equal(metaSource.bounces, 1);
  assert.equal(metaSource.chatStarted, 1);
  assert.equal(metaSource.engaged, 1);
  assert.equal(metaSource.converted, 1);

  // Check campaigns breakdown
  const seniorCampaign = stats.campaigns.find(c => c.campaign === 'senior_romance_v1');
  assert.ok(seniorCampaign, 'senior_romance_v1 campaign must be aggregated');
  assert.equal(seniorCampaign.visits, 2);
  assert.equal(seniorCampaign.bounces, 1);

  // Check contents breakdown
  const bouncedContent = stats.contents.find(c => c.content === 'ad_bounced_creative');
  assert.ok(bouncedContent, 'ad_bounced_creative must be captured in contents');
  assert.equal(bouncedContent.visits, 1);
  assert.equal(bouncedContent.bounces, 1);
  assert.equal(bouncedContent.chatStarted, 0);

  // Check recentLogs includes bounced visits
  assert.ok(stats.recentLogs.length >= 3, 'Recent logs must have all visits including bounces');
  const bouncedLog = stats.recentLogs.find(l => l.device_id === 'dev_bounced_user_1');
  assert.ok(bouncedLog, 'Bounced visit must appear in recent logs');
  assert.equal(bouncedLog.bounced, 1);
  assert.equal(bouncedLog.user_id, null);

  // 7. Check Operations service integration
  const customerDetail = ops.customer(phone);
  assert.ok(customerDetail.acquisition, 'Customer detail must include acquisition info');
  assert.equal(customerDetail.acquisition.utm_source, 'meta_ads');
  assert.equal(customerDetail.acquisition.utm_campaign, 'senior_romance_v1');

  const usersList = ops.users('010', 0, 'members', 'all');
  assert.ok(usersList.items.length > 0, 'Users list should return phone member');
  assert.equal(usersList.items[0].utmSource, 'meta_ads');
  assert.equal(usersList.items[0].utmCampaign, 'senior_romance_v1');

  console.log('PASS: Acquisition storage, bounced visit capture, UTM tracking, inheritance upon phone link, statistics aggregation and ops integration verified.');

  // 8. Test /api/auth/visit and Bot Crawler filtering
  console.log('--- Testing /api/auth/visit & Crawler Bot Filtering ---');
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seollem-bot-test-'));
  const testPort = '19430';
  const testSqlite = path.join(testDir, 'bot.sqlite');
  const botEnv = {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: testPort,
    DATABASE_FILE: path.join(testDir, 'legacy.json'),
    SQLITE_FILE: testSqlite,
    JWT_SECRET: crypto.randomBytes(48).toString('hex')
  };

  const serverProc = spawn(process.execPath, [path.join(__dirname, '../server.js')], { env: botEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      serverProc.stdout.on('data', d => { if (d.toString().includes('Running on Port')) resolve(); });
      serverProc.stderr.on('data', d => {});
      serverProc.on('error', reject);
      setTimeout(() => reject(new Error('Server start timeout')), 5000);
    });

    // 8-1. Normal user landing visit (bounced before chat)
    const visitRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_vis_12345678',
        acquisition: {
          utm_source: 'meta_ads',
          utm_campaign: 'summer_promo'
        }
      })
    });
    const visitData = await visitRes.json();
    assert.equal(visitRes.status, 200);
    assert.equal(visitData.success, true);
    assert.ok(visitData.id);

    // Verify site_visits has this record, but users table is empty!
    const { DatabaseSync } = require('node:sqlite');
    const testDb = new DatabaseSync(testSqlite);
    const visitRow = testDb.prepare("SELECT * FROM site_visits WHERE device_id='dev_vis_12345678'").get();
    assert.ok(visitRow, 'Visit must be saved in site_visits table');
    assert.equal(visitRow.bounced, 1);
    assert.equal(visitRow.user_id, null);
    const userCount = testDb.prepare("SELECT count(*) n FROM users").get().n;
    assert.equal(userCount, 0, 'No user should be created upon pure landing visit');

    // 8-2. Crawler request
    const botRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'meta-externalads/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)'
      },
      body: JSON.stringify({ deviceId: 'dev_bot_12345678' })
    });
    const botVisitData = await botRes.json();
    assert.equal(botVisitData.bot, true);
    const botRow = testDb.prepare("SELECT * FROM site_visits WHERE device_id='dev_bot_12345678'").get();
    assert.equal(botRow, undefined, 'Bot crawlers must not be recorded in site_visits');

    console.log('PASS: /api/auth/visit records bounced visits without creating users; bot crawlers filtered out.');
  } finally {
    serverProc.kill();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  for (const f of [process.env.DATABASE_FILE, process.env.SQLITE_FILE, process.env.SQLITE_FILE + '-wal', process.env.SQLITE_FILE + '-shm']) {
    if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
  }
});
