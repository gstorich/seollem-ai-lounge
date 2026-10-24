// Export the deterministic frontend catalog so every displayed ID works on the API.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Synchronize gifts catalog
const giftStart = html.indexOf('const GIFT_CATALOG =');
const giftEnd = html.indexOf('const NON_FACE_DAILY_PHOTOS', giftStart);
if (giftStart >= 0 && giftEnd > giftStart) {
  const gifts = JSON.parse(vm.runInNewContext(html.slice(giftStart, giftEnd) + '; JSON.stringify(GIFT_CATALOG)', {}, { timeout: 1000 }));
  fs.writeFileSync(path.join(root, 'server/services/gifts.json'), JSON.stringify(gifts) + '\n');
  console.log('Synchronized gifts catalog');
}

// Synchronize all 2,356 personas with Deep Life Narratives (Backstory, Philosophy, Core Wound, Taboo)
execFileSync(process.execPath, [path.join(__dirname, 'sync-all-personas.cjs')], { stdio: 'inherit' });
