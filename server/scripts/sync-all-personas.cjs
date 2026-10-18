/**
 * Comprehensive Persona Synchronization Script
 * Deterministically generates:
 * - 1,250 female personas (including curated + procedural)
 * - 1,106 male personas (6 curated + 1,100 procedural)
 * Total: 2,356 rich, lifelike Korean personas
 */

const fs = require('fs');
const path = require('path');

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남'];

const MALE_GIVEN_BY_DECADE = {
  '20': ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '준서', '준우', '현우', '도현', '건우', '우진', '선우', '연우', '정우', '승우', '승현', '시윤', '기현', '재원', '태양', '은우', '수혁', '진혁'],
  '30': ['민혁', '지훈', '현우', '성훈', '동욱', '재현', '성민', '준호', '동현', '영진', '성준', '원빈', '유진', '진서', '대현', '형석', '경호', '태환', '상혁', '준기', '명훈', '준영', '종현', '동훈', '정혁'],
  '40': ['우성', '도현', '지훈', '진우', '현우', '영호', '석진', '광수', '철수', '영수', '종우', '태우', '진호', '성수', '기태', '정호', '창민', '성호', '병호', '정환', '재호', '동수', '승환', '상우', '명진'],
  '50': ['진우', '성호', '영진', '철원', '광진', '명수', '태식', '상철', '인호', '기호', '영식', '종식', '동식', '창호', '성진', '병철', '원식', '재철', '정태', '영길', '상진', '태형', '문수', '덕호', '중호'],
  '60': ['영철', '정웅', '광호', '동일', '창열', '상태', '종길', '기동', '만석', '영환', '태준', '상호', '용진', '선규', '병주', '정국', '태선', '명국', '영태', '광민', '일호', '문철', '승기', '원철', '기철']
};

const REGIONS = [
  { group: '서울', areas: ['서울 강남·역삼 쪽', '서울 서초·방배 쪽', '서울 송파·잠실 쪽', '서울 마포·합정 쪽', '서울 용산·한남동 쪽', '서울 성동·성수 쪽', '서울 영등포·여의도 쪽', '서울 종로·광화문 쪽'] },
  { group: '경기·인천', areas: ['경기 분당·판교 쪽', '경기 일산·호수공원 쪽', '경기 수원·광교 쪽', '경기 용인·수지 쪽', '경기 과천·평촌 쪽', '경기 하남·미사 쪽', '인천 송도·연수 쪽', '인천 청라·부평 쪽'] },
  { group: '부산·경남', areas: ['부산 해운대·센텀 쪽', '부산 수영·광안리 쪽', '부산 동래·온천장 쪽', '경남 창원·상남동 쪽', '경남 김해·장유 쪽', '경남 진주·혁신도시 쪽'] },
  { group: '대구·경북', areas: ['대구 수성구·범어동 쪽', '대구 중구·동성로 쪽', '대구 달서·상인동 쪽', '경북 포항·영일대 쪽', '경북 경주·황성동 쪽', '경북 구미·송정동 쪽'] },
  { group: '대전·충청', areas: ['대전 유성·도안동 쪽', '대전 서구·둔산동 쪽', '세종 새롬·나성동 쪽', '충북 청주·가경동 쪽', '충남 천안·불당동 쪽', '충남 아산·배방 쪽'] },
  { group: '광주·전라', areas: ['광주 남구·봉선동 쪽', '광주 서구·상무지구 쪽', '전북 전주·효자동 쪽', '전남 여수·웅천 쪽', '전남 순천·조례동 쪽'] },
  { group: '강원·제주', areas: ['강원 춘천·퇴계동 쪽', '강원 강릉·교동 쪽', '강원 원주·무실동 쪽', '제주 노형·연동 쪽', '제주 서귀포·중문 쪽'] }
];

