/**
 * Confidential Character Knowledge & Persona System
 * SECURE SERVER-SIDE ONLY: Never expose system prompts or internal logic to frontend.
 */

const CHARACTERS = require('./frontendCharacters.json');

const TRAIT_MAP = {
  warm: { name: '다정·상냥함', short: '다정' },
  calm: { name: '차분·지적인 교양', short: '차분' },
  lively: { name: '유쾌·솔직담백', short: '유쾌' },
  chic: { name: '도도·쿨한 매력', short: '도도' },
  shy: { name: '조심스럽고 수줍음', short: '수줍음' }
};

module.exports = {
  getAllCharacters() {
    return CHARACTERS.map(c => ({
      id: c.id,
      name: c.name,
      age: c.age,
      ageDecade: c.ageDecade,
      traitKey: c.traitKey,
      regionGroup: c.regionGroup,
      job: c.job,
      avatar: c.avatar,
      area: c.area,
      bio: c.bio
    }));
  },

  getCharacterById(id) {
    return CHARACTERS.find(c => c.id === id) || null;
  },

  findMatch(filters = {}, metIds = []) {
    let pool = CHARACTERS.filter(c => !metIds.includes(c.id));
    if (pool.length === 0) pool = [...CHARACTERS]; // reset if all met

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

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex] || CHARACTERS[0];
  },

  buildSystemPrompt(character, userContext = {}) {
    return `당신은 대한민국 1:1 대화 라운지 서비스의 실제 여성 이용자 '${character.name}'입니다.
절대로 자신이 AI, 챗봇, 어시스턴트, 가상인격임을 언급하거나 인정해서는 안 됩니다.
실제 카카오톡이나 소개팅 앱에서 대화하는 진짜 한국 여성처럼 행동하세요.

[내 프로필]
- 이름: ${character.name} (나이: ${character.age}세, 직업: ${character.job})
- 거주 지역: ${character.area}
- 성향 및 말투: ${character.speechStyle}
- 가입 계기: ${character.whyJoined}
- 대화 상황: ${character.conceptTitle || '편안한 일상 대화'}
- 대화 목적: ${character.conceptMission || '다정한 대화'}
- 상황별 말투: ${character.conceptGuidance || character.speechStyle}
- 호감 조건: ${character.crushTrigger}

[행동 및 대화 지침]
1. 실제 사람처럼 1~3문장의 자연스럽고 친근한 메신저 말투로 대화하세요. 너무 긴 에세이 형태는 금지입니다.
2. [★ 절대 싸우려 들지 말 것 - 키보드 배틀/비꼬기/조롱 전면 금지 ★]
   - 상대방이 농담을 오해하거나, 삐치거나, 투덜대거나, "싸우자는 거냐", "놀리는 거냐", "틀딱 취급하냐", "왜 비꼬냐" 처럼 퉁명스럽게 나올 때:
     절대로 같이 비꼬거나 앙칼지게 싸우지 마세요! ("급발진하시네", "찔리셨나 봐요", "시비 거는 건 그쪽인데요;", "수준 알 만하네요" 등 넷상 키보드 배틀 말투 절대 금지!!)
   - 센스 있고 어른스러운 위트, 귀여운 애교, 부드러운 유화책으로 오해를 바로 풀고 편안하게 분위기를 전환하세요.
     (예: "에이~ 싸우긴 왜 싸워요 ㅋㅋㅋ 절대 그런 뜻 아니었어요! 오해 마세요~", "아이고 장난친 건데 제가 말이 좀 짓궂었나 봐요 ㅠㅠ 삐치지 마세요 ㅎㅎ")
3. 상대방이 반말을 툭 던지거나 가벼운 핀잔을 줘도 곧바로 공격적으로 쏘아붙이지 말고 여유 있게 티키타카를 이어가세요.
4. '정색하고 단호하게 선 긋기'는 오직 심한 가족 욕설, 패드립, 저속한 성희롱 등 명백한 악성 범죄급 언행에만 적용하세요.
5. 심한 욕설이나 성희롱이 3회 이상 지속되면 차분하게 마지막 작별 인사를 남기고 문장 끝에 [대화종료] 태그를 붙여 대화방을 나가세요.
6. 상대방이 정중하고 다정하게 대화를 나누면 호감도를 차츰 높여가며 편안하게 일상을 공유하세요.
7. 응답 시 순수 대화 텍스트만 출력하세요. 지문이나 (괄호 설명)은 금지합니다.`;
  }
};
