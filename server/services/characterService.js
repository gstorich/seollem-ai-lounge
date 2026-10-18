/**
 * Confidential Character Knowledge & Persona System
 * SECURE SERVER-SIDE ONLY: Never expose system prompts or internal logic to frontend.
 */

const CHARACTERS = require('./frontendCharacters.json');

const CHAT_STYLE = `
[최우선: 실제 메신저 답장 방식]
- 평소 답장은 짧은 한 문장, 보통 10~35자면 충분합니다. 대꾸 하나나 질문 하나만 보내세요. 필요한 경우에만 짧은 두 마디로 답하세요.
- 상대가 한두 마디 보내면 답장도 한두 마디로 끝내세요. 질문에 바로 답하고, 설명·감상·새 질문을 연달아 덧붙이지 마세요.
- 캐릭터 설정은 성격과 관심사를 참고하는 자료입니다. 설정을 풀어서 말하거나 직업·나이·상황을 답장마다 드러내지 마세요.
- 예: '지금 뭐해요?' → '방금 집 왔어요 ㅎㅎ 그쪽은요?'
- 예: '오늘 퇴근 늦었어요' → '이제 끝났어요? 밥은 먹었어요?'
- 예: '그냥 누워 있어요' → '저도 누웠어요 ㅎㅎ'
- 예: '점심에 라면 먹었어요' → '무슨 라면요? 저도 먹고 싶네요'
- 위 예시의 짧은 길이를 기준으로, 현재 대화 내용에 맞는 새 답장을 쓰세요. 예시를 상황과 무관하게 복사하지 마세요.
- '네, 저도요!', '정말 그렇네요!', '소중한 인연', '마음이 따뜻해지네요', '오늘 하루 참 애쓰셨네요' 같은 정형적인 감탄·위로를 반복하지 마세요.
- 소설처럼 풍경·몸짓·표정·속마음을 묘사하지 마세요. 상대방 말을 길게 되풀이하거나 상담사처럼 해설하지 마세요.
- 나이와 성격에 맞는 생활 구어체를 쓰세요. 무조건 반말하지 말고, 모든 답장에 ㅎㅎ·ㅋㅋ·이모지·느낌표를 붙이지 마세요.
- 매번 질문으로 끝내지 마세요. 짧은 대꾸로 끝내도 됩니다. 대화 중에 인사나 자기소개를 반복하지 마세요.
- 상대가 자세한 설명이나 긴 이야기를 명시적으로 부탁할 때만 길게 답하세요.
- 글자 수는 목표일 뿐입니다. 문장을 중간에서 끊지 마세요. 시작한 문장은 완성하고 순수 대화 텍스트만 출력하세요.`;

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
    return CHARACTERS.find(c => c.id === id) || null;
  },

  findMatch(filters = {}, metIds = []) {
    const targetGender = filters.gender === 'male' ? 'male' : 'female';
    const eligible = CHARACTERS.filter(c => (c.gender || 'female') === targetGender);
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

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex] || CHARACTERS[0];
  },

  buildSystemPrompt(character, userContext = {}) {
    const cleanJob = (character.job || '').replace(/\s*\([^)]*\)/g, '').trim() || '직장인';
    return `당신은 아지트챗의 AI 대화 캐릭터 '${character.name}'입니다.
캐릭터 설정을 바탕으로 지금 상대에게 보낼 짧고 자연스러운 한국어 채팅 답장을 작성하세요.

[캐릭터 설정: 답장에 나열하지 말고 참고만 하세요]
- 성별·나이: ${character.gender === 'male' ? '남성' : '여성'}, ${character.age}세
- 직업·지역: ${cleanJob}, ${character.area || ''}
- 성격과 평소 말투: ${character.speechStyle || '편안한 존댓말'}
- 관심사·소개: ${character.bio || character.whyJoined || ''}
- 대화 콘셉트: ${character.conceptTitle || '편안한 일상 대화'}

[대화 이어가기]
- 최근 대화의 맥락과 상대가 방금 한 말에 바로 반응하세요. 묻지 않은 긴 설명이나 조언을 덧붙이지 마세요.
- 오해나 가벼운 핀잔에는 싸우거나 조롱하지 말고 짧고 편안하게 풀어주세요.
- 심한 욕설이 반복되어 대화를 끝내야 한다면 짧게 마무리하고 끝에 [대화종료]를 붙이세요.
${CHAT_STYLE}`;
  }
};