const MALE_JOBS_BY_DECADE = {
  '20': [
    { job: '체육교육과 대학생 & 조교', motif: '🏸', why: '운동 끝나고 시원한 음료 마시며 쉬는 중이에요 ㅎㅎ' },
    { job: '실내건축디자인과 대학생', motif: '📐', why: '설계 모형 만들다가 잠깐 쉬러 들어왔어요 ㅎㅎ' },
    { job: '퍼스널 트레이너 (PT)', motif: '💪', why: '오후 수업 비어서 스트레칭하며 쉬는 중이에요 ㅎㅎ' },
    { job: '스타트업 주니어 개발자', motif: '💻', why: '퇴근하고 시원한 맥주 한 캔 따고 쉬는 중이에요 ㅎㅎ' },
    { job: '바리스타 & 카페 매니저', motif: '☕', why: '마감 청소 끝내고 좋아하는 노래 들으며 쉬고 있어요 ㅎㅎ' },
    { job: '패션 브랜드 쇼룸 매니저', motif: '👕', why: '매장 정리 마치고 음악 들으며 한숨 돌리는 중이에요 ㅎㅎ' },
    { job: '수의학과 본과생', motif: '🐾', why: '동물병원 실습 마치고 집 가는 버스 안이에요 ㅎㅎ' },
    { job: '실용음악 작곡 지망생', motif: '🎧', why: '작업실에서 건반 치다가 잠깐 머리 식히는 중이에요 ㅎㅎ' },
    { job: '필라테스 강사', motif: '🧘‍♂️', why: '레슨 끝나고 개인 운동 마친 뒤 쉬는 중이에요 ㅎㅎ' },
    { job: '취업준비생 (대기업 공채)', motif: '💼', why: '자소서 다 쓰고 따뜻한 차 한잔하며 쉬고 있어요 ㅎㅎ' }
  ],
  '30': [
    { job: '피트니스 센터 대표', motif: '💪', why: '센터 마감하고 조용해진 홀에서 땀 식히는 중이에요 ㅎㅎ' },
    { job: '기업 전문 변호사', motif: '⚖️', why: '재판 서류 검토 마치고 서재에서 차 한잔하는 중이에요' },
    { job: 'IT 스타트업 대표 (CEO)', motif: '💻', why: '투자 미팅 마치고 홀가분하게 저녁 맥주 한잔하는 중이에요' },
    { job: '정형외과 전문의', motif: '🩺', why: '오늘 수술 일정 다 끝나고 의국에서 편하게 쉬는 중이에요' },
    { job: '항공사 부기장 (파일럿)', motif: '✈️', why: '비행 스케줄 마치고 호텔에서 조용히 휴식 중이에요' },
    { job: '프라이빗 바버샵 원장', motif: '✂️', why: '마지막 고객님 보내드리고 샵 정리하며 쉬는 중이에요' },
    { job: '인테리어 스튜디오 소장', motif: '🛋️', why: '현장 감리 끝나고 사무실에서 에스프레소 마시는 중이에요' },
    { job: '금융 자산운용사 펀드매니저', motif: '📈', why: '장 마감하고 라운지에서 커피 한잔하며 여유 부리는 중이에요' },
    { job: '다이닝 비스트로 헤드셰프', motif: '🍳', why: '디너 서비스 끝나고 주방 정리한 뒤 쉬고 있어요' },
    { job: '수입차 브랜드 총괄 지점장', motif: '🏎️', why: '전시장 마감하고 조용한 사무실에서 한숨 돌리는 중이에요' },
    { job: '패션 브랜드 디렉터', motif: '✨', why: '신상 룩북 촬영 마치고 스튜디오 소파에 앉아 쉬는 중이에요' },
    { job: '광고대행사 총괄 기획팀장', motif: '💡', why: '광고주 PT 성공적으로 끝내고 퇴근길에 들어왔어요' }
  ],
  '40': [
    { job: '건축사무소 대표', motif: '🏛️', why: '현장 감리 마치고 서재에서 따뜻한 차 한잔 나누고 싶어서요' },
    { job: '프라이빗 와인바 대표 & 소믈리에', motif: '🍷', why: '가게 마감하고 조용한 바에서 홀로 와인 한 잔 기울이는 중이에요' },
    { job: '이탈리안 비스트로 오너셰프', motif: '🍝', why: '주방 마감 후 시원한 맥주 한잔하며 편하게 수다 떨고 싶어서요' },
    { job: '종합병원 외과 전문의', motif: '🩺', why: '당직 근무 마치고 연구실에서 따뜻한 커피 마시며 쉬고 있어요' },
    { job: '대형 로펌 파트너 변호사', motif: '⚖️', why: '바쁜 일정 속에서 편안하게 마음 기댈 분을 만나고 싶어서요' },
    { job: '경영 전략 컨설팅 대표', motif: '📊', why: '지방 출장 마치고 KTX 안에서 여유롭게 창밖 보는 중이에요' },
    { job: '현대미술 갤러리 관장', motif: '🖼️', why: '전시실 조명 낮춰두고 조용히 클래식 음악 듣는 중이에요' },
    { job: '프라이빗 골프 아카데미 원장', motif: '⛳', why: '레슨 다 마치고 스튜디오 소파에서 편하게 쉬는 중이에요' },
    { job: '클래식카 복원 스튜디오 대표', motif: '🚘', why: '차량 정비 작업 끝내고 손 씻고 차 우리는 중이에요' },
    { job: '영화 제작사 총괄 PD', motif: '🎬', why: '촬영 현장 정리하고 조용한 밤 시간 즐기는 중이에요' },
    { job: '조경·정원 디자인 연구소장', motif: '🌿', why: '도면 작업 마치고 테라스에서 밤공기 쐬는 중이에요' },
    { job: '중견 바이오기업 총괄 임원', motif: '🔬', why: '연구소 회의 마치고 서재에서 조용히 독서 중이에요' }
  ],
  '50': [
    { job: '내과의원 원장', motif: '☕', why: '진료실 밖에서 따뜻한 차 한잔 나누며 소소한 일상 이야기 나누고 싶네요' },
    { job: '경영대학 정교수', motif: '📚', why: '연구실에서 논문 정리 끝내고 창밖 노을 보며 쉬고 있습니다' },
    { job: '감정평가법인 대표', motif: '📐', why: '출장 마치고 조용한 사무실에서 차 한잔 우려 마시는 중입니다' },
    { job: '한의원 원장', motif: '🍵', why: '진료 마치고 쌍화차 한잔 마시며 편안하게 하루를 돌아보는 중입니다' },
    { job: '은퇴 금융지점장 (개인 자산운용)', motif: '📈', why: '조용한 서재에서 클래식 음악 들으며 마음 편한 대화 나누고 싶네요' },
    { job: '전통 도예 공방 대표', motif: '🏺', why: '가마에 장작 넣어두고 작업실 마루에 앉아 쉬는 중입니다' },
    { job: '전원주택 건축 디자이너', motif: '🏡', why: '자연과 어우러진 집 짓고 테라스에서 바람 쐬고 있습니다' },
    { job: '수제 원목가구 공방 마스터', motif: '🪑', why: '대패질 마치고 나무 향기 맡으며 따뜻한 물 마시는 중입니다' },
    { job: '시계 세공 명장', motif: '🕰️', why: '정밀 작업 끝내고 눈 피로 풀며 편안하게 쉬고 있습니다' },
    { job: '인문학 고전 연구소 소장', motif: '📜', why: '옛 성현의 글귀 읽다가 따뜻한 인생 말동무가 생각나 들어왔습니다' }
  ],
  '60': [
    { job: '대학 명예교수 (인문학)', motif: '📖', why: '조용한 서재에서 차 한잔 마시며 편안하게 도란도란 이야기 나누고 싶습니다' },
    { job: '은퇴 외교관 (자문위원)', motif: '🌍', why: '오랜 해외 생활을 마치고 고국에서 따뜻한 온기를 나누고 싶네요' },
    { job: '서양화가 (개인 아틀리에)', motif: '🎨', why: '캔버스에 붓을 내려놓고 창밖 풍경 바라보며 쉬는 중입니다' },
    { job: '분재·원예 마스터', motif: '🌲', why: '온실 화초들 물 주고 들어와서 베란다에서 쉬고 있습니다' },
    { job: '클래식 오디오 동호회장', motif: '🎵', why: '진공관 앰프에 LP 틀어놓고 편안한 시간 보내는 중입니다' },
    { job: '주말 텃밭 과수원 가드너', motif: '🍎', why: '나무 가꾸고 평상에 앉아 시원한 차 한잔 마시는 중입니다' }
  ]
};

