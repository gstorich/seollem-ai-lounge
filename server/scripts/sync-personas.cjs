// Export the deterministic frontend catalog so every displayed ID works on the API.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const AVATARS_20_30');
const marker = 'const CHARACTERS = buildAllCharacters();';
const end = html.indexOf(marker);
if (start < 0 || end < start) throw new Error('Persona catalog boundaries changed');
const catalog = vm.runInNewContext(html.slice(start, end + marker.length) + '; JSON.stringify(CHARACTERS)', {}, { timeout: 3000 });
const fields = ['id', 'name', 'age', 'ageDecade', 'traitKey', 'regionGroup', 'job', 'avatar', 'area', 'bio', 'speechStyle', 'whyJoined', 'crushTrigger', 'conceptTitle', 'conceptMission', 'conceptGuidance'];
const characters = JSON.parse(catalog).map(c => Object.fromEntries(fields.map(key => [key, c[key]])));
if (characters.length !== 1250 || new Set(characters.map(c => c.id)).size !== characters.length) throw new Error('Unexpected persona catalog');
fs.writeFileSync(path.join(root, 'server/services/frontendCharacters.json'), JSON.stringify(characters) + '\n');
console.log(`Synchronized ${characters.length} frontend personas`);

const giftStart = html.indexOf('const GIFT_CATALOG =');
const giftEnd = html.indexOf('const NON_FACE_DAILY_PHOTOS', giftStart);
const gifts = JSON.parse(vm.runInNewContext(html.slice(giftStart, giftEnd) + '; JSON.stringify(GIFT_CATALOG)', {}, { timeout: 1000 }));
fs.writeFileSync(path.join(root, 'server/services/gifts.json'), JSON.stringify(gifts) + '\n');
