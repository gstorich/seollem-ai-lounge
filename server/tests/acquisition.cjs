const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

process.env.DATABASE_FILE = path.join(__dirname, 'tmp-acq.json');
process.env.SQLITE_FILE = path.join(__dirname, 'tmp-acq.sqlite');
for (const f of [process.env.DATABASE_FILE, process.env.SQLITE_FILE, process.env.SQLITE_FILE + '-wal', process.env.SQLITE_FILE + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const db = require('../services/dbService');
const ops = require('../services/operationsService');

async function run() {
  console.log('--- Testing User Acquisition & UTM Tracking ---');

  // 1. Save and Get Acquisition
  const guestId = 'guest_test_acq_1';
  db.createUser({ id: guestId, hearts: 50 });

  db.saveAcquisition(guestId, {
    utm_source: 'meta_ads',
    utm_medium: 'paid_social',
    utm_campaign: 'senior_romance_v1',
    utm_content: 'ad_younger_romance',
    utm_term: '연상연하',
    referrer: 'https://l.instagram.com/',
    landing_path: '/?utm_source=meta_ads&utm_medium=paid_social&utm_campaign=senior_romance_v1'
  }, { deviceId: 'dev_test_123', ip: '127.0.0.1', userAgent: 'Mozilla/5.0' });

  const acq = db.getAcquisition(guestId);
  assert.ok(acq, 'Acquisition record must exist');
  assert.equal(acq.utm_source, 'meta_ads');
  assert.equal(acq.utm_medium, 'paid_social');
  assert.equal(acq.utm_campaign, 'senior_romance_v1');
  assert.equal(acq.utm_content, 'ad_younger_romance');
  assert.equal(acq.utm_term, '연상연하');
  assert.equal(acq.referrer, 'https://l.instagram.com/');
  assert.equal(acq.device_id, 'dev_test_123');

  // Check user object has acquisition
  const user = db.getUser(guestId);
  assert.ok(user.acquisition, 'User object should retain acquisition');
  assert.equal(user.acquisition.source, 'meta_ads');

  // 2. Direct guest should default to direct/none
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

  // 3. User engaging in chat turns
  db.appendMessages(guestId, 'char_1', [
    { id: 'm1', sender: 'user', text: '안녕', createdAt: Date.now() },
    { id: 'm2', sender: 'ai', text: '반가워', createdAt: Date.now() }
  ]);

  // 4. Link Phone & Inheritance
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

  // 5. Acquisition Stats aggregation
  const stats = db.getAcquisitionStats(30);
  assert.ok(stats.summary, 'Summary stats must exist');
  assert.equal(stats.summary.total, 2); // guestId (now phone) and guestDirect
  assert.equal(stats.summary.utmCount, 2); // meta_ads and naver
  assert.equal(stats.summary.engagedCount, 1); // 1 engaged in chat
  assert.equal(stats.summary.memberCount, 1); // 1 converted to phone member

  // Check sources breakdown
  const metaSource = stats.sources.find(s => s.source === 'meta_ads');
  assert.ok(metaSource, 'meta_ads source must be aggregated');
  assert.equal(metaSource.total, 1);
  assert.equal(metaSource.engaged, 1);
  assert.equal(metaSource.converted, 1);

  // Check campaigns breakdown
  const seniorCampaign = stats.campaigns.find(c => c.campaign === 'senior_romance_v1');
  assert.ok(seniorCampaign, 'senior_romance_v1 campaign must be aggregated');
  assert.equal(seniorCampaign.total, 1);

  // Check contents breakdown
  const romanceContent = stats.contents.find(c => c.content === 'ad_younger_romance');
  assert.ok(romanceContent, 'ad_younger_romance content must be aggregated');

  // Check terms breakdown
  const romanceTerm = stats.terms.find(t => t.term === '연상연하');
  assert.ok(romanceTerm, '연상연하 term must be aggregated');

  // Check recentLogs
  assert.ok(stats.recentLogs.length >= 2, 'Recent logs must have at least 2 entries');
  const recentPhoneLog = stats.recentLogs.find(l => l.user_id === phone);
  assert.ok(recentPhoneLog, 'Phone user entry must be in recent logs');
  assert.equal(recentPhoneLog.utm_source, 'meta_ads');
  assert.equal(recentPhoneLog.phone, phone);

  // 6. Check Operations service integration
  const customerDetail = ops.customer(phone);
  assert.ok(customerDetail.acquisition, 'Customer detail must include acquisition info');
  assert.equal(customerDetail.acquisition.utm_source, 'meta_ads');
  assert.equal(customerDetail.acquisition.utm_campaign, 'senior_romance_v1');

  const usersList = ops.users('010', 0, 'members', 'all');
  assert.ok(usersList.items.length > 0, 'Users list should return phone member');
  assert.equal(usersList.items[0].utmSource, 'meta_ads');
  assert.equal(usersList.items[0].utmCampaign, 'senior_romance_v1');

  console.log('PASS: Acquisition storage, UTM tracking, inheritance upon phone link, statistics aggregation and ops integration verified.');
}

run().finally(() => {
  for (const f of [process.env.DATABASE_FILE, process.env.SQLITE_FILE, process.env.SQLITE_FILE + '-wal', process.env.SQLITE_FILE + '-shm']) {
    if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
  }
});
