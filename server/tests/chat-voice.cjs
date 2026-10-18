const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const voices = require('../services/chatVoiceProfiles');
const characters = require('../services/frontendCharacters.json');

const signatures = new Set();
const groups = new Map();
for (const character of characters) {
  const profile = voices.getProfile(character);
  const signature = JSON.stringify(profile);
  signatures.add(signature);
  assert.deepEqual(profile, voices.getProfile({ ...character, name: '다른 이름', gender: character.gender === 'male' ? 'female' : 'male', age: 50, traitKey: 'different', regionGroup: '다른 지역' }), 'Typing is tied to identity, not a gender/personality/age stereotype');
  const groupKey = `${character.gender}:${character.traitKey}`;
  if (!groups.has(groupKey)) groups.set(groupKey, new Map());
  for (const [axis, value] of Object.entries(profile)) {
    if (axis === 'version') continue;
    if (!groups.get(groupKey).has(axis)) groups.get(groupKey).set(axis, new Set());
    groups.get(groupKey).get(axis).add(value);
  }
}
assert(signatures.size > characters.length * .7, 'Large cast must have combinations, not a few repeated voice presets');
for (const [group, axes] of groups) for (const [axis, choices] of axes) assert(choices.size >= 3, `${group} needs diversity on ${axis}`);
const sample = characters[0];
const restarted = JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).getProfile({id:process.argv[2]})))', require.resolve('../services/chatVoiceProfiles'), sample.id], { encoding: 'utf8' }));
assert.deepEqual(restarted, voices.getProfile(sample), 'Restarts must not change a character’s typing habits');
assert.throws(() => voices.getProfile({}), /Character ID/);
const service = require('../services/characterService');
for (const gender of ['male', 'female']) {
  const character = characters.find(c => c.gender === gender);
  const prompt = service.buildSystemPrompt(character);
  assert(prompt.includes(voices.buildPrompt(character)), 'All real generation paths share the selected typing profile');
  const publicProfile = service.getAllCharacters().find(c => c.id === character.id);
  assert(!Object.hasOwn(publicProfile, 'typingProfile'), 'Internal voice instructions are not added to the public catalog');
}
console.log(`PASS: ${characters.length} stable identities, ${signatures.size} typing combinations, independent axes in every gender/trait group, restart stability and shared server prompt integration`);