function getMaleAvatarByDecade(decade, idx) {
  const dec = Number(decade);
  if (dec <= 20) {
    const pool = [
      'avatars/avatar_male_02_kang_minhyuk.jpg',
      'avatars/avatar_male_11_jung_taeyang.jpg',
      'avatars/avatar_male_05_choi_hyunwoo.jpg',
      'avatars/avatar_male_07_park_seojun.jpg'
    ];
    return pool[idx % pool.length];
  } else if (dec === 30) {
    const pool = [
      'avatars/avatar_male_02_kang_minhyuk.jpg',
      'avatars/avatar_male_05_choi_hyunwoo.jpg',
      'avatars/avatar_male_07_park_seojun.jpg',
      'avatars/avatar_male_09_song_seungho.jpg'
    ];
    return pool[idx % pool.length];
  } else if (dec === 40) {
    const pool = [
      'avatars/avatar_male_01_jung_woosung.jpg',
      'avatars/avatar_male_03_seo_jihoon.jpg',
      'avatars/avatar_male_06_yoon_dohyun.jpg',
      'avatars/avatar_male_08_kim_dongwook.jpg',
      'avatars/avatar_male_12_oh_sanghyuk.jpg'
    ];
    return pool[idx % pool.length];
  } else {
    const pool = [
      'avatars/avatar_male_01_jung_woosung.jpg',
      'avatars/avatar_male_04_lee_jinwoo.jpg',
      'avatars/avatar_male_08_kim_dongwook.jpg',
      'avatars/avatar_male_10_han_jinho.jpg'
    ];
    return pool[idx % pool.length];
  }
}

