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
  assert(prompt.includes(voices.buildCompactPrompt(character)), 'All real generation paths share the selected typing profile');
  const publicProfile = service.getAllCharacters().find(c => c.id === character.id);
  assert(!Object.hasOwn(publicProfile, 'typingProfile'), 'Internal voice instructions are not added to the public catalog');
}
// Recent assistant habits affect the next generation request, never rewrite text.
const own=content=>({role:'assistant',content}),user=content=>({role:'user',content});
const repeated=[own('그건 좀 웃긴데 ㅋㅎ'),user('그래?'),own('아 진짜 ㅋㅎ')];
assert(voices.buildCadencePrompt(repeated).includes('이번에는 웃음·대체 이모지 없이'));
assert(voices.buildCadencePrompt([own('재밌네 ㅋㅋ!'),own('그러게 ㅎㅎ')]).includes('웃음·대체 이모지 없이'));
assert.equal(voices.buildCadencePrompt([own('그래 ㅋㅎ')]),'');
assert.equal(voices.buildCadencePrompt([user('ㅋㅋ'),user('ㅎㅎ')]),'');
assert.equal(voices.buildCadencePrompt([own('ㅋㅋ 그랬구나'),own('난 오늘 집에 있었어')]),'');
assert(voices.buildCadencePrompt([own('엥 정말?'),own('엥 몰랐네')]).includes('시작 감탄사가 같았습니다'));
assert.equal(voices.buildCadencePrompt([own('오늘은 바빴어'),own('오래 걸렸네')]),'');
for(const character of [sample,{...sample,creatorDefinition:{},speechStyle:'ㅋㅎ를 자주 쓴다'}]){
 const prompt=service.buildSystemPrompt(character,{conversation:{recent:repeated}});
 assert(prompt.includes('매 답장에 넣는 의무가 아닙니다'));
 assert(prompt.includes('이번에는 웃음·대체 이모지 없이'));
}
console.log(`PASS: ${characters.length} stable identities, ${signatures.size} typing combinations, independent axes in every gender/trait group, restart stability and shared server prompt integration`);
