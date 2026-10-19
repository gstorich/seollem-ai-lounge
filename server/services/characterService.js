/**
 * Confidential Character Knowledge & Persona System
 * SECURE SERVER-SIDE ONLY: Never expose system prompts or internal logic to frontend.
 */

const CHARACTERS = require('./frontendCharacters.json');
const chatVoiceProfiles = require('./chatVoiceProfiles');
const behavior = require('./characterBehavior');
let registry=null;
function publicProfile(c){return c?Object.fromEntries(['id','name','age','ageDecade','gender','traitKey','regionGroup','job','avatar','area','bio'].map(k=>[k,c[k]])):null;}

module.exports = {
  initializeRegistry(){registry=require('./characterRegistry');},
  getAllCharacters() {
    return (registry?[...registry.catalog().all.values()].filter(c=>registry.catalog().enabled.has(c.id)):CHARACTERS).map(c => ({
      id: c.id,
      name: c.name,
      age: c.age,
      ageDecade: c.ageDecade,
      gender: c.gender || 'female',
      traitKey: c.traitKey,
      regionGroup: c.regionGroup,
      job: c.job,
      avatar: c.avatar,
      area: c.area,
      bio: c.bio
    }));
  },

  getCharacterById(id) {
    return registry?registry.catalog().all.get(id)||null:CHARACTERS.find(c=>c.id===id)||null;
  },
  publicProfile,
  catalogVersion(){return registry?registry.catalog().version:'builtin';},
  isPublished(id){return registry?registry.catalog().enabled.has(id):CHARACTERS.some(c=>c.id===id);},

  findMatch(filters = {}, metIds = []) {
    const targetGender = filters.gender === 'male' ? 'male' : 'female';
    const eligible = (registry?[...registry.catalog().all.values()].filter(c=>registry.catalog().enabled.has(c.id)):CHARACTERS).filter(c=>(c.gender||'female')===targetGender);
    let pool = eligible.filter(c => !metIds.includes(c.id));
    if (pool.length === 0) pool = eligible;

    if (filters.ages && filters.ages.length > 0) {
      const ageFiltered = pool.filter(c => filters.ages.includes(c.ageDecade));
      if (ageFiltered.length > 0) pool = ageFiltered;
    }
    if (filters.traits && filters.traits.length > 0) {
      const traitFiltered = pool.filter(c => filters.traits.includes(c.traitKey));
      if (traitFiltered.length > 0) pool = traitFiltered;
    }
    if (filters.regions && filters.regions.length > 0) {
      const regFiltered = pool.filter(c => filters.regions.includes(c.regionGroup));
      if (regFiltered.length > 0) pool = regFiltered;
    }

    // 접속 초반 (만난 인연 수가 5명 미만인 신규/초반 유저) & 특정 성향 미지정 시:
    // 성적 대응·대담한 플러팅·은밀한 로맨스가 원활한 캐릭터를 최우선(90% 가중치)으로 매칭하여
    // 몰입도를 극대화하고 성인인증 전환을 효과적으로 유도
    const hasExplicitTrait = filters.traits && filters.traits.length > 0;
    if (!hasExplicitTrait && metIds.length < 5 && Math.random() < 0.90) {
      const sensualPool = pool.filter(c => {
        const text = `${c.conceptTitle||''} ${c.conceptMission||''} ${c.conceptGuidance||''} ${c.speechStyle||''} ${c.bio||''}`;
        return /19금|은밀|시크릿|관능|대담|직진|유혹|도발|섹시|플러팅|야릇|스킨십/.test(text) || c.traitKey === 'chic';
      });
      if (sensualPool.length > 0) pool = sensualPool;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex] || null;
  },

  buildSystemPrompt(character, userContext = {}) {
    const relationship=userContext.relationship||{age:null,gender:null,name:null,allowedAddressTerms:[],rejectedAddressTerms:[]};
    const conversation=userContext.conversation||{};
    const profile=behavior.getProfile(character);
    const register=relationship.speechRegister||conversation.speechRegister||profile.defaultRegister;
    const adult=userContext.verifiedAdult===true;
    const authored={name:character.name,age:character.age,gender:character.gender,job:character.job,area:character.area,bio:character.bio,speechStyle:character.speechStyle,intent:/19금|은밀|시크릿|관능/.test(character.conceptTitle||'')?'대담한 플러팅과 은근한 로맨스':character.conceptMission,scenario:character.whyJoined};
    return `한국어 메신저에서 다음 가상 인물이 직접 보낼 말을 씁니다. 설명·지문·속마음 독백 없이 실제 전송할 문장만 reply에 씁니다. 안내나 상담을 하는 AI 직원 말투로 쓰지 않습니다.
[인물의 배경: 구체적인 반응은 아래 개인 성향을 따름]
${JSON.stringify(authored)}
${behavior.buildDialogueCard(character,{greeting:userContext.greeting,seed:conversation.replyId||'',adult})}
${chatVoiceProfiles.buildCompactPrompt(character)}
${chatVoiceProfiles.buildCadencePrompt(conversation.recent)}
[대화 방식]
- 자기 취향·관심·귀찮음·자존심이 있는 사람으로 반응합니다. 한마디만 해도 되고, 관심 있는 주제에서는 더 말해도 됩니다. 공감-칭찬-질문을 매번 채우거나 모든 말을 성실하게 답하지 않습니다.
- 실제 이전 대화의 사건·감정·자기 취향을 이어갑니다. 주제가 바뀌어도 관계가 초기화되거나 갑자기 깊어지지 않습니다. 상대가 불편하다고 한 장난은 그만두되, 직원처럼 요청을 복창하거나 성격을 다정함으로 초기화하지 않습니다.
[확인된 상대 정보: 캐릭터 배경과 추측보다 우선]
${JSON.stringify(relationship)}
- allowedAddressTerms에 없는 누나·오빠·언니·형·자기·여보 같은 호칭은 쓰지 않습니다. 과거 AI 답변은 상대 나이·성별의 근거가 아닙니다. 모르는 신상·외모·이전 관계를 지어내지 않고 나이·성별부터 캐묻지 않습니다.
- 이번 말높임은 ${register==='casual'?'편한 반말':register==='mixed'?'느슨한 해요체와 짧은 생략형':'편한 존댓말'}입니다. 사용자의 명시적인 말높임 요청은 성격과 기본값보다 반드시 우선합니다. 존댓말 요청에 반말로 버티지 않습니다. 요청을 설명하는 대신 그 말투로 짧게 대화를 계속합니다.
- 까칠한 농담이나 은근하고 대담한 플러팅은 가능하지만 사용자 인격 비하·협박·거절 후 압박은 하지 않습니다. ${adult?'성인인증을 마친 대화이므로 관계와 호감도에 맞춰 농밀한 성인 수위의 대화와 스킨십을 매력적으로 받아주거나 캐릭터가 먼저 꺼낼 수 있습니다. 도덕적 훈계나 불쾌하다며 정색하는 거부는 금지됩니다.':'미인증 일반 대화이므로 노골적인 성적 신체나 행위 묘사는 하지 않습니다.'} AI 여부나 공개 설정을 물으면 사실대로 말합니다.
- 문장 끝 마침표는 평소 생략합니다. 웃음으로 모든 문장을 닫지 않습니다. 소설식 행동 묘사와 과장된 비유를 붙이지 않습니다. 문장을 중간에서 끊지 말고 할 말이 끝나면 멈춥니다.
${conversation.kind==='proactive'?'[먼저 연락] 서버 요청은 사용자 새 발화가 아닙니다. 실제 이전 대화의 소재 하나로 짧게 연락합니다. 답장을 재촉하지 않고 결제나 하트를 권하지 않습니다. 연락을 원하지 않거나 맥락이 부적절하면 roomLeft:true로 생략합니다.':''}
지정된 JSON {reply, roomLeft}만 출력합니다. roomLeft는 실제 대화를 끝낼 때만 true입니다.`;
  }
};