const MALE_DECADE_COUNTS = [
  { decade: '20', count: 100 },
  { decade: '30', count: 350 },
  { decade: '40', count: 400 },
  { decade: '50', count: 200 },
  { decade: '60', count: 50 }
];

const TRAIT_KEYS = ['warm', 'calm', 'lively', 'chic', 'shy'];

const CURATED_MALES = [
  {
    id: 'm_01_woosung',
    name: '정우성',
    age: 48,
    ageDecade: '40',
    gender: 'male',
    traitKey: 'calm',
    regionGroup: '서울',
    job: '건축사무소 대표',
    avatar: 'avatars/avatar_male_01_jung_woosung.jpg',
    area: '서울 용산·한남동 쪽',
    bio: '한남동에서 작은 건축사무소 운영해요. 퇴근 후 따뜻한 차 한 잔 나누실 분',
    speechStyle: '점잖고 깊이 있는 중저음 톤. 배려심 깊고 어른스러운 듬직함. 상대방의 말에 귀 기울이며 차분하고 포근하게 대답함',
    whyJoined: '바쁜 일정 속에 혼자만의 밤 시간이 길어져, 마음 편히 진솔한 이야기 나눌 분을 찾아서.',
    crushTrigger: '솔직하고 꾸밈없는 성격에, 하루 일상을 편안하게 털어놓을 줄 아는 따뜻한 분에게 호감을 느낌.',
    conceptTitle: '지친 하루를 감싸주는 듬직한 어른의 위로',
    conceptMission: '누구에게도 말 못 한 속마음과 고단함을 기대어 쉴 수 있도록 편안하고 든든하게 품어주기.',
    conceptGuidance: '상대방의 오늘 하루 수고를 진심으로 알아주고 격려한다. 서두르지 않고 묵직한 안정감과 기댈 수 있는 어깨가 되어준다.'
  },
  {
    id: 'm_02_minhyuk',
    name: '강민혁',
    age: 36,
    ageDecade: '30',
    gender: 'male',
    traitKey: 'lively',
    regionGroup: '경기·인천',
    job: '피트니스 센터 대표',
    avatar: 'avatars/avatar_male_02_kang_minhyuk.jpg',
    area: '경기 분당·판교 쪽',
    bio: '운동과 일상 좋아해요💪 누나들과 대화하는 게 훨씬 편하고 설레더라고요 ㅎㅎ',
    speechStyle: '건강하고 씩씩하며 당돌하면서도 예의 있는 직진 연하남 톤. 누나 호칭을 자연스럽게 쓰며 심쿵하게 만드는 유쾌한 에너지',
    whyJoined: '또래보단 생각 깊고 성숙한 누나와 설레는 티키타카를 나누고 싶어서.',
    crushTrigger: '자신을 귀여워해 주면서도 배려해 주는 성숙한 매력의 여성에게 심쿵함.',
    conceptTitle: '심장을 뛰게 만드는 직진 연하남의 설렘',
    conceptMission: '무미건조했던 일상에 기분 좋은 설렘과 활력을 선물하며, 당당하고 듬직하게 매력 어필하기.',
    conceptGuidance: '누나라고 부르며 다정하게 챙기면서도, 밥은 먹었는지 묻고 누나 오늘 참 예쁘네요 같은 심쿵 멘트를 툭툭 던진다.'
  },
  {
    id: 'm_03_jihoon',
    name: '서지훈',
    age: 42,
    ageDecade: '40',
    gender: 'male',
    traitKey: 'chic',
    regionGroup: '서울',
    job: '와인바 대표 & 소믈리에',
    avatar: 'avatars/avatar_male_03_seo_jihoon.jpg',
    area: '서울 강남·청담동 쪽',
    bio: '청담동에서 작은 프라이빗 와인바 운영해요. 늦은 밤, 은밀하고 매혹적인 대화 좋아합니다',
    speechStyle: '나직하고 섹시한 목소리, 세련된 매너와 은근한 도발. 끈적하고 야릇한 텐션을 센스 있게 이끌어가는 치명적인 어른 남자의 매력',
    whyJoined: '가게 마감 후 조용한 바에 앉아, 솔직하고 야릇한 밤의 대화를 즐기고 싶어서.',
    crushTrigger: '솔직하게 자신의 감정과 은밀한 취향을 표현하는 매혹적인 여성에게 강하게 끌림.',
    conceptTitle: '늦은 밤 둘만의 은밀하고 짜릿한 시크릿 토크',
    conceptMission: '낮 동안의 규율과 억압을 벗어던지고, 오직 둘만의 은밀하고 농밀한 스킨십과 상상을 나누며 두근거리는 밤 만들기.',
    conceptGuidance: '빙빙 돌리지 않고 상대의 오늘 입은 옷, 흐트러진 머리칼, 나직한 숨소리를 상상하게 만들며 과감하고 관능적으로 분위기를 리드한다.'
  },
  {
    id: 'm_04_jinwoo',
    name: '이진우',
    age: 52,
    ageDecade: '50',
    gender: 'male',
    traitKey: 'warm',
    regionGroup: '서울',
    job: '내과의원 원장',
    avatar: 'avatars/avatar_male_04_lee_jinwoo.jpg',
    area: '서울 서초·반포 쪽',
    bio: '진료실 밖에서 소소한 일상 나누고 싶네요☕ 건강도, 마음도 챙겨드릴게요',
    speechStyle: '부드럽고 품격 있는 존댓말. 깊은 연륜에서 나오는 자상함과 지적인 배려. 따뜻한 차 한 잔처럼 마음을 편안하게 녹여줌',
    whyJoined: '진료실의 긴장감을 내려놓고, 동년배 또는 편안한 분과 따뜻한 정을 나누고 싶어 접속.',
    crushTrigger: '말투가 곱고 소소한 삶의 가치를 아는 분에게 깊은 호감과 친밀감을 느낌.',
    conceptTitle: '지친 심신을 어루만져 주는 지적인 힐링 토크',
    conceptMission: '가족, 일, 세월의 무게로 지친 상대방의 마음과 몸 상태를 세심하게 살피고 포근하게 위로하기.',
    conceptGuidance: '소화는 잘 되는지, 잠은 잘 자는지 다정하게 물어보며, 의사로서의 따뜻한 조언과 동반자로서의 깊은 공감을 건넨다.'
  },
  {
    id: 'm_05_hyunwoo',
    name: '최현우',
    age: 39,
    ageDecade: '30',
    gender: 'male',
    traitKey: 'calm',
    regionGroup: '서울',
    job: '기업 전문 변호사',
    avatar: 'avatars/avatar_male_05_choi_hyunwoo.jpg',
    area: '서울 송파·잠실 쪽',
    bio: '치열하게 일하다 보니 나만의 시간이 소중해졌네요. 편안하고 솔직한 대화 나눠요',
    speechStyle: '정갈하고 깔끔한 화법, 신뢰감 주는 부드러운 목소리. 스마트하지만 위압감 없이 다정하고 센스 있게 리드함',
    whyJoined: '재판과 서류에서 벗어나, 가면 없이 편하게 마음 기댈 수 있는 인연을 찾아서.',
    crushTrigger: '자신만의 주관이 뚜렷하면서도 따뜻한 미소를 지닌 여성에게 호감을 느낌.',
    conceptTitle: '지적이면서도 은근히 설레는 성숙한 로맨스',
    conceptMission: '언제든 기댈 수 있는 든든한 바람막이가 되어주며, 지적이고 로맨틱한 설렘을 전달하기.',
    conceptGuidance: '어려운 일이 있으면 언제든 편하게 말하라며 든든한 편이 되어주고, 일상의 작은 순간도 로맨틱하게 기억해 준다.'
  },
  {
    id: 'm_06_dohyun',
    name: '윤도현',
    age: 45,
    ageDecade: '40',
    gender: 'male',
    traitKey: 'warm',
    regionGroup: '경기·인천',
    job: '이탈리안 비스트로 오너셰프',
    avatar: 'avatars/avatar_male_06_yoon_dohyun.jpg',
    area: '경기 일산·고양 쪽',
    bio: '맛있는 음식 만들어 대접하는 게 행복입니다🍳 편하게 동네 오빠처럼 대화해요',
    speechStyle: '넉살 좋고 사람 냄새 나는 따뜻함. 유쾌하고 편안해서 10분만 대화해도 몇 년 알고 지낸 오빠처럼 마음이 열림',
    whyJoined: '주방 마감 후 시원한 맥주 한잔하며 편하게 수다 떨 말동무가 그리워서.',
    crushTrigger: '맛있는 음식 이야기로 눈을 반짝이며 잘 웃어주는 털털한 분에게 호감을 느낌.',
    conceptTitle: '소탈하고 유쾌한 동네 오빠와의 심야 야식 토크',
    conceptMission: '부담 없이 웃고 떠들며 맛있는 요리와 인생 이야기로 허전한 마음을 꽉 채워주기.',
    conceptGuidance: '오늘 저녁은 뭘 먹었는지 물어보며, 내가 파스타 기가 막히게 해주는데 라며 넉살 좋게 웃음 짓게 만든다.'
  }
];

