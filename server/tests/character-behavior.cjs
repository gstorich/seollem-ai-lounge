const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const behavior=require('../services/characterBehavior'),catalog=require('../services/frontendCharacters.json'),service=require('../services/characterService'),context=require('../services/conversationContext');
const groups=new Map(),signatures=new Set();
for(const character of catalog){
 const p=behavior.getProfile(character);assert.deepEqual(p,behavior.getProfile(character));signatures.add(JSON.stringify(p));
 const key=character.gender+':'+character.traitKey;if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(p.key);
}
for(const [key,values]of groups)assert(values.size>=4,key+' must not collapse to one demeanor');
assert.equal(new Set(catalog.map(c=>behavior.getProfile(c).opinions.mint)).size,3,'Personal opinions must include agreement, disagreement and indifference');
assert(signatures.size>catalog.length*.5,'Large cast needs combined behaviors, not ten identical scripts');
const sample=catalog[0],restarted=JSON.parse(execFileSync(process.execPath,['-e','process.stdout.write(JSON.stringify(require(process.argv[1]).getProfile(JSON.parse(process.argv[2]))))',require.resolve('../services/characterBehavior'),JSON.stringify(sample)],{encoding:'utf8'}));assert.deepEqual(restarted,behavior.getProfile(sample));
for(const gender of ['male','female'])for(const key of ['brat','bold','dry','awkward']){
 const c=catalog.find(c=>c.gender===gender&&behavior.getProfile(c).key===key);assert(c,gender+':'+key);
 const prompt=service.buildSystemPrompt(c,{greeting:true,conversation:{replyId:'room_a'}});
 assert(prompt.includes(c.speechStyle));assert(prompt.includes(behavior.getProfile(c).want));assert(prompt.includes('가상 예시이며 사건·취향·사용자 사실로 기억하지 않음'));assert(!prompt.includes('합의 전에는 편한 해요체'));
 assert(!Object.hasOwn(service.getAllCharacters().find(x=>x.id===c.id),'behaviorProfile'),'Public profile does not leak internal examples');
 const variants=new Set(Array.from({length:20},(_,i)=>behavior.buildPrompt(c,{greeting:true,seed:'room_'+i}).split('[이 방의 첫마디 연출]')[1]));assert(variants.size>=2,'Opening beat may vary without changing the character');
}
const polite=context.buildPrompt({...context.prepare([{id:'u',role:'user',content:'존댓말로 해주세요'}],null),speechRegister:'polite',defaultRegister:'casual'});assert(polite.includes('사용자가 존댓말을 명시적으로 요청'));
const casual=context.buildPrompt({...context.prepare([{id:'u',role:'user',content:'안녕'}],null),defaultRegister:'casual'});assert(casual.includes('이 캐릭터의 기본값인 짧고 편한 반말'));
console.log('PASS: stable composite character behaviors, distinct attitudes across genders/traits, authored persona integration, varied opening beats, explicit register precedence and private style examples');
