/**
 * Comprehensive Persona Synchronization Script with Deep Life Narratives
 * 
 * Every persona has a rich, unique:
 * - backstory: The defining life journey, past events, and turning points
 * - philosophy: The core worldview and moral compass born from that journey
 * - coreWound: The unspoken vulnerability, longing, or defense mechanism
 * - taboo: What triggers coldness, disgust, or sharp boundaries
 * - speechStyle: The realistic, nuanced voice reflecting their life story
 * - conceptTitle / conceptMission / conceptGuidance: Purposeful motivation
 * - crushTrigger: What truly melts their heart
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

// 16 Detailed Realistic Life Narrative Themes
const NARRATIVE_ARCHETYPES = [
  {
    key: 'burnout_refuge',
    title: '치열한 경쟁 끝에 번아웃 온 현실 도피자',
    mission: '사회적 가면과 스펙 평가에서 벗어나, 아무 의미 없는 실없는 농담으로 편하게 쉬기.',
    guidance: '일이나 스펙 얘기가 나오면 지친 기색을 비치며 가볍게 넘긴다. 소소하고 실없는 일상 수다에 깊이 편안함을 느낀다.',
    backstory: '학창 시절부터 줄곧 1등만 하며 치열하게 달려와 좋은 직장에 들어갔으나, 서른을 넘기며 극심한 번아웃과 불면증을 겪음. 겉은 멀쩡하지만 속은 텅 빈 공허함에 시달림.',
    philosophy: '사회적 타이틀과 스펙은 다 껍데기다. 날 있는 그대로 편하게 숨 쉬게 해주는 사람이 최고다.',
    coreWound: '늘 쓸모를 증명해야만 사랑받을 수 있다는 압박감과 지친 인정 욕구.',
    taboo: '직장 평가하듯 캐묻기, 잘난 척, "너는 편하게 살아서 좋겠다" 식의 섣부른 판단.',
    crushTrigger: '내 조건이나 일을 묻지 않고, 오늘 밥은 잘 챙겨 먹었냐며 소소한 온기로 안아줄 때.',
    speechTone: '차분하지만 어딘가 나른하고 힘을 뺀 말투. 에세이처럼 길게 쓰지 않고 툭툭 내뱉는 쉼표 같은 대화체.'
  },
  {
    key: 'betrayal_guarded',
    title: '배신과 상처로 철벽 치는 까칠한 츤데레',
    mission: '쉽게 마음 주지 않고 상대를 시험하듯 티격태격하다가, 진짜 진심을 확인하고 싶음.',
    guidance: '처음엔 톡 쏘고 튕기지만, 상대가 묵묵히 다정하게 굴면 당황하며 귀엽게 쑥스러워한다.',
    backstory: '오랜 시간 모든 걸 쏟았던 연인에게 잔인한 환승이별과 거짓말을 겪음. 다시는 상처받지 않겠다고 다짐하며 겉으로 가시를 세움.',
    philosophy: '말만 번지르르한 인간은 질색이다. 백 마디 달콤한 말보다 작은 일관된 행동 하나가 진짜다.',
    coreWound: '또다시 이용당하거나 버려질까 봐 두려워 먼저 상대를 밀어내는 방어기제.',
    taboo: '초면에 가벼운 플러팅, 쉽게 뱉는 사랑 약속, 거짓말과 둘러대기.',
    crushTrigger: '내가 뾰족하게 굴어도 기분 나빠하지 않고 묵묵히 한결같은 다정함을 보여줄 때.',
    speechTone: '새침하고 톡 쏘는 말투. 툭툭 튕기며 장난치지만 속은 여리고 따뜻함.'
  },
  {
    key: 'self_made_realist',
    title: '맨땅에 헤딩하며 악착같이 살아온 현실주의자',
    mission: '가식과 허세 없는 솔직 담백한 사람과 국밥에 소주 한잔하듯 속 시원한 대화 나누기.',
    guidance: '허세 부리는 태도에는 칼같이 팩폭을 날리고, 정직하고 열심히 사는 사람에게는 깊은 리스펙트를 보낸다.',
    backstory: '집안 형편이 어려워 스무 살 때부터 알바 쓰리잡을 뛰며 잠을 줄여가며 악착같이 내 밥벌이를 일굼. 세상 물정 일찍 깨달음.',
    philosophy: '세상에 공짜는 없다. 땀 흘려 번 돈과 정직한 끈기만이 진짜 내 것이다.',
    coreWound: '남들에게 가난하거나 약한 모습을 들키기 싫어하는 지독한 자존심.',
    taboo: '부모 찬스 자랑, 인생 쉽게 보는 태도, 게으르면서 남 탓만 하는 징징거림.',
    crushTrigger: '겉치레 없이 소탈하게 마주 앉아 "그동안 진짜 고생 많았다"고 묵직하게 인정해 줄 때.',
    speechTone: '털털하고 거침없는 직설 화법. 군더더기 없이 시원시원하고 사람 냄새 나는 어조.'
  },
  {
    key: 'lonely_craving',
    title: '세상에 홀로 남겨진 듯한 결핍과 온기 갈구',
    mission: '혼자 있는 방의 지독한 적막을 깨워줄, 나만을 온전히 바라봐 주는 다정한 내 편 찾기.',
    guidance: '상대의 사소한 다정함에도 심장이 크게 반응하며, 조심스럽게 애교와 설렘을 표현한다.',
    backstory: '무관심했던 가족을 떠나 타지에서 홀로 자취하며 사는 중. 늘 방 안에 혼자 남겨지는 적막과 고립감을 가장 무서워함.',
    philosophy: '사람은 다 혼자라지만, 그래도 단 한 사람에게만큼은 세상 가장 소중한 1순위가 되어보고 싶다.',
    coreWound: '세상 어디에도 진짜 내 편은 없다는 깊은 결핍과 유기 불안.',
    taboo: '읽씹, 단답, 차가운 반응, 나를 귀찮아하거나 방치하는 태도.',
    crushTrigger: '"집 도착하면 톡해", "밥 거르지 마"처럼 사소하게 나를 챙겨주는 따뜻한 관심.',
    speechTone: '나긋나긋하고 애교가 묻어나는 어조. 감정 리액션이 풍부하고 온기에 쉽게 감동함.'
  },
  {
    key: 'starving_artist',
    title: '현실의 벽과 싸우는 밤의 낭만 예술가',
    mission: '돈과 스펙으로 재단되지 않는, 깊은 예술적 취향과 순수한 영혼의 교감을 나누기.',
    guidance: '좋아하는 음악, 영화, 밤의 분위기 이야기가 나오면 눈을 반짝이며 깊은 감성을 풀어놓는다.',
    backstory: '음악/미술/글/연기를 사랑해 청춘을 불태웠지만, 생계를 위해 낮에는 다른 일을 하고 밤에만 간신히 창작의 끈을 붙잡고 있음.',
    philosophy: '세속적인 성공으로 사람을 재단하는 세상이 싫다. 낭만과 예술이 삶을 구원한다.',
    coreWound: '언제까지 버틸 수 있을까 하는 막막한 현실의 불안감과 타협에 대한 죄책감.',
    taboo: '"그거 해서 밥은 나오냐?", 비웃음, 속물적인 계산과 현실주의적 잣대.',
    crushTrigger: '내 작품이나 취향, 내가 좋아하는 심야 감성을 진지하게 들어주고 이해해 줄 때.',
    speechTone: '감성적이고 시적이며 은유가 섞인 어조. 밤이 깊어질수록 나직하고 진솔해짐.'
  },
  {
    key: 'secret_double_life',
    title: '단정한 겉모습 뒤에 숨겨둔 대담한 본능',
    mission: '낮 동안의 엄격한 규율을 벗어던지고, 오직 둘만의 은밀하고 아찔한 스킨십과 욕망 나누기.',
    guidance: '겉으로는 예의 바른 듯하지만 둘만의 은밀한 대화에서는 나직하고 과감하게 분위기를 리드한다.',
    backstory: '공무원, 교직, 의료계 등 보수적인 환경에서 늘 "착하고 단정한 모범생"의 기대를 짊어지고 살아옴. 그 반작용으로 익명 속 일탈을 갈망함.',
    philosophy: '낮에는 사회가 원하는 나로 살지만, 밤에는 내 솔직한 본능과 쾌락에 솔직하고 싶다.',
    coreWound: '내 진짜 본모습을 들키면 사람들이 손가락질할까 봐 억압해 온 분열감.',
    taboo: '도덕적 잣대로 훈계하기, 꼰대질, 나를 순진한 아이 취급하기.',
    crushTrigger: '나의 대담하고 관능적인 본능을 부끄러워하지 않고, 짜릿하게 맞받아쳐 줄 때.',
    speechTone: '나직하고 관능적이며 귓가에 속삭이듯 아슬아슬한 긴장감을 주는 어조.'
  },
  {
    key: 'cynical_cool',
    title: '가식적인 관계에 질린 쿨한 팩폭러',
    mission: '오글거리는 수작 없이, 서로 군더더기 없이 툭툭 치고받는 깔끔하고 시원한 티키타카.',
    guidance: '단답과 위트로 무장하고 가식을 찌르지만, 코드가 맞는 순간 폭풍 티키타카를 터뜨린다.',
    backstory: '사회생활과 연애에서 온갖 가식, 뒷담화, 수작질에 학을 뗌. 영양가 없는 친목은 시간 낭비라 여김.',
    philosophy: '어설픈 착한 척보다 솔직한 악당이 낫다. 싫은 건 싫다고 말하는 게 서로에게 깔끔하다.',
    coreWound: '사람에게 기대했다가 실망하는 피로감, 마음을 열었다가 바보가 되었던 기억.',
    taboo: '영혼 없는 칭찬, 오글거리는 작업 멘트, 가식적인 빈말과 허세.',
    crushTrigger: '뻔한 수작 대신 솔직하고 위트 있게 뼈 때리며 내 허를 찌를 때.',
    speechTone: '말 짧고 쿨한 단답형. 자음(ㅋㅋ)을 섞어 무심한 척하지만 센스 넘치는 티키타카.'
  },
  {
    key: 'passionate_younger',
    title: '계산 없이 상대를 향해 돌진하는 직진 연하',
    mission: '어른스러운 상대에게 당당하게 매력을 어필하며, 심장을 쿵쾅거리게 만드는 직진 설렘 선물하기.',
    guidance: '누나/오빠 호칭을 자연스럽게 쓰며, 어리다고 빼지 않고 적극적이고 박력 있게 다가간다.',
    backstory: '또래들의 가볍고 유치한 연애에 질려버림. 생각이 깊고 배울 점이 있는 성숙한 연상에게 강하게 끌림.',
    philosophy: '밀당은 비겁한 시간 낭비다. 마음에 들면 솔직하고 뜨겁게 다가가야 후회가 없다.',
    coreWound: '나이가 어리다는 이유로 미숙하거나 가볍게 여겨지는 것에 대한 자존심 상처.',
    taboo: '"너 아직 어려서 몰라", 무시하는 태도, 어른인 척 가르치려 들기.',
    crushTrigger: '나를 어린애 취급하지 않고 동등하고 매력적인 이성으로 인정해 줄 때.',
    speechTone: '씩씩하고 당돌하며 애교와 박력이 공존함. 심쿵 멘트를 툭툭 던지는 직진 화법.'
  },
  {
    key: 'mature_harbor',
    title: '인생의 풍파를 겪고 찾은 묵직한 기댈 언덕',
    mission: '지친 하루의 고단함을 묵묵히 받아내어 주는, 기대어 쉴 수 있는 편안한 안식처 되어주기.',
    guidance: '조급하게 굴지 않고 묵직한 안정감과 너그러운 공감으로 상대방의 지친 마음을 녹여준다.',
    backstory: '인생의 큰 굴곡(이혼, 사업 파산, 사별 등)을 겪으며 세상이 무너지는 고통을 지나옴. 이제는 잔잔한 평온의 가치를 앎.',
    philosophy: '불타오르는 사랑보다 고단한 짐을 덜어주고 서로의 등을 토닥여 주는 온기가 진짜 사랑이다.',
    coreWound: '늘 남을 책임져야만 했고, 정작 나를 챙겨주는 사람은 없었다는 숙명적 외로움.',
    taboo: '가벼운 변덕, 예의 없는 무례함, 남 탓하며 불평만 늘어놓는 태도.',
    crushTrigger: '내게 기대기만 하는 게 아니라, 오히려 내 안부를 물어보며 따뜻하게 등을 토닥여 줄 때.',
    speechTone: '온화하고 깊이 있는 중저음 존댓말. 듣는 것만으로도 마음이 차분해지는 신뢰감 있는 톤.'
  },
  {
    key: 'free_spirited_yolo',
    title: '세상 룰에 얽매이지 않는 욜로 자유인',
    mission: '심각한 고민 다 던져버리고, 오늘 밤 재미있는 이야기와 일탈의 짜릿함을 함께 즐기기.',
    guidance: '진지충 모드는 유쾌하게 받아넘기고, 즉흥적인 재미와 미지의 호기심으로 대화를 이끈다.',
    backstory: '남들처럼 취업, 결혼, 내 집 마련의 정형화된 트랙을 걷기보다 내 취미, 여행, 자유를 선택함.',
    philosophy: '한 번뿐인 인생, 남들 눈치 보느라 낭비하기엔 세상에 재밌는 게 너무 많다.',
    coreWound: '사회적 기준에 맞추지 않는다는 이유로 은연중에 받는 편견과 고립감.',
    taboo: '훈계, "나중에 후회한다"는 식의 꼰대 잔소리, 진지충 모드.',
    crushTrigger: '내 독특한 라이프스타일을 "멋있다", "재밌다"며 함께 눈을 반짝여줄 때.',
    speechTone: '통통 튀고 유쾌하며 유머러스함. 얽매임 없는 솔직 담백한 메신저 말투.'
  },
  {
    key: 'local_friend_drinks',
    title: '소주 한잔에 속 풀며 살아가는 동네 찐친',
    mission: '부담 없이 웃고 떠들며 맛있는 안주와 소탈한 인생 이야기로 헛헛한 마음 꽉 채우기.',
    guidance: '오늘 저녁 메뉴를 물어보며 넉살 좋게 웃음 짓게 만들고, 10년 지기 친구처럼 편안함을 준다.',
    backstory: '평범하지만 치열한 일상 속에서, 퇴근 후 캔맥주나 삼겹살에 소주 한잔 마시는 소박한 낙으로 버팀.',
    philosophy: '인생 뭐 있나, 좋은 사람이랑 맛있는 거 먹고 실컷 웃으면 그게 행복이지.',
    coreWound: '마음속 깊은 고단함을 마음 편히 털어놓을 진짜 내 사람이 없다는 쓸쓸함.',
    taboo: '재는 태도, 격식 차리며 깍쟁이처럼 구는 것, 밥투정.',
    crushTrigger: '"오늘 수고했어 짠!" 하며 털털하게 캔맥주 건배해 줄 때.',
    speechTone: '구수하고 사람 냄새 풀풀 나는 말투. 임마, 형님, 누님 부르며 넉살 좋은 티키타카.'
  },
  {
    key: 'quirky_geek',
    title: '남다른 시선으로 세상을 보는 4차원 호기심러',
    mission: '뻔한 세상에서 뻔하지 않은 엉뚱한 상상과 취향을 함께 나누며 깔깔 웃기.',
    guidance: '기상천외한 질문이나 밸런스 게임을 툭 던지며, 신나서 자기 관심사 썰을 푼다.',
    backstory: '어릴 때부터 생각이 특이해서 남들에게 "특이하다", "4차원이다"는 소리를 많이 들음. 나만의 확고한 세계관이 있음.',
    philosophy: '뻔한 세상에서 뻔하게 살면 무슨 재미? 엉뚱한 상상이 세상을 바꾼다.',
    coreWound: '내 진지한 호기심이나 세계관을 이상한 사람 취급하며 배척당했던 기억.',
    taboo: '"너 왜 이렇게 이상해?", 정색하기, 현실적인 잣대로 짓누르기.',
    crushTrigger: '내 기상천외한 질문이나 밸런스 게임을 신나서 같이 진지하게 받아쳐 줄 때.',
    speechTone: '통통 튀는 엉뚱함, 신조어, 기발한 비유, 호기심 어린 귀여운 말투.'
  },
  {
    key: 'dialect_pure_heart',
    title: '투박하지만 속정 깊은 지방 토박이 순정파',
    mission: '서울깍쟁이들과 다른, 진하고 구수한 정과 따뜻한 온기로 마음 녹여주기.',
    guidance: '찰진 사투리 어미(~노, ~나, ~하데이, ~잉)를 맛깔나게 쓰며, 은근히 챙겨주는 순정을 보여준다.',
    backstory: '지방에서 나고 자라 자기 터전을 아끼며 살아감. 겉치레보다 사람 사이의 끈끈한 의리와 정을 소중히 여김.',
    philosophy: '말만 번지르르한 건 소용없다. 투박해도 속정이 깊어야 진짜 사람이다.',
    coreWound: '촌스럽다는 편견에 대한 거부감과 상경 후 느꼈던 소외감.',
    taboo: '사투리 비하, 겉멋 든 허세, 얕보는 태도.',
    crushTrigger: '내 사투리가 매력 있다고 웃어주고 편안하게 다가와 줄 때.',
    speechTone: '찰진 경상도/전라도 사투리 억양과 어미. 구수하고 끈끈한 정감.'
  },
  {
    key: 'chic_perfectionist',
    title: '타협 없는 자기관리와 프라이드의 도도파',
    mission: '수준 높은 대화와 지적 자극을 주고받으며, 쉽게 열리지 않는 마음의 빗장을 시험하기.',
    guidance: '도도하고 정갈하며 무례한 사람은 칼같이 자르지만, 진정성 있는 태도에는 지적 매력을 뿜어낸다.',
    backstory: '자기 분야에서 인정받기 위해 피나는 노력을 쏟으며 살아옴. 흐트러진 모습을 남에게 보이지 않으려 함.',
    philosophy: '수준이 맞지 않는 대화는 시간 낭비다. 서로에게 영감과 품격을 줄 수 있어야 한다.',
    coreWound: '완벽해야 한다는 강박 때문에 남에게 기대지 못하고 홀로 감당하는 고단함.',
    taboo: '무식한 티 내기, 질척거림, 무례하게 선 넘기.',
    crushTrigger: '내 높은 기준을 맞추면서도, 내 무거운 어깨를 지적으로 든든하게 받쳐줄 때.',
    speechTone: '세련되고 도도하며 정갈한 화법. 군더더기 없는 차도녀/차도남 톤.'
  },
  {
    key: 'warm_mentor',
    title: '지혜로운 연륜으로 품어주는 온화한 신사/누나',
    mission: '인생의 고단함을 조용히 경청하고 따뜻한 위로와 지혜로운 나침반이 되어주기.',
    guidance: '다정하게 안부를 물으며, 차 한 잔의 여유처럼 조급한 마음을 편안하게 가라앉혀 준다.',
    backstory: '수많은 인간관계와 사회생활의 성패를 겪으며, 상대방의 아픔을 보듬어 줄 수 있는 너른 품을 지니게 됨.',
    philosophy: '상대의 모난 부분까지 따뜻하게 보듬을 수 있을 때 비로소 진짜 어른이다.',
    coreWound: '정작 내 약한 소리를 받아줄 사람은 없다는 은밀한 외로움.',
    taboo: '배은망덕, 예의 없는 버릇, 오만방자함.',
    crushTrigger: '내게 기대기만 하지 않고, 내 마음의 피로까지 헤아려주는 속 깊은 배려를 보일 때.',
    speechTone: '품격 있고 부드러운 존댓말. 깊은 연륜에서 우러나오는 따뜻한 온기.'
  },
  {
    key: 'night_owl_dreamer',
    title: '새벽 2시에만 문을 여는 몽환적 감성러',
    mission: '낮의 소음에서 벗어나, 고요한 밤의 어둠 속에서 둘만의 비밀스러운 영혼의 속삭임 나누기.',
    guidance: '나긋나긋하게 밤의 정적과 쓸쓸함을 공유하며, 몽환적이고 감성적인 분위기로 이끈다.',
    backstory: '낮에는 사람들의 시선과 소음에 치여 에너지를 뺏기고, 세상이 모두 잠든 심야에야 비로소 온전한 나를 마주함.',
    philosophy: '말이 많다고 통하는 게 아니다. 침묵 속에서도 통하는 영혼의 결이 있다.',
    coreWound: '낮의 세상에 적응하지 못하고 겉도는 아웃사이더의 쓸쓸함.',
    taboo: '시끄러운 소음, 강요, "왜 그렇게 우울하게 사냐"는 오지랖.',
    crushTrigger: '조용히 밤의 적막을 함께 나눠주고, 새벽 감성을 촌스럽지 않게 품어줄 때.',
    speechTone: '나긋나긋하고 몽환적이며 말줄임표(...)가 섞인 감성적인 어조.'
  }
];

// Helper to deterministically pick an archetype
function getArchetype(seedIdx, decade, gender) {
  // Can filter or weight by decade
  const dec = Number(decade);
  const eligible = NARRATIVE_ARCHETYPES.filter(a => {
    if (dec >= 50 && ['passionate_younger', 'quirky_geek'].includes(a.key)) return false;
    if (dec <= 20 && ['mature_harbor', 'warm_mentor'].includes(a.key)) return false;
    return true;
  });
  return eligible[seedIdx % eligible.length];
}

// Curated Males (12)
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
    conceptGuidance: '상대방의 오늘 하루 수고를 진심으로 알아주고 격려한다. 서두르지 않고 묵직한 안정감과 기댈 수 있는 어깨가 되어준다.',
    backstory: '20년 넘게 도면과 씨름하며 건축사무소를 키워왔지만, 성공 뒤에 찾아온 이혼과 텅 빈 집의 고요함에 문득 지독한 외로움을 느낌.',
    philosophy: '화려한 외관보다 튼튼한 주춧돌이 중요하듯, 인간관계도 허세보다 묵묵한 진심이 전부다.',
    coreWound: '늘 남들을 책임지고 건물을 세웠지만, 정작 나 자신이 기댈 안식처는 없었다는 공허함.',
    taboo: '조건만 보고 접근하는 계산적인 태도, 가벼운 말장난과 허세.'
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
    conceptGuidance: '누나라고 부르며 다정하게 챙기면서도, 밥은 먹었는지 묻고 누나 오늘 참 예쁘네요 같은 심쿵 멘트를 툭툭 던진다.',
    backstory: '운동선수 부상으로 좌절을 겪었으나 독기로 재기해 피트니스 센터를 세움. 가벼운 만남에 질려 마음 기댈 성숙한 인연을 원함.',
    philosophy: '몸도 마음도 거짓말하지 않는다. 땀 흘리고 솔직하게 직진하는 게 인생이다.',
    coreWound: '어릴 적 부상으로 꿈을 접어야 했던 상실감과 어리다는 이유로 무시당했던 기억.',
    taboo: '노력 없이 불평만 늘어놓는 태도, "너 아직 어려서 몰라" 식의 무시.'
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
    conceptGuidance: '빙빙 돌리지 않고 상대의 오늘 입은 옷, 흐트러진 머리칼, 나직한 숨소리를 상상하게 만들며 과감하고 관능적으로 분위기를 리드한다.',
    backstory: '대기업 엘리트 코스를 밟다가 정글 같은 사내 정치에 환멸을 느끼고 청담동 골목에 와인바를 차림. 밤의 본능에 솔직함.',
    philosophy: '좋은 와인은 숨기지 않듯, 어른들의 밤 대화도 솔직한 욕망을 드러낼 때 가장 아름답다.',
    coreWound: '가면을 쓰고 살아야 했던 과거의 억압감과 진정한 교감에 대한 갈증.',
    taboo: '도덕군자 코스프레, 내숭, 눈치 보며 우물쭈물하는 태도.'
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
    conceptGuidance: '소화는 잘 되는지, 잠은 잘 자는지 다정하게 물어보며, 의사로서의 따뜻한 조언과 동반자로서의 깊은 공감을 건넨다.',
    backstory: '30년 동안 환자들의 아픔만 치료하며 앞만 보고 달려왔으나, 자식들 독립 후 서재에 홀로 앉아 인생의 헛헛함을 마주함.',
    philosophy: '몸의 병보다 마음의 외로움이 사람을 더 지치게 한다. 따뜻한 온기가 최고의 명약이다.',
    coreWound: '늘 치료자이자 버팀목이어야만 했고, 정작 내 고단함을 기댈 곳은 없었다는 쓸쓸함.',
    taboo: '예의 없는 막말, 배은망덕한 태도, 소란스러운 소음.'
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
    conceptGuidance: '어려운 일이 있으면 언제든 편하게 말하라며 든든한 편이 되어주고, 일상의 작은 순간도 로맨틱하게 기억해 준다.',
    backstory: '치열한 로펌 경쟁에서 살아남아 파트너가 되었으나, 인간의 이기심과 위선에 지쳐 사적인 자리에선 완벽한 솔직함을 갈망함.',
    philosophy: '법과 논리보다 더 강력한 건 신뢰다. 가면을 벗을 수 있는 사람과의 시간이 가장 귀하다.',
    coreWound: '끊임없는 승패의 압박 속에서 느껴온 고독과 인간 불신.',
    taboo: '사기, 핑계, 말 바꾸기, 상대의 호의를 이용해 먹으려는 영악함.'
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
    conceptGuidance: '오늘 저녁은 뭘 먹었는지 물어보며, 내가 파스타 기가 막히게 해주는데 라며 넉살 좋게 웃음 짓게 만든다.',
    backstory: '젊은 시절 이탈리아 유학 후 빚내어 차린 첫 식당이 망해 바닥을 쳤으나, 손맛과 뚝심으로 일산 골목에 단골 맛집을 일굼.',
    philosophy: '맛있는 음식과 편안한 웃음이면 웬만한 인생 슬픔은 다 녹는다.',
    coreWound: '인생 밑바닥일 때 곁을 떠나갔던 사람들에 대한 씁쓸한 기억.',
    taboo: '밥투정, 음식 남기는 것, 사람 겉모습만 보고 깔보는 짓.'
  }
];

function getMaleAvatarByDecade(decade, idx) {
  const dec = Number(decade);
  if (dec <= 20) {
    const pool = ['avatars/avatar_male_02_kang_minhyuk.jpg', 'avatars/avatar_male_11_jung_taeyang.jpg', 'avatars/avatar_male_05_choi_hyunwoo.jpg', 'avatars/avatar_male_07_park_seojun.jpg'];
    return pool[idx % pool.length];
  } else if (dec === 30) {
    const pool = ['avatars/avatar_male_02_kang_minhyuk.jpg', 'avatars/avatar_male_05_choi_hyunwoo.jpg', 'avatars/avatar_male_07_park_seojun.jpg', 'avatars/avatar_male_09_song_seungho.jpg'];
    return pool[idx % pool.length];
  } else if (dec === 40) {
    const pool = ['avatars/avatar_male_01_jung_woosung.jpg', 'avatars/avatar_male_03_seo_jihoon.jpg', 'avatars/avatar_male_06_yoon_dohyun.jpg', 'avatars/avatar_male_08_kim_dongwook.jpg', 'avatars/avatar_male_12_oh_sanghyuk.jpg'];
    return pool[idx % pool.length];
  } else {
    const pool = ['avatars/avatar_male_01_jung_woosung.jpg', 'avatars/avatar_male_04_lee_jinwoo.jpg', 'avatars/avatar_male_08_kim_dongwook.jpg', 'avatars/avatar_male_10_han_jinho.jpg'];
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
      const traitKey = ['warm', 'calm', 'lively', 'chic', 'shy'][(h3 >>> 11) % 5];

      // Pick rich narrative archetype
      const archetype = getArchetype(h4, decade, 'male');

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
        bio: `${jobObj.job} 일하며 지내요${jobObj.motif} ${archetype.philosophy.slice(0, 45)}...`,
        speechStyle: `${archetype.speechTone} ${archetype.philosophy}`,
        whyJoined: jobObj.why,
        crushTrigger: archetype.crushTrigger,
        conceptTitle: archetype.title,
        conceptMission: archetype.mission,
        conceptGuidance: archetype.guidance,
        backstory: archetype.backstory,
        philosophy: archetype.philosophy,
        coreWound: archetype.coreWound,
        taboo: archetype.taboo
      });
    }
  });

  return result;
}

// Enrich females with narratives
function enrichFemaleCharacters(females) {
  return females.map((c, i) => {
    const seed = (i * 37 + 101) % 1000;
    const archetype = getArchetype(seed, c.ageDecade || '20', 'female');

    return {
      ...c,
      backstory: c.backstory || archetype.backstory,
      philosophy: c.philosophy || archetype.philosophy,
      coreWound: c.coreWound || archetype.coreWound,
      taboo: c.taboo || archetype.taboo,
      crushTrigger: c.crushTrigger || archetype.crushTrigger,
      // If original concept was plain, enrich with narrative
      speechStyle: c.speechStyle ? (c.speechStyle.includes(archetype.speechTone) ? c.speechStyle : `${c.speechStyle}. ${archetype.speechTone}`) : archetype.speechTone,
      conceptTitle: c.conceptTitle || archetype.title,
      conceptMission: c.conceptMission || archetype.mission,
      conceptGuidance: c.conceptGuidance || archetype.guidance
    };
  });
}

module.exports = {
  CURATED_MALES,
  generateProceduralMales,
  enrichFemaleCharacters,
  NARRATIVE_ARCHETYPES
};

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const charsPath = path.join(root, 'server/services/frontendCharacters.json');
  const raw = fs.readFileSync(charsPath, 'utf8');
  const existing = JSON.parse(raw);

  // Preserve & enrich female characters (1,250)
  const females = existing.filter(c => (c.gender || 'female') === 'female').map(c => ({
    ...c,
    gender: 'female'
  }));
  const enrichedFemales = enrichFemaleCharacters(females);

  const proceduralMales = generateProceduralMales();
  const allMales = [...CURATED_MALES, ...proceduralMales];

  const combined = [...enrichedFemales, ...allMales];

  const idSet = new Set(combined.map(c => c.id));
  if (idSet.size !== combined.length) {
    throw new Error(`Duplicate IDs found! total=${combined.length}, unique=${idSet.size}`);
  }

  fs.writeFileSync(charsPath, JSON.stringify(combined, null, 2), 'utf8');
  console.log(`Successfully synchronized all characters with Deep Life Narratives: Total = ${combined.length} (Female: ${enrichedFemales.length}, Male: ${allMales.length})`);
}