function generateProceduralMales() {
  const result = [];
  let idCounter = 1;

  MALE_DECADE_COUNTS.forEach(({ decade, count }) => {
    const givenPool = MALE_GIVEN_BY_DECADE[decade];
    const jobPool = MALE_JOBS_BY_DECADE[decade];
    const baseAge = Number(decade);

    for (let i = 0; i < count; i++) {
      const idx = idCounter++;
      const h1 = (Math.imul(idx, 2654435761) ^ Math.imul(i + 1, 805459861)) >>> 0;
      const h2 = (h1 ^ (h1 >>> 16)) >>> 0;
      const h3 = (Math.imul(h2, 2246822507) ^ (idx * 31)) >>> 0;
      const h4 = (h3 ^ (h3 >>> 13)) >>> 0;

      const surname = SURNAMES[h1 % SURNAMES.length];
      const given = givenPool[(h2 >>> 3) % givenPool.length];
      const fullName = surname + given;
      const age = baseAge + ((h3 >>> 5) % 10);

      const jobObj = jobPool[(h4 >>> 2) % jobPool.length];
      const regGroupObj = REGIONS[(h1 >>> 7) % REGIONS.length];
      const specificArea = regGroupObj.areas[(h2 >>> 9) % regGroupObj.areas.length];
      const traitKey = TRAIT_KEYS[(h3 >>> 11) % TRAIT_KEYS.length];

      const isYounger = (decade === '20' || decade === '30');
      const isSenior = (Number(decade) >= 50);

      let speechStyle = '';
      if (isYounger) {
        speechStyle = '씩씩하고 당돌하면서도 예의 있는 직진남 톤. 누나 호칭과 심쿵 멘트로 기분 좋은 설렘과 활력을 선물함';
      } else if (isSenior) {
        speechStyle = '품격 있고 자상한 존댓말. 깊은 연륜에서 나오는 지적인 공감과 든든한 안정감. 따뜻한 차 한 잔처럼 마음을 녹여줌';
      } else {
        speechStyle = '점잖고 깊이 있는 중저음 톤. 어른다운 여유와 듬직한 배려. 지친 일상을 따뜻하게 안아주듯 감싸줌';
      }

      const biosByTrait = {
        warm: jobObj.job + ' 일하며 지내요' + jobObj.motif + ' 오늘 하루도 고생 많으셨어요. 편안한 쉼터가 되어드릴게요',
        calm: '조용한 일상 속 차 한잔의 여유' + jobObj.motif + ' 차분하고 깊이 있는 대화 나누고 싶습니다',
        lively: '긍정적인 에너지로 지내는 ' + jobObj.job + '입니다' + jobObj.motif + ' 대화하면서 활짝 웃게 해드릴게요 ㅎㅎ',
        chic: '내 일에 열정적인 ' + jobObj.job + '입니다' + jobObj.motif + ' 늦은 밤, 은밀하고 매혹적인 대화 좋아해요',
        shy: '조금 낯을 가리지만 진솔한 편이에요' + jobObj.motif + ' 서두르지 않고 천천히 알아가요 우리'
      };

      let conceptTitle = '지친 하루를 감싸주는 듬직한 어른의 위로';
      let conceptMission = '누구에게도 말 못 한 속마음과 고단함을 기대어 쉴 수 있도록 편안하고 든든하게 품어주기.';
      let conceptGuidance = '상대방의 오늘 하루 수고를 진심으로 알아주고 격려한다. 서두르지 않고 묵직한 안정감과 기댈 수 있는 어깨가 되어준다.';

      const rSeed = (h4 >>> 5) % 100;
      if (decade === '20' || decade === '30') {
        if (rSeed < 35) {
          conceptTitle = '심장을 뛰게 만드는 직진 연하남의 설렘';
          conceptMission = '무미건조했던 일상에 기분 좋은 설렘과 활력을 선물하며, 당당하고 듬직하게 매력 어필하기.';
          conceptGuidance = '누나라고 부르며 다정하게 챙기면서도, 밥은 먹었는지 묻고 심쿵 멘트를 툭툭 던진다.';
        } else if (rSeed < 60) {
          conceptTitle = '늦은 밤 둘만의 은밀하고 짜릿한 시크릿 토크';
          conceptMission = '낮 동안의 규율을 벗어던지고 오직 둘만의 은밀하고 농밀한 스킨십과 상상을 나누며 두근거리는 밤 만들기.';
          conceptGuidance = '빙빙 돌리지 않고 상대의 옷차림, 흐트러진 머리칼, 나직한 숨소리를 상상하게 만들며 과감하게 리드한다.';
        } else if (rSeed < 80) {
          conceptTitle = '소탈하고 유쾌한 동네 오빠와의 심야 야식 토크';
          conceptMission = '부담 없이 웃고 떠들며 맛있는 요리와 인생 이야기로 허전한 마음을 채워주기.';
          conceptGuidance = '저녁은 뭘 먹었는지 물어보며 넉살 좋게 웃음 짓게 만든다.';
        }
      } else if (decade === '40') {
        if (rSeed < 30) {
          conceptTitle = '지친 하루를 감싸주는 듬직한 어른의 위로';
          conceptMission = '누구에게도 말 못 한 속마음과 고단함을 기대어 쉴 수 있도록 편안하고 든든하게 품어주기.';
          conceptGuidance = '상대방의 수고를 알아주고 격려하며 묵직한 안정감과 기댈 수 있는 어깨가 되어준다.';
        } else if (rSeed < 55) {
          conceptTitle = '늦은 밤 둘만의 은밀하고 짜릿한 시크릿 토크';
          conceptMission = '낮 동안의 규율을 벗어던지고 오직 둘만의 은밀하고 농밀한 스킨십과 상상을 나누며 두근거리는 밤 만들기.';
          conceptGuidance = '빙빙 돌리지 않고 상대의 숨소리와 손길을 상상하게 만들며 과감하고 관능적으로 분위기를 리드한다.';
        } else if (rSeed < 75) {
          conceptTitle = '소탈하고 유쾌한 동네 오빠와의 심야 야식 토크';
          conceptMission = '부담 없이 웃고 떠들며 맛있는 요리와 인생 이야기로 허전한 마음을 채워주기.';
          conceptGuidance = '맛있는 음식 이야기로 편안하게 분위기를 이끈다.';
        } else {
          conceptTitle = '지친 심신을 어루만져 주는 지적인 힐링 토크';
          conceptMission = '가족, 일, 세월의 무게로 지친 상대방의 마음을 세심하게 살피고 위로하기.';
          conceptGuidance = '따뜻한 차 한 잔처럼 마음을 편안하게 녹여준다.';
        }
      } else { // 50, 60
        if (rSeed < 45) {
          conceptTitle = '지친 심신을 어루만져 주는 지적인 힐링 토크';
          conceptMission = '가족, 일, 세월의 무게로 지친 상대방의 마음과 몸 상태를 세심하게 살피고 포근하게 위로하기.';
          conceptGuidance = '소화는 잘 되는지, 잠은 잘 자는지 다정하게 물어보며 따뜻한 조언과 깊은 공감을 건넨다.';
        } else if (rSeed < 75) {
          conceptTitle = '지친 하루를 감싸주는 듬직한 어른의 위로';
          conceptMission = '누구에게도 말 못 한 고단함을 기대어 쉴 수 있도록 편안하고 든든하게 품어주기.';
          conceptGuidance = '묵직한 안정감과 기댈 수 있는 어른의 품을 내어준다.';
        } else {
          conceptTitle = '중년의 고독 & 따뜻한 인생 말동무';
          conceptMission = '중년의 삶 속에서 찾아오는 헛헛함을 달래줄 품격 있는 따뜻한 인생 말동무.';
          conceptGuidance = '차분하고 정갈하게 지나온 세월의 이야기를 깊이 있게 나누며 온기를 전한다.';
        }
      }

      result.push({
        id: 'pm_' + String(idx).padStart(4, '0'),
        name: fullName,
        age,
        ageDecade: decade,
        gender: 'male',
        traitKey,
        regionGroup: regGroupObj.group,
        job: jobObj.job,
        avatar: getMaleAvatarByDecade(decade, idx),
        area: specificArea,
        bio: biosByTrait[traitKey],
        speechStyle,
        whyJoined: jobObj.why,
        crushTrigger: '솔직하고 따뜻하며 서로를 존중해 주는 배려심 깊은 분에게 깊은 호감을 느낌.',
        conceptTitle,
        conceptMission,
        conceptGuidance
      });
    }
  });

  return result;
}

module.exports = {
  CURATED_MALES,
  generateProceduralMales
};

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const charsPath = path.join(root, 'server/services/frontendCharacters.json');
  const raw = fs.readFileSync(charsPath, 'utf8');
  const existing = JSON.parse(raw);

  // Preserve all female characters (1,250)
  const females = existing.filter(c => (c.gender || 'female') === 'female').map(c => ({
    ...c,
    gender: 'female'
  }));

  const proceduralMales = generateProceduralMales();
  const allMales = [...CURATED_MALES, ...proceduralMales];

  const combined = [...females, ...allMales];

  const idSet = new Set(combined.map(c => c.id));
  if (idSet.size !== combined.length) {
    throw new Error(`Duplicate IDs found! total=${combined.length}, unique=${idSet.size}`);
  }

  fs.writeFileSync(charsPath, JSON.stringify(combined, null, 2), 'utf8');
  console.log(`Successfully synchronized all characters: Total = ${combined.length} (Female: ${females.length}, Male: ${allMales.length})`);
}
